"""Exercise actual game handlers and record native WebGL evidence on a controlled clock."""
import argparse
import hashlib
import importlib.util
import json
import math
import subprocess
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('v2', ROOT / 'scripts/capture-battlefield-v2.py')
v2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v2)

POSE = '''(id='actor')=>{
  const p=window.__p,g=p.pieceGroups.get(id),r=g.userData.locomotionRig,T=p.THREE;
  p.scene.updateMatrixWorld(true);
  return {at:g.position.toArray(),scale:g.scale.x,motion:g.userData.marchMotion,
    phase:g.userData.combatPhase,progress:g.userData.combatProgress,
    legs:r.legs.map(l=>({role:l.role,planted:l.planted,hip:l.hip.rotation.x,knee:l.knee.rotation.x,
      ankle:l.ankle.rotation.x,sole:l.sole.getWorldPosition(new T.Vector3()).toArray()})),
    wheels:r.wheels.map(w=>w.node.quaternion.toArray())};
}'''


def run():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default='http://127.0.0.1:5173')
    parser.add_argument('--record', action='store_true')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    out = args.output or ROOT / 'screenshots/living-troops/after'
    out.mkdir(parents=True, exist_ok=True)
    source_paths = sorted((ROOT / 'src').rglob('*.*')) + [ROOT / 'index.html']
    hashes = lambda: {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in source_paths}
    report = {'source_sha256': hashes(), 'clock': 'Actual application callbacks at controlled browser time, native WebGL frames; not a real-time performance measurement', 'errors': []}
    report_file = out / 'verification.json'
    if not args.record and report_file.exists():
        previous_report=json.loads(report_file.read_text())
        if previous_report.get('source_sha256')==report['source_sha256']:
            report['clips']=previous_report.get('clips',[])
    with sync_playwright() as pw, tempfile.TemporaryDirectory(prefix='living-troops-frames-') as temporary:
        browser = pw.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'])
        page = browser.new_page(viewport={'width': 1280, 'height': 960}, device_scale_factor=1, reduced_motion='no-preference')
        def inject(route):
            response = route.fetch()
            route.fulfill(response=response, body=response.text() + v2.common.INSTRUMENT + v2.EXPOSE + '\nwindow.__living={pan:cameraPan,banner:battleBanner,resetView};')
        page.route('**/src/main.ts*', inject)
        page.route('**/favicon.ico', lambda route: route.fulfill(status=204))
        page.on('pageerror', lambda error: report['errors'].append(str(error)))
        page.on('console', lambda msg: report['errors'].append(msg.text) if msg.type == 'error' else None)
        try:
            page.goto(args.base_url, wait_until='networkidle')
            page.wait_for_function('window.__living')
            page.evaluate('''()=>{window.__metalSchedules=0;const schedule=AudioParam.prototype.setValueAtTime;
              AudioParam.prototype.setValueAtTime=function(value,...args){
                if(value===880)window.__metalSchedules++;return schedule.call(this,value,...args)};}''')
            page.evaluate('''()=>{const p=window.__p,draw=p.renderer.render.bind(p.renderer);
              window.__draw=()=>draw(p.scene,p.camera);p.renderer.render=()=>{};}''')
            page.clock.install()
            page.clock.pause_at(datetime.now() + timedelta(seconds=1))
            def step(ms=125): page.clock.run_for(ms)
            def press(selector): page.locator(selector).dispatch_event('click')
            def cell(pos): return f'.tactical-cell[data-x="{pos[0]}"][data-y="{pos[1]}"]'
            def load(state):
                press('#reset-button')
                page.evaluate('s=>window.__v2.load(s)', state)
                if page.locator('#tactical-panel').is_hidden(): press('#tactical-toggle')
            def until(expression, limit=120000, interval=25):
                for _ in range(math.ceil(limit / interval)):
                    if page.evaluate(expression): return
                    step(interval)
                raise AssertionError('Timed out: ' + expression)
            def camera(at, target):
                page.evaluate('([at,target])=>{const p=window.__p;p.controls.enableDamping=false;p.camera.position.fromArray(at);p.controls.target.fromArray(target);p.controls.update()}', [at, target])
            def clear_camera(ids):
                return page.evaluate('''ids=>{
                  const p=window.__p,T=p.THREE,objects=ids.map(id=>p.pieceGroups.get(id)),
                    center=objects.reduce((sum,g)=>sum.add(g.position),new T.Vector3()).multiplyScalar(1/objects.length).add(new T.Vector3(0,.5,0)),
                    blockers=[];p.scene.updateMatrixWorld(true);
                  p.battlefield.root.traverse(o=>{if(o.isMesh&&o.visible){const materials=Array.isArray(o.material)?o.material:[o.material];
                    if(materials.some(m=>m.visible&&!m.transparent))blockers.push(o)}});
                  let best;
                  for(const offset of [[2.4,2.3,-3.3],[-2.4,2.3,-3.3],[2.4,2.8,3.3],[-2.4,2.8,3.3],[0,4.5,-2.5],[0,4.5,2.5],[3.5,4,0],[-3.5,4,0]]){
                    const at=center.clone().add(new T.Vector3(...offset));let clear=0;
                    for(const g of objects)for(const h of [.18,.55,1.05]){
                      const point=g.position.clone().add(new T.Vector3(0,h*.68,0)),v=point.clone().sub(at),
                        ray=new T.Raycaster(at,v.clone().normalize(),0,v.length()-.04);
                      if(!ray.intersectObjects(blockers,false)[0])clear++;
                    }
                    if(!best||clear>best.clear)best={at:at.toArray(),target:center.toArray(),clear,total:objects.length*3};
                    if(clear===objects.length*3)break;
                  }
                  p.controls.enableDamping=false;p.camera.position.fromArray(best.at);p.controls.target.fromArray(best.target);p.controls.update();
                  return best;
                }''', ids)
            def snap(name):
                page.evaluate('window.__draw()')
                page.screenshot(path=str(out / (name + '.png')), full_page=True)
                print('Captured', name, flush=True)
            def pose(): return page.evaluate(POSE, 'actor')
            def done(): until('!window.__p.getLocked()')
            def frame(folder):
                folder.mkdir(exist_ok=True)
                page.evaluate('window.__draw()')
                page.screenshot(path=str(folder/f'{len(list(folder.glob("*.png"))):04d}.png'))
            def encode(folder,name):
                destination=out/(name+'.gif')
                subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-framerate','8','-i',str(folder/'%04d.png'),
                  '-filter_complex','[0:v]scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a',
                  '-loop','0',str(destination)],check=True)
                decoded=subprocess.check_output(['ffmpeg','-v','error','-i',str(destination),'-f','framemd5','-'],text=True)
                lines=[line for line in decoded.splitlines() if line and not line.startswith('#')]
                hashes={line.rsplit(',',1)[1].strip() for line in lines}
                assert len(hashes)>3,(name,len(hashes))
                info={'file':str(destination.relative_to(ROOT)),'frames':len(lines),'unique_frames':len(hashes),
                  'seconds':len(lines)/8,'bytes':destination.stat().st_size,'sha256':hashlib.sha256(destination.read_bytes()).hexdigest()}
                report.setdefault('clips',[]).append(info)
                print('Recorded',name,flush=True)
            snap('01-overview')
            report['keyboard'] = []
            page.locator('#game-canvas').focus()
            def camera_pose(): return page.evaluate('({at:window.__p.camera.position.toArray(),target:window.__p.controls.target.toArray()})')
            def displacement(a, b): return [b['target'][i] - a['target'][i] for i in range(3)]
            def size(v): return math.sqrt(sum(x*x for x in v))
            for yaw in [0, math.pi/2]:
                for key in ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']:
                    camera([12*math.sin(yaw), 9, 12*math.cos(yaw)], [0, .5, 0])
                    before = camera_pose()
                    page.keyboard.down(key); step(300); page.keyboard.up(key)
                    after = camera_pose(); delta = displacement(before, after)
                    assert size(delta) > .5 and abs(delta[1]) < 1e-8, (key, delta)
                    assert all(abs((after['at'][i]-after['target'][i])-(before['at'][i]-before['target'][i])) < 1e-7 for i in range(3)), (key, before, after)
                    x = delta[0]*math.cos(yaw)-delta[2]*math.sin(yaw)
                    forward = -delta[0]*math.sin(yaw)-delta[2]*math.cos(yaw)
                    assert {'w':forward>0,'ArrowUp':forward>0,'s':forward<0,'ArrowDown':forward<0,
                            'd':x>0,'ArrowRight':x>0,'a':x<0,'ArrowLeft':x<0}[key], (key, delta)
                    report['keyboard'].append({'key': key, 'yaw': yaw, 'delta': delta, 'orbit_preserved': True})
            distances = []
            for keys in [('w',), ('w','d')]:
                camera([0,9,12], [0,.5,0]); before = camera_pose()
                for key in keys: page.keyboard.down(key)
                step(300)
                for key in keys: page.keyboard.up(key)
                distances.append(size(displacement(before,camera_pose())))
            assert abs(distances[0]-distances[1]) < .1, distances
            report['diagonal_distances'] = distances
            for selector, key in [('#speed-select','ArrowDown'), ('#music-volume','ArrowRight')]:
                if selector == '#music-volume': page.locator('.sound-settings').evaluate('(e)=>e.open=true')
                page.locator(selector).focus(); step(150); before=camera_pose()
                page.keyboard.press(key); step(250)
                after=camera_pose()
                report.setdefault('form_guards',[]).append({'selector':selector,'before':before,'after':after})
                assert size(displacement(before,after)) < 1e-8, (selector,before,after)
            page.locator('.sound-settings').evaluate('(e)=>e.open=false')
            page.locator('#game-canvas').focus(); page.keyboard.down('w');step(100)
            page.evaluate('window.dispatchEvent(new Event("blur"))');before=camera_pose();step(300);page.keyboard.up('w')
            assert size(displacement(before,camera_pose())) < 1e-8
            press('#view-button');step(50)
            reset = camera_pose();press('#view-button');step(50)
            assert size(displacement(reset,camera_pose())) < 1e-8
            report['focus_blur_reset'] = True
            print('Verified keyboard camera controls', flush=True)

            motion_snapshot = '''()=>{
              const p=window.__p,r=p.battlefield.root,match=name=>{
                const result=[];r.traverse(o=>{if(o.name===name)result.push(o)});return result;};
              const part=o=>({at:o.position.toArray(),scale:o.scale.toArray(),visible:o.visible,
                matrix:o.instanceMatrix?Array.from(o.instanceMatrix.array.slice(0,64)):null,
                vertices:o.name==='cascade-whitewater'?Array.from(o.geometry.attributes.position.array):null});
              const sum=array=>array.reduce((v,n,i)=>v+n*(i%17+1),0);
              return {cascade:match('cascade-whitewater').map(part),
                river:match('river-flow-glint').map(part),pine:part(match('pine-canopy')[0]),
                reeds:part(match('meadow-reeds')[0]),ripple:part(match('lake-ripple')[0]),
                mist:part(match('mountain-drift')[0]),leaf:part(match('windborne-leaf')[0]),
                support:{terrain:sum(p.battlefield.terrain.geometry.attributes.position.array),
                  boat:r.getObjectByName('working-ferry').position.toArray(),
                  pieces:[...p.pieceGroups.values()].map(g=>g.position.toArray())}};
            }'''
            before=page.evaluate(motion_snapshot);step(200);after=page.evaluate(motion_snapshot)
            changed=[name for name in ['cascade','river','pine','reeds','ripple','mist','leaf'] if before[name]!=after[name]]
            downward=sum(b['at'][1]<a['at'][1] for a,b in zip(before['cascade'],after['cascade']))
            assert len(changed)==7 and downward>=8 and before['support']==after['support'],(changed,downward)
            press('#ambience-button');step(50);rest=page.evaluate(motion_snapshot);step(300)
            assert rest==page.evaluate(motion_snapshot)
            press('#ambience-button');page.emulate_media(reduced_motion='reduce');step(50)
            reduced=page.evaluate(motion_snapshot);step(300)
            assert reduced==page.evaluate(motion_snapshot)
            page.emulate_media(reduced_motion='no-preference');step(125)
            report['atmosphere']={'moving':changed,'descending_traces':downward,'total_traces':len(after['cascade']),
              'support_static':True,'ambience_off_frozen':True,'reduced_motion_frozen':True}
            camera([1,6,10],[5.6,3.2,0]);snap('02-waterfall')
            if args.record:
                folder=Path(temporary)/'waterfall'
                for _ in range(32):step(125);frame(folder)
                encode(folder,'06-waterfall-and-breeze')
            print('Verified native downward waterfall and wind, off and reduced motion',flush=True)
            report['metal_audio']=page.evaluate('''async()=>{
              const {playMetalClash}=await import('/src/game/metal-impact.ts'),
                audio=new OfflineAudioContext(1,22050,44100);
              playMetalClash(audio);const buffer=await audio.startRendering(),data=buffer.getChannelData(0);
              const rms=(a,b)=>Math.sqrt(data.slice(a,b).reduce((sum,x)=>sum+x*x,0)/(b-a));
              return {early_rms:rms(0,4410),tail_rms:rms(15435,22050),
                peak:data.reduce((max,x)=>Math.max(max,Math.abs(x)),0)};
            }''')
            assert report['metal_audio']['early_rms']>.005 and report['metal_audio']['tail_rms']<1e-6 and report['metal_audio']['peak']<.9

            report['troops'] = []
            cases = [('soldier',(2,6),(2,5)), ('horse',(1,7),(2,5)), ('chariot',(0,7),(0,6)),
                     ('cannon',(1,7),(1,6)), ('elephant',(2,9),(4,7)), ('advisor',(3,9),(4,8)), ('general',(4,9),(4,8))]
            for kind,start,target in cases:
                load(v2.fixture(kind=kind,start=start))
                page.locator('#speed-select').select_option('0.62' if args.record else '1')
                press(cell(start));press(cell(target))
                assert page.evaluate('window.__p.getLocked()'), (kind, 'move rejected')
                samples=[]
                for _ in range(16):
                    step(125 if args.record else 50);samples.append(pose())
                    if args.record:
                        clear_camera(['actor'])
                        if page.locator('#tactical-panel').is_visible():press('#tactical-toggle')
                        frame(Path(temporary)/'marches')
                count = 4 if kind in ['horse','elephant'] else 2 if kind in ['soldier','general','advisor'] else 0
                assert all(len(s['legs'])==count and abs(s['at'][1]-.545)<1e-8 and s['scale']==.68 for s in samples),kind
                if count:
                    assert any(abs(samples[i]['legs'][0]['knee']-samples[i-1]['legs'][0]['knee'])>.01 for i in range(1,len(samples))),kind
                    assert any(not leg['planted'] for s in samples for leg in s['legs']),kind
                    assert all(leg['sole'][1] >= .54-.006 for s in samples for leg in s['legs']), (kind, min(leg['sole'][1] for s in samples for leg in s['legs']))
                    planted=[abs(leg['sole'][1]-.545) for s in samples for leg in s['legs'] if leg['planted']]
                    assert max(planted,default=0)<.01, (kind, max(planted))
                else:
                    assert samples[0]['wheels']!=samples[-1]['wheels'],kind
                framing=clear_camera(['actor'])
                if page.locator('#tactical-panel').is_visible():press('#tactical-toggle')
                snap('troop-'+kind)
                page.locator('#speed-select').select_option('3');done()
                final=pose()
                assert final['motion']=='idle' and all(l['planted'] for l in final['legs']),kind
                assert page.evaluate('([x,y])=>{const p=window.__p,g=p.pieceGroups.get("actor");return g.position.distanceTo(p.gridToWorld({x,y}))<1e-8}',target),kind
                report['troops'].append({'kind':kind,'frames':len(samples),'legs':count,'lowest_sole':min((l['sole'][1] for s in samples for l in s['legs']),default=None),'max_planted_error':max((abs(l['sole'][1]-.545) for s in samples for l in s['legs'] if l['planted']),default=None),'arrived':True,'framing':framing})
                print('Verified locomotion',kind,flush=True)
            if args.record:encode(Path(temporary)/'marches','07-seven-troop-marches')

            report['ferry'] = []
            for side,start,target in [('red',(0,9),(0,0)),('black',(0,0),(0,9))]:
                load(v2.fixture(kind='chariot',side=side,start=start))
                watch=v2.common.WATCH.replace('p.battlefield.decks','[p.battlefield.roadGroup,...p.battlefield.decks]')
                old_wheels='const wheels = (actor.userData.wheels ?? []).flatMap(wheel => wheel.quaternion.toArray());'
                assert old_wheels in watch
                watch=watch.replace(old_wheels,'const wheels = actor.userData.locomotionRig.wheels.flatMap(wheel => wheel.node.quaternion.toArray());')
                page.evaluate(watch,'actor')
                page.locator('#speed-select').select_option('3');press(cell(start));press(cell(target))
                done();check=page.evaluate('window.__watch.stop()')
                assert len(check['samples'])>20 and not check['failures'] and not check['gaitFailures'],check['failures'][:3]
                assert any(s['motion']=='riding' for s in check['samples'])
                assert all(len(s['wheels'])==16 for s in check['samples'])
                report['ferry'].append({'side':side,'frames':len(check['samples']),'support_rays':len(check['samples'])*9,'unsupported':0,'gait_failures':0})
            print('Verified bidirectional ferry support and frozen wheels',flush=True)

            report['combat'] = []
            for kind,start,target in [('soldier',(2,4),(3,4)),('horse',(1,7),(2,5)),('chariot',(0,7),(0,6)),
                                      ('cannon',(1,7),(1,3)),('elephant',(2,9),(4,7)),('advisor',(3,9),(4,8)),('general',(4,9),(4,8))]:
                state=v2.fixture(kind=kind,start=start,target=target)
                if kind in ['advisor','general']:state['pieces'][-1]['kind']='soldier'
                load(state);page.locator('#speed-select').select_option('3');press(cell(start));press(cell(target))
                until('window.__v2.rig("actor").phase==="attacking"')
                page.evaluate('window.__metalSchedules=0')
                assert page.locator('#battle-banner').is_visible()
                engage = page.locator('#battle-banner').get_attribute('data-event')
                until('window.__v2.rig("actor").impacts===1',interval=8)
                assert 'impact' in page.locator('#battle-banner').get_attribute('class'),kind
                if kind=='soldier':
                    report['battle_framing']=clear_camera(['actor','victim'])
                    if page.locator('#tactical-panel').is_visible():press('#tactical-toggle')
                    page.locator('#battle-banner').evaluate('''(e)=>e.getAnimations({subtree:true}).forEach(a=>{
                      a.pause();a.currentTime=['metal-jolt','metal-flash','metal-sheen','metal-spark'].includes(a.animationName)?70:a.effect.getTiming().duration})''')
                    snap('04-metal-battle-banner')
                    report['banner_bounds']=page.locator('#battle-banner').bounding_box()
                    page.locator('#battle-banner').evaluate('(e)=>e.getAnimations({subtree:true}).forEach(a=>a.play())')
                    if args.record:
                        folder=Path(temporary)/'battle'
                        for _ in range(16):step(125);frame(folder)
                        encode(folder,'08-metal-impact')
                done()
                assert page.evaluate('window.__v2.rig("actor").impacts===1&&!window.__p.getState().pieces.some(p=>p.id==="victim")'),kind
                metal=page.evaluate('window.__metalSchedules')
                assert metal==(0 if kind in ['advisor','elephant'] else 1),(kind,metal)
                report['combat'].append({'kind':kind,'engage':engage,'impacts':1,'captured':True,'metal_strikes':metal})
            press('#sound-button')
            load(v2.fixture(kind='soldier',start=(2,4),target=(3,4)))
            page.evaluate('window.__metalSchedules=0')
            page.locator('#speed-select').select_option('3');press(cell((2,4)));press(cell((3,4)));done()
            assert page.evaluate('window.__metalSchedules')==0
            report['sound_off_mutes_metal']=True
            press('#sound-button')
            load(v2.fixture(kind='soldier',start=(2,4),target=(3,4)))
            page.locator('#speed-select').select_option('3');press(cell((2,4)));press(cell((3,4)))
            until('window.__v2.rig("actor").phase==="attacking"')
            press('#reset-button');step(4000)
            assert page.locator('#battle-banner').is_hidden() and page.evaluate('window.__p.getState().pieces.length===32&&!window.__p.getLocked()')
            report['reset_cancels_combat'] = True
            page.set_viewport_size({'width':390,'height':844});step(300)
            page.evaluate('window.__living.banner.show({kind:"engage",side:"red",actor:"soldier",target:"horse"})')
            snap('05-mobile-banner')
            assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
            box=page.locator('#battle-banner').bounding_box()
            assert box['x']>=0 and box['x']+box['width']<=390 and box['height']<=110,box
            page.emulate_media(reduced_motion='reduce')
            page.evaluate('window.__living.banner.impact()');step(50)
            assert page.locator('.banner-sparks').evaluate('(e)=>getComputedStyle(e).display')=='none'
            report['mobile_reduced_motion'] = True
            assert not report['errors'],report['errors']
            assert hashes()==report['source_sha256'],'Product source changed during verification'
            report['status']='PASS'
        except Exception as error:
            report['status']='FAIL'
            report['failure']=str(error)
            raise
        finally:
            report_file.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
            browser.close()


if __name__ == '__main__':
    run()
