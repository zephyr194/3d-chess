"""Capture matched native views of the Shanhe Xiangqi frame and landscape."""
import argparse
import importlib.util
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('battlefield_capture', ROOT/'scripts/capture-battlefield-v2.py')
previous = importlib.util.module_from_spec(spec)
spec.loader.exec_module(previous)

def run():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stage',choices=['before','after'],required=True)
    parser.add_argument('--base-url',default='http://127.0.0.1:5173')
    parser.add_argument('--verify',action='store_true')
    args=parser.parse_args()
    out=ROOT/'screenshots/shanhe'/args.stage
    out.mkdir(parents=True,exist_ok=True)
    report={'stage':args.stage,'errors':[],'viewport':[1440,1024]}
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader'])
        page=browser.new_page(viewport={'width':1440,'height':1024},device_scale_factor=1,reduced_motion='reduce')
        def inject(route):
            response=route.fetch()
            interface=previous.common.INSTRUMENT
            if args.stage=='after':
                interface=interface.replace('battlefield.update(time, reducedMotion.matches);','battlefield.update(time, reducedMotion.matches || !ambienceEnabled);')
            route.fulfill(response=response,body=response.text()+interface+previous.EXPOSE)
        page.route('**/src/main.ts*',inject)
        page.route('**/favicon.ico',lambda r:r.fulfill(status=204))
        page.on('pageerror',lambda e:report['errors'].append(str(e)))
        page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
        page.goto(args.base_url,wait_until='networkidle')
        page.wait_for_function('window.__v2')
        page.evaluate('window.__p.pause()')
        default_camera=page.evaluate('window.__p.camera.position.toArray()')
        def snap(name):
            page.evaluate('window.__p.render()')
            page.screenshot(path=str(out/(name+'.png')),full_page=True)
            print('Captured',name,flush=True)
        snap('01-overview')
        page.locator('#landscape-button').click();snap('02-landscape')
        page.locator('#view-button').click()
        reset_camera=page.evaluate('window.__p.camera.position.toArray()')
        report['view_reset']={'returns_default':all(abs(a-b)<1e-6 for a,b in zip(default_camera,reset_camera)),
                              'label':page.locator('#landscape-button').inner_text()}
        page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(500)
        snap('03-mobile')
        report['mobile_overflow']=page.evaluate('document.documentElement.scrollWidth>innerWidth')
        report['board']=page.evaluate('''()=>{const p=window.__p;return {left:p.gridToWorld({x:0,y:4}).toArray(),
          right:p.gridToWorld({x:8,y:4}).toArray(),scales:[...p.pieceGroups.values()].map(g=>g.scale.x)}}''')
        if args.verify:
            assert args.stage=='after'
            page.set_viewport_size({'width':1440,'height':1024});page.wait_for_timeout(300)
            assert '山河弈境' in page.title()
            assert page.locator('h1').inner_text()=='山河弈境'
            assert abs(report['board']['right'][0]-report['board']['left'][0]-35.2)<1e-8
            assert all(abs(s-.68)<1e-8 for s in report['board']['scales'])
            assert not report['mobile_overflow']
            assert report['view_reset']['returns_default'] and report['view_reset']['label']=='战场全景',report['view_reset']
            layout=page.evaluate('''()=>{const b=document.querySelector('.viewport-wrap').getBoundingClientRect(),
              c=document.querySelector('.control-panel').getBoundingClientRect();
              return {board:[b.x,b.y,b.width,b.height],controls:[c.x,c.y,c.width,c.height],separate:c.top>=b.bottom-1}}''')
            assert layout['separate'],layout
            report['layout']=layout
            page.evaluate('window.__p.renderer.setAnimationLoop(null)')
            report['visibility']=page.evaluate('''()=>{
              const p=window.__p,T=p.THREE,blockers=[];p.scene.updateMatrixWorld(true);
              p.battlefield.root.traverse(o=>{if(o.isMesh&&o.visible&&o.material?.visible!==false&&!o.material?.transparent)blockers.push(o)});
              const blocked=[];
              for(const piece of p.getState().pieces){const g=p.pieceGroups.get(piece.id),hits=[];
                for(const h of [.7,1.2,1.8]){const at=g.position.clone().add(new T.Vector3(0,h*.68,0)),v=at.clone().sub(p.camera.position),
                  ray=new T.Raycaster(p.camera.position,v.clone().normalize(),0,v.length()-.05);
                  hits.push(Boolean(ray.intersectObjects(blockers,false)[0]));}
                if(hits.every(Boolean))blocked.push(piece.id);
              }
              return {three_center_rays_blocked:blocked,limit_from_baseline:4};
            }''')
            assert len(report['visibility']['three_center_rays_blocked'])<=4,report['visibility']
            report['motion']=page.evaluate('''()=>{
              const p=window.__p,T=p.THREE,root=p.battlefield.root;
              const canopy=root.getObjectByName('pine-canopy'),trunks=root.getObjectByName('forest-trunks');
              const glint=root.getObjectByName('river-flow-glint'),ripple=root.getObjectByName('lake-ripple'),
                mist=root.getObjectByName('mountain-drift'),leaf=root.getObjectByName('windborne-leaf');
              const sum=a=>a.reduce((v,n,i)=>v+n*(i%17+1),0);
              const pose=()=>({canopy:[...canopy.instanceMatrix.array],trunks:sum([...trunks.instanceMatrix.array]),
                glint:glint.position.toArray(),ripple:ripple.scale.toArray(),mist:mist.position.toArray(),
                leaf:leaf.position.toArray(),leafVisible:leaf.visible,terrain:sum([...p.battlefield.terrain.geometry.attributes.position.array]),
                boat:root.getObjectByName('working-ferry').position.toArray(),pieces:[...p.pieceGroups.values()].map(g=>g.position.toArray())});
              p.battlefield.update(0,true);const rest=pose();p.battlefield.update(700,false);const a=pose();
              p.battlefield.update(1900,false);const b=pose();p.battlefield.update(2600,true);const back=pose();
              p.battlefield.update(9000,true);const still=pose();
              const equal=(x,y)=>JSON.stringify(x)===JSON.stringify(y);
              const changed=['canopy','glint','ripple','mist','leaf'].filter(k=>!equal(a[k],b[k]));
              return {changed,restored:equal(rest,back),reduced_still:equal(back,still),
                support_static:['terrain','boat','pieces','trunks'].every(k=>equal(rest[k],a[k])&&equal(a[k],b[k]))};
            }''')
            assert len(report['motion']['changed'])==5 and report['motion']['restored'] and report['motion']['reduced_still'] and report['motion']['support_static'],report['motion']
            page.emulate_media(reduced_motion='no-preference');page.evaluate('window.__p.pause()')
            page.locator('#ambience-button').click();assert page.locator('#ambience-button').get_attribute('aria-pressed')=='false'
            page.wait_for_timeout(200)
            a=page.evaluate('[...window.__p.battlefield.root.getObjectByName("pine-canopy").instanceMatrix.array]')
            page.wait_for_timeout(250)
            assert a==page.evaluate('[...window.__p.battlefield.root.getObjectByName("pine-canopy").instanceMatrix.array]')
            page.locator('#ambience-button').click();assert page.locator('#ambience-button').get_attribute('aria-pressed')=='true'
            def cell(x,y):return page.locator(f'.tactical-cell[data-x="{x}"][data-y="{y}"]')
            def load(state):
                page.locator('#reset-button').click();page.evaluate('s=>window.__v2.load(s)',state)
                if page.locator('#tactical-panel').is_hidden():page.locator('#tactical-toggle').click()
            def done():page.wait_for_function('!window.__p.getLocked()',timeout=120000)
            def synced():
                assert page.evaluate('window.__p.getState().pieces.every(p=>document.querySelector(`.tactical-cell[data-x="${p.x}"][data-y="${p.y}"]`).dataset.pieceId===p.id)')
            report['pawn_checks']=[]
            for side,y in [('red',4),('black',5)]:
                load(previous.fixture(side=side,start=(2,y)));cell(2,y).click()
                legal=page.evaluate('window.__v2.moves()')
                assert (1,y) in [(m['x'],m['y']) for m in legal] and (3,y) in [(m['x'],m['y']) for m in legal]
                page.locator('#speed-select').select_option('3');cell(3,y).click();done();synced()
                report['pawn_checks'].append({'side':side,'lateral':True,'legal':legal})
            support_watch=previous.common.WATCH.replace('p.battlefield.decks','[p.battlefield.roadGroup,...p.battlefield.decks]')
            report['transport']=[]
            for side,start,target in [('red',(0,9),(0,0)),('black',(0,0),(0,9))]:
                load(previous.fixture(kind='chariot',side=side,start=start));page.evaluate(support_watch,'actor')
                page.locator('#speed-select').select_option('3');cell(*start).click();cell(*target).click();done();synced()
                check=page.evaluate('window.__watch.stop()')
                assert len(check['samples'])>20 and not check['failures'] and not check['gaitFailures'],check['failures'][:5]
                assert any(s['motion']=='riding' for s in check['samples'])
                assert all(abs(s['actor'][1]-.545)<1e-8 and abs(s['scale']-.68)<1e-8 for s in check['samples'])
                report['transport'].append({'side':side,'frames':len(check['samples']),'footprint_rays':len(check['samples'])*9,'unsupported':0,'gait_failures':0})
                print('Verified wider-board transport',side,flush=True)
            load(previous.fixture(kind='soldier',start=(2,4),target=(3,4)))
            at=page.evaluate('window.__p.gridToWorld({x:3,y:4}).toArray()')
            page.evaluate('at=>{const p=window.__p;p.camera.position.set(at[0]+3,at[1]+5,at[2]-7);p.controls.target.set(at[0],at[1]+.5,at[2]);p.controls.update()}',at)
            page.locator('#speed-select').select_option('3');cell(2,4).click();cell(3,4).click()
            page.wait_for_function('window.__v2.rig("actor").phase==="attacking"',timeout=60000)
            page.locator('#speed-select').select_option('0.25')
            page.wait_for_function('window.__v2.rig("actor").progress>.15',timeout=30000)
            assert page.locator('#battle-banner').is_visible()
            report['attack_banner']=page.locator('#battle-banner').inner_text();snap('04-battle-banner')
            page.locator('#speed-select').select_option('3');done();synced()
            assert page.evaluate('window.__v2.rig("actor").impacts')==1
            assert not page.evaluate('window.__p.getState().pieces.some(p=>p.id==="victim")')
            report['capture_banner']=page.locator('#battle-banner').inner_text()
            assert report['capture_banner']!=report['attack_banner']
            load(previous.fixture(kind='soldier',start=(2,4),target=(3,4)))
            page.locator('#speed-select').select_option('3');cell(2,4).click();cell(3,4).click()
            page.wait_for_function('window.__v2.rig("actor").phase==="attacking"',timeout=60000)
            page.locator('#speed-select').select_option('0.25')
            page.locator('#reset-button').click();assert not page.locator('#battle-banner').is_visible()
            page.wait_for_timeout(2300);assert not page.locator('#battle-banner').is_visible()
            assert page.evaluate('window.__p.getState().pieces.length===32&&!window.__p.getLocked()')
            report['reset_cancels_banner']=True
            print('Verified native motion, banner lifecycle and wide-board real moves',flush=True)
        assert not report['errors'],report['errors']
        (out/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
        browser.close()

if __name__=='__main__':run()
