"""Record real browser frames from main and encode gameplay GIFs with FFmpeg."""
import argparse
import hashlib
import importlib.util
import json
import subprocess
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('battlefield_capture',ROOT/'scripts/capture-battlefield-v2.py')
previous=importlib.util.module_from_spec(spec)
spec.loader.exec_module(previous)

def run():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url',default='http://127.0.0.1:5173')
    args=parser.parse_args()
    git=lambda *parts:subprocess.check_output(['git',*parts],cwd=ROOT,text=True).strip()
    assert git('branch','--show-current')=='main','Record the merged main branch'
    subprocess.run(['git','diff','--quiet','HEAD','--','src','index.html','vite.config.ts'],cwd=ROOT,check=True)
    out=ROOT/'screenshots/shanhe/gifs';out.mkdir(parents=True,exist_ok=True)
    report={'commit':git('rev-parse','HEAD'),'source_tree':git('rev-parse','HEAD:src'),
            'recorder_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'viewport':[960,760],'capture':'Native browser frames running application RAF callbacks on a controlled browser clock',
            'fps':8,'timing':'Fixed 125ms browser-clock steps; not a real-time performance recording',
            'clips':[],'errors':[]}
    with sync_playwright() as pw, tempfile.TemporaryDirectory(prefix='shanhe-frames-') as temporary:
        browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader'])
        page=browser.new_page(viewport={'width':960,'height':760},device_scale_factor=1,reduced_motion='no-preference')
        def inject(route):
            response=route.fetch();route.fulfill(response=response,body=response.text()+previous.common.INSTRUMENT+previous.EXPOSE)
        page.route('**/src/main.ts*',inject)
        page.route('**/favicon.ico',lambda r:r.fulfill(status=204))
        page.on('pageerror',lambda e:report['errors'].append(str(e)))
        page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
        page.goto(args.base_url,wait_until='networkidle');page.wait_for_function('window.__v2')
        page.evaluate('window.__p.renderer.setAnimationLoop(null)')
        page.clock.install()
        page.clock.pause_at(datetime.now()+timedelta(seconds=1))
        page.evaluate('window.__p.pause()')
        def press(locator):locator.dispatch_event('click')
        def until(expression,limit=120000,step=125):
            elapsed=0
            while not page.evaluate(expression):
                assert elapsed<limit,expression
                page.clock.run_for(step);elapsed+=step
        def camera(at,target):
            page.evaluate('([at,target])=>{const p=window.__p;p.controls.enableDamping=false;p.camera.position.fromArray(at);p.controls.target.fromArray(target);p.controls.update()}',[at,target])
        def attack_camera(target):
            return page.evaluate('''to=>{
              const p=window.__p,T=p.THREE,state=p.getState(),actor=state.pieces.find(x=>x.id==='actor'),
                path=p.getMarchPath(actor,to,state.pieces,actor.kind),length=path.getLength(),
                from=path.getPointAt(Math.max(0,length-.8)/length),end=p.gridToWorld(to),
                center=from.clone().add(end).multiplyScalar(.5).add(new T.Vector3(0,.55,0)),blockers=[];
              p.scene.updateMatrixWorld(true);
              p.battlefield.root.traverse(o=>{if(o.isMesh&&o.visible&&o.material?.visible!==false&&!o.material?.transparent)blockers.push(o)});
              let best;
              for(const offset of [[4,5,7],[-4,5,7],[4,5,-7],[-4,5,-7],[0,7,4],[0,7,-4],[3,8,0],[-3,8,0]]){
                const at=center.clone().add(new T.Vector3(...offset));let clear=0;
                for(const position of [from,end])for(const h of [.7,1.2,1.8]){
                  const point=position.clone().add(new T.Vector3(0,h*.68,0)),v=point.sub(at),
                    ray=new T.Raycaster(at,v.clone().normalize(),0,v.length()-.05);
                  if(!ray.intersectObjects(blockers,false)[0])clear++;
                }
                if(!best||clear>best.clear)best={at:at.toArray(),target:center.toArray(),clear};
                if(clear===6)break;
              }
              p.controls.enableDamping=false;p.camera.position.fromArray(best.at);p.controls.target.fromArray(best.target);p.controls.update();
              return best;
            }''',{'x':target[0],'y':target[1]})
        def cell(x,y):return page.locator(f'.tactical-cell[data-x="{x}"][data-y="{y}"]')
        def load(state):
            press(page.locator('#reset-button'))
            page.evaluate('s=>window.__v2.load(s)',state)
            if page.locator('#tactical-panel').is_hidden():press(page.locator('#tactical-toggle'))
        captured_durations={}
        def frames(folder,count):
            for _ in range(count):
                page.clock.run_for(125)
                number=len(list(folder.glob('*.png')))
                page.evaluate('window.__p.render()')
                page.screenshot(path=str(folder/f'{number:04d}.png'),animations='disabled')
            captured_durations.setdefault(folder,[]).extend([.125]*count)
        def encode(name,folder,details):
            target=out/(name+'.gif')
            images=sorted(folder.glob('*.png'));durations=captured_durations[folder]
            timeline=['ffconcat version 1.0']
            for frame,duration in zip(images,durations):
                timeline.extend([f"file '{frame.name}'",'option framerate 100',f'duration {duration:.3f}'])
            timeline.extend([f"file '{images[-1].name}'",'option framerate 100'])
            (folder/'frames.ffconcat').write_text('\n'.join(timeline)+'\n')
            subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-safe','0','-i',str(folder/'frames.ffconcat'),
                '-filter_complex','[0:v]split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a',
                '-fps_mode','vfr','-loop','0',str(target)],check=True)
            assert target.stat().st_size>10000
            report['clips'].append({'file':str(target.relative_to(ROOT)),'frames':len(list(folder.glob('*.png'))),
                                    'simulation_seconds':sum(durations),'bytes':target.stat().st_size,**details})
            print('Recorded',name,flush=True)
        folder=Path(temporary)/'landscape';folder.mkdir()
        camera([15,13,17],[2,1,1]);frames(folder,48)
        encode('01-living-landscape',folder,{'scene':'River currents, lake rings, moving canopy, leaves and mountain mist'})

        load(previous.fixture(kind='chariot',start=(0,9)))
        page.locator('#speed-select').select_option('3');press(cell(0,9));press(cell(0,0))
        until('window.__p.pieceGroups.get("actor").userData.marchMotion==="riding"',step=25)
        page.locator('#speed-select').select_option('0.25')
        camera([-5,4,3],[-9.6,.4,0])
        if page.locator('#tactical-panel').is_visible():press(page.locator('#tactical-toggle'))
        folder=Path(temporary)/'ferry';folder.mkdir();frames(folder,64)
        encode('02-ferry-march',folder,{'scene':'Actual chariot rides the ferry and leaves toward its destination'})
        page.locator('#speed-select').select_option('3')
        until('!window.__p.getLocked()')

        folder=Path(temporary)/'combat';folder.mkdir();checks=[]
        cases=[('soldier',(2,4),(3,4)),('horse',(1,7),(2,5)),('chariot',(0,7),(0,6)),
               ('cannon',(1,7),(1,3)),('elephant',(2,9),(4,7)),('advisor',(3,9),(4,8)),('general',(4,9),(4,8))]
        for kind,start,target in cases:
            state=previous.fixture(kind=kind,start=start,target=target)
            if kind in ['advisor','general']:state['pieces'][-1]['kind']='soldier'
            load(state)
            framing=attack_camera(target)
            assert framing['clear']>=4,(kind,framing)
            page.locator('#speed-select').select_option('3');press(cell(*start));press(cell(*target))
            until('window.__v2.rig("actor").phase==="attacking"',step=25)
            page.locator('#speed-select').select_option('0.62')
            if page.locator('#tactical-panel').is_visible():press(page.locator('#tactical-toggle'))
            camera(framing['at'],framing['target'])
            frames(folder,24)
            page.locator('#speed-select').select_option('3')
            until('!window.__p.getLocked()',limit=60000)
            final=page.evaluate('window.__v2.rig("actor")')
            assert final['impacts']==1 and final['phase']=='idle',(kind,final)
            assert page.evaluate('!window.__p.getState().pieces.some(p=>p.id==="victim")')
            page.clock.run_for(150);camera(framing['at'],framing['target']);frames(folder,4)
            checks.append({'kind':kind,'impacts':final['impacts'],'capture_committed':True,'camera_clear_center_rays':framing['clear']})
            print('Recorded combat',kind,flush=True)
        encode('03-seven-troop-attacks',folder,{'scene':'Seven actual model attacks and battle dispatches','captures':checks})
        assert not report['errors'],report['errors']
        assert report['commit']==git('rev-parse','HEAD'),'Source changed during recording'
        subprocess.run(['git','diff','--quiet','HEAD','--','src','index.html','vite.config.ts'],cwd=ROOT,check=True)
        (out/'recording.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
        browser.close()

if __name__=='__main__':run()
