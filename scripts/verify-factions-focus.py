"""Exercise piece focus, faction movement and audio event timing on the actual board."""
import argparse
import hashlib
import importlib.util
import json
import math
import subprocess
import tempfile
from datetime import datetime,timedelta
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('v2',ROOT/'scripts/capture-battlefield-v2.py')
v2=importlib.util.module_from_spec(spec);spec.loader.exec_module(v2)
EXPOSE='''
window.__f={cameraFocus,audio,drums};
window.__cues=[];
const originalPlay=audio.play.bind(audio);
audio.play=cue=>{window.__cues.push({at:performance.now(),...cue});originalPlay(cue)};
'''

def run():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url',default='http://127.0.0.1:5180')
    parser.add_argument('--record',action='store_true')
    parser.add_argument('--rate',choices=['1','3'],default='1')
    parser.add_argument('--resume-marches',action='store_true')
    args=parser.parse_args()
    out=ROOT/'screenshots/factions-focus/after';out.mkdir(parents=True,exist_ok=True)
    source=lambda:{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [*sorted((ROOT/'src').rglob('*.*')),ROOT/'index.html']}
    report={'errors':[],'checks':[],'marches':[],'source_sha256':source(),'capture_method':'Native application callbacks on controlled browser time; not real-time frame rate'}
    with sync_playwright() as pw,tempfile.TemporaryDirectory(prefix='factions-focus-') as temp:
        browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader'])
        page=browser.new_page(viewport={'width':1280,'height':960},device_scale_factor=1,reduced_motion='no-preference')
        def inject(route):
            response=route.fetch();route.fulfill(response=response,body=response.text().replace("renderer.setAnimationLoop((time) => {", "renderer.setAnimationLoop(window.__nativeLoop = (time) => {")+v2.common.INSTRUMENT+v2.EXPOSE+EXPOSE)
        page.route('**/src/main.ts*',inject);page.route('**/favicon.ico',lambda r:r.fulfill(status=204))
        page.on('pageerror',lambda e:report['errors'].append(str(e)))
        page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
        page.goto(args.base_url,wait_until='networkidle');page.wait_for_function('window.__f')
        page.evaluate('''()=>{const p=window.__p,draw=p.renderer.render.bind(p.renderer);window.__draw=()=>draw(p.scene,p.camera);p.renderer.render=()=>{}}''')
        page.clock.install();page.clock.pause_at(datetime.now()+timedelta(seconds=1))
        page.evaluate("window.__p.renderer.setAnimationLoop(null);window.__p.renderer.setAnimationLoop(window.__nativeLoop)")
        def step(ms=50):page.clock.run_for(ms)
        def press(selector):page.locator(selector).dispatch_event('click')
        def cell(pos):return f'.tactical-cell[data-x="{pos[0]}"][data-y="{pos[1]}"]'
        def load(state):
            press('#reset-button');page.evaluate('s=>window.__v2.load(s)',state)
            if page.locator('#tactical-panel').is_hidden():press('#tactical-toggle')
            page.evaluate('window.__cues=[]')
        def until(expr,limit=180000):
            for _ in range(math.ceil(limit/50)):
                if page.evaluate(expr):return
                step()
            raise AssertionError(expr)
        def draw(name):page.evaluate('window.__draw()');page.screenshot(path=str(out/(name+'.png')),full_page=True)
        def point(id):
            return page.evaluate('''id=>{const p=window.__p,T=p.THREE,g=p.pieceGroups.get(id);p.camera.updateMatrixWorld(true);p.scene.updateMatrixWorld(true);
              const at=g.position.clone().add(new T.Vector3(0,.7,0)).project(p.camera),b=p.renderer.domElement.getBoundingClientRect();
              return {x:b.x+(at.x+1)*b.width/2,y:b.y+(1-at.y)*b.height/2};}''',id)
        def tap(id):
            at=point(id);page.mouse.click(at['x'],at['y']);step(1000)
        def aligned(id):
            return page.evaluate('''id=>{const p=window.__p,g=p.pieceGroups.get(id);return p.controls.target.distanceTo(g.position.clone().add(new p.THREE.Vector3(0,.6,0)))<.03}''',id)
        def visibility(id):
            return page.evaluate("""id=>{const p=window.__p,T=p.THREE,g=p.pieceGroups.get(id);p.scene.updateMatrixWorld(true);let clear=0;
              for(const h of [.2,.7,1.25]){const d=g.position.clone().add(new T.Vector3(0,h*.68,0)).sub(p.camera.position),ray=new T.Raycaster(p.camera.position,d.clone().normalize(),0,d.length()-.12);
                if(!ray.intersectObject(p.battlefield.root,true).some(hit=>{const m=hit.object;if(!m.isMesh||!m.visible)return false;const ms=Array.isArray(m.material)?m.material:[m.material];return ms.some(x=>x.visible&&(!x.transparent||x.opacity>.8))}))clear++;
              }return clear;}""",id)
        state=v2.fixture(kind='soldier',start=(2,6));load(state)
        tap('actor');print("Canvas focus checked",flush=True);assert page.evaluate('window.__f.cameraFocus.id')=='actor';assert aligned('actor')
        assert page.evaluate('window.__p.getSelected()')=='actor'
        assert visibility('actor')==3
        draw('01-red-focused');report['checks'].append('Native canvas click selects and focuses red piece')
        press('#release-focus');assert page.evaluate('window.__f.cameraFocus.id') is None
        press('#view-button');tap('bg');assert page.evaluate('window.__f.cameraFocus.id')=='bg'
        assert page.evaluate('window.__p.getSelected()')=='actor'
        assert page.evaluate('window.__p.getState().turn')=='red'
        report['checks'].append('Enemy focus preserves selected ally and turn')
        page.keyboard.press('Escape');assert page.evaluate('window.__f.cameraFocus.id') is None
        press(cell((2,6)));step(1000)
        page.locator('#game-canvas').focus();page.keyboard.down('KeyD');step(150);page.keyboard.up('KeyD')
        assert page.evaluate('window.__f.cameraFocus.id') is None;report['checks'].append('WASD and Escape release focus')
        press(cell((2,6)));step(1000)
        b=page.locator('#game-canvas').bounding_box();page.mouse.move(b['x']+b['width']/2,b['y']+b['height']/2);page.mouse.down();page.mouse.move(b['x']+b['width']/2+40,b['y']+b['height']/2,steps=3);page.mouse.up();step(100)
        assert page.evaluate('window.__f.cameraFocus.id') is None;report['checks'].append('Drag releases focus')
        cases=[('soldier',(2,6),(2,5)),('horse',(1,7),(2,5)),('chariot',(0,7),(0,6)),('cannon',(1,7),(1,6)),('elephant',(2,9),(4,7)),('advisor',(3,9),(4,8)),('general',(4,9),(4,8))]
        jobs=[(side,kind,start,target,pace) for side in ['red','black'] for kind,start,target in cases for pace in ['walk','run']]
        if args.resume_marches:
            cached=json.loads((out/'march-checkpoint.json').read_text())
            assert cached['source_sha256']==report['source_sha256'] and len(cached['marches'])==28
            assert all(x['rate']==float(args.rate) for x in cached['marches'])
            report['marches']=cached['marches'];jobs=[]
            report['marches_resumed_from']='march-checkpoint.json'
        for side,kind,redstart,redtarget,pace in jobs:
            start,target=(redstart,redtarget) if side=='red' else ((redstart[0],9-redstart[1]),(redtarget[0],9-redtarget[1]))
            fixture=v2.fixture(kind=kind,side=side,start=start)
            for piece in fixture['pieces']:
                if piece['id']=='bg':piece['x']=5
                if kind=='general' and piece['id']=='rg':piece['x']=3
            load(fixture);page.locator('#pace-select').select_option(pace);page.locator('#speed-select').select_option(args.rate)
            press(cell(start));step(1000);press(cell(target));t=page.evaluate('performance.now()');samples=[]
            for i in range(600):
                step(200)
                sample=page.evaluate('''()=>{const p=window.__p,T=p.THREE,g=p.pieceGroups.get('actor'),r=g.userData.locomotionRig;
                  p.scene.updateMatrixWorld(true);return {root:g.position.toArray(),scale:g.scale.x,cycle:r.cycle,pace:r.pace,motion:g.userData.marchMotion,
                  feet:r.legs.map(l=>({p:l.sole.getWorldPosition(new T.Vector3()).toArray(),planted:l.planted})),focused:window.__f.cameraFocus.id,
                  targetError:p.controls.target.distanceTo(g.position.clone().add(new T.Vector3(0,.6,0)))} }''')
                assert sample['root'][1]==.545 and sample['scale']==.68,sample
                assert min((l['p'][1] for l in sample['feet']),default=.545)>=.54499,sample
                assert sample['focused']=='actor' and sample['targetError']<.12,sample
                samples.append(sample)
                if not page.evaluate('window.__p.getLocked()'):break
            else:raise AssertionError('Move did not finish')
            duration=(page.evaluate('performance.now()')-t)/1000
            assert page.evaluate('window.__p.getState().pieces.find(p=>p.id==="actor").y')==target[1]
            print('March checked',side,kind,pace,round(duration,2),flush=True)
            report['marches'].append({'side':side,'kind':kind,'pace':pace,'rate':float(args.rate),'seconds':duration,'samples':len(samples),'max_target_error':max(s['targetError'] for s in samples)})
            (out/'march-checkpoint.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
            if side=='black' and kind=='soldier' and pace=='walk':draw('02-black-focused')
        for side in ['red','black']:
            for kind,_,_ in cases:
                times={x['pace']:x['seconds'] for x in report['marches'] if x['side']==side and x['kind']==kind}
                assert times['run']<times['walk'],(side,kind,times)
        load(v2.fixture(kind='soldier',start=(2,4),target=(2,3)))
        page.locator('#speed-select').select_option('3');press(cell((2,4)));step(1000)
        tap('victim');assert page.evaluate('window.__p.getLocked()')
        until('!window.__p.getLocked()')
        assert not page.evaluate('window.__p.getState().pieces.some(p=>p.id==="victim")')
        cues=page.evaluate('window.__cues');swing=next(i for i,c in enumerate(cues) if c['kind']=='swing');impact=next(i for i,c in enumerate(cues) if c['kind']=='impact')
        assert swing<impact,cues;report['checks'].append('Native legal capture click still captures; swing precedes exactly one impact')
        assert sum(c['kind']=='impact' for c in cues)==1
        load(v2.fixture(kind='chariot',start=(0,4)))
        page.locator('#pace-select').select_option('run');page.locator('#speed-select').select_option('3')
        page.evaluate("""()=>{
          const p=window.__p,T=p.THREE,report={riding:0,waiting:0,rays:0,failures:[],wheelFailures:0,boatSpeeds:[]};
          let active=true,previous;
          const tick=()=>{if(!active)return;const g=p.pieceGroups.get('actor'),boat=p.battlefield.root.getObjectByName('working-ferry'),r=g.userData.locomotionRig,m=g.userData.marchMotion;
            if(m==='riding'||m==='waiting'){
              report[m]++;g.updateMatrixWorld(true);boat.updateMatrixWorld(true);
              if(m==='riding')for(let i=0;i<9;i++){
                const radius=i===8?0:.44,x=g.position.x+Math.cos(i*Math.PI/4)*radius,z=g.position.z+Math.sin(i*Math.PI/4)*radius;
                const ray=new T.Raycaster(new T.Vector3(x,.565,z),new T.Vector3(0,-1,0),0,.08);report.rays++;
                if(!ray.intersectObject(boat,true).some(hit=>Math.abs(hit.point.y-.54)<.006))report.failures.push([x,z]);
              }
              const wheels=r.wheels.flatMap(w=>w.node.quaternion.toArray());
              if(previous?.motion===m&&wheels.some((v,i)=>Math.abs(v-previous.wheels[i])>1e-8))report.wheelFailures++;
              const now=performance.now();if(previous?.motion==='riding'&&m==='riding'&&now>previous.time)report.boatSpeeds.push(Math.abs(boat.position.z-previous.z)/(now-previous.time)*1000/3);
              previous={motion:m,wheels,time:now,z:boat.position.z};
            }else previous=null;
            requestAnimationFrame(tick);
          };requestAnimationFrame(tick);window.__ferryStop=()=>{active=false;return report};
        }""")
        press(cell((0,4)));press(cell((0,5)));until('!window.__p.getLocked()')
        ferry=page.evaluate('window.__ferryStop()');assert ferry['riding']>20 and ferry['waiting']>5,ferry
        assert ferry['rays']>100 and not ferry['failures'] and not ferry['wheelFailures'],ferry
        speeds=sorted(ferry.pop('boatSpeeds'));ferry['median_boat_speed']=speeds[len(speeds)//2];assert abs(ferry['median_boat_speed']-2.6)<.01,ferry
        report['ferry']=ferry;report['checks'].append('Run pace preserves ferry speed, physical deck support and frozen wheels')
        press('summary');page.locator('#effects-volume').fill('0');page.locator('#music-volume').fill('64')
        levels=page.evaluate('window.__f.audio.levels');assert levels=={'effects':0,'music':.64},levels
        page.locator('#effects-volume').fill('75');press('#sound-button');assert not page.evaluate('window.__f.audio.enabled')
        press('#sound-button');assert page.evaluate('window.__f.audio.enabled')
        report['checks'].append('Independent effects/music volume and live mute controls')
        winner={'pieces':[{'id':'rg','side':'red','kind':'general','x':4,'y':9},{'id':'bg','side':'black','kind':'general','x':4,'y':0},{'id':'actor','side':'red','kind':'chariot','x':4,'y':1}], 'turn':'red','winner':None}
        load(winner);press(cell((4,1)));press(cell((4,0)));until('!window.__p.getLocked()')
        assert page.evaluate('window.__p.getState().winner')=='red'
        assert page.evaluate('window.__cues.filter(c=>c.kind==="victory").length')==1
        assert page.evaluate('window.__f.drums.finished');draw('03-victory');report['checks'].append('Actual general capture triggers one victory fanfare and stops battle drums')
        press('#reset-button');assert page.evaluate('window.__f.cameraFocus.id') is None
        assert page.evaluate('window.__f.audio.voices.size')==0 and not page.evaluate('window.__f.drums.finished')
        report['checks'].append('Reset cancels focus and scheduled victory sounds')
        if args.record:
            for side in ['red','black']:
                folder=Path(temp)/side;folder.mkdir()
                start,target=((2,6),(2,5)) if side=='red' else ((2,6),(2,7))
                for pace in ['walk','run']:
                    load(v2.fixture(kind='soldier',side=side,start=start));page.locator('#pace-select').select_option(pace);page.locator('#speed-select').select_option('1')
                    press(cell(start));step(1000);press('#tactical-toggle');press(cell(target))
                    for _ in range(24):
                        step(125);page.evaluate('window.__draw()');page.screenshot(path=str(folder/f'{len(list(folder.glob("*.png"))):04d}.png'))
                targetfile=out/(side+'-march.gif')
                subprocess.run(['ffmpeg','-v','error','-y','-framerate','8','-i',str(folder/'%04d.png'),'-filter_complex','[0:v]scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a','-loop','0',str(targetfile)],check=True)
                frames=[x for x in subprocess.check_output(['ffmpeg','-v','error','-i',str(targetfile),'-f','framemd5','-'],text=True).splitlines() if x and not x.startswith('#')]
                unique=len({x.rsplit(',',1)[1].strip() for x in frames});assert unique>30
                report.setdefault('clips',[]).append({'file':str(targetfile.relative_to(ROOT)),'frames':len(frames),'unique_frames':unique,'sha256':hashlib.sha256(targetfile.read_bytes()).hexdigest()})
        page.set_viewport_size({'width':390,'height':844});step(200)
        load(v2.fixture(kind='soldier',side='black',start=(2,3)));press(cell((2,3)));step(1000)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert page.locator('#piece-focus').is_visible();draw('04-mobile-focus')
        report['checks'].append('390px viewport has focus controls and no horizontal overflow')
        assert not report['errors'],report['errors']
        assert source()==report['source_sha256'],'Source changed during verification; rerun final check'
        report['status']='PASS'
        (out/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps(report,ensure_ascii=False,indent=2))
        browser.close()

if __name__=='__main__':run()
