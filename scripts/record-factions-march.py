"""Record actual walk/run actions on plain roads, including the effective gait."""
import argparse
import hashlib
import importlib.util
import json
import subprocess
import tempfile
from datetime import datetime,timedelta
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('v2',ROOT/'scripts/capture-battlefield-v2.py')
v2=importlib.util.module_from_spec(spec);spec.loader.exec_module(v2)


def run():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url',default='http://127.0.0.1:5183')
    args=parser.parse_args();out=ROOT/'screenshots/factions-focus/after'
    source=lambda:{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [*sorted((ROOT/'src').rglob('*.*')),ROOT/'index.html']}
    report={'source_sha256':source(),'errors':[],'clips':[],'method':'Actual application callbacks with controlled browser time, 8fps export, not real-time frame rate'}
    with sync_playwright() as pw,tempfile.TemporaryDirectory(prefix='faction-march-') as temp:
        browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader'])
        page=browser.new_page(viewport={'width':1280,'height':960},reduced_motion='no-preference',device_scale_factor=1)
        def inject(route):
            response=route.fetch();body=response.text().replace('renderer.setAnimationLoop((time) => {','renderer.setAnimationLoop(window.__nativeLoop = (time) => {')
            route.fulfill(response=response,body=body+v2.common.INSTRUMENT+v2.EXPOSE)
        page.route('**/src/main.ts*',inject);page.route('**/favicon.ico',lambda r:r.fulfill(status=204))
        page.on('pageerror',lambda e:report['errors'].append(str(e)))
        page.goto(args.base_url,wait_until='networkidle');page.wait_for_function('window.__v2')
        page.evaluate('''()=>{const p=window.__p,render=p.renderer.render.bind(p.renderer);window.__draw=()=>render(p.scene,p.camera);p.renderer.render=()=>{}}''')
        page.clock.install();page.clock.pause_at(datetime.now()+timedelta(seconds=1));page.evaluate('window.__p.renderer.setAnimationLoop(null);window.__p.renderer.setAnimationLoop(window.__nativeLoop)')
        def press(selector):page.locator(selector).dispatch_event('click')
        for side in ['red','black']:
            folder=Path(temp)/side;folder.mkdir();actions=[]
            start,target=((2,6),(2,5)) if side=='red' else ((2,6),(2,7))
            for pace in ['walk','run']:
                press('#reset-button');page.evaluate('s=>window.__v2.load(s)',v2.fixture(kind='soldier',side=side,start=start))
                if page.locator('#tactical-panel').is_hidden():press('#tactical-toggle')
                page.locator('#pace-select').select_option(pace);page.locator('#speed-select').select_option('1')
                page.evaluate("""()=>{const p=window.__p,T=p.THREE,at=p.pieceGroups.get('actor').position;
                  p.controls.enableDamping=false;p.controls.target.copy(at).y+=.6;
                  p.camera.position.copy(at).add(new T.Vector3(2,4,-5));p.controls.update();p.controls.enableDamping=true;}""")
                press(f'.tactical-cell[data-x="{start[0]}"][data-y="{start[1]}"]');page.clock.run_for(1000);press('#tactical-toggle')
                press(f'.tactical-cell[data-x="{target[0]}"][data-y="{target[1]}"]');effective=[];positions=[]
                for _ in range(24):
                    page.clock.run_for(125)
                    data=page.evaluate('''()=>{const g=window.__p.pieceGroups.get('actor');window.__draw();return {pace:g.userData.pace,motion:g.userData.marchMotion,at:g.position.toArray()}}''')
                    effective.append(data['pace']);positions.append(data['at']);page.screenshot(path=str(folder/f'{len(list(folder.glob("*.png"))):04d}.png'))
                assert pace in effective and positions[0]!=positions[-1],(side,pace,effective)
                actions.append({'requested':pace,'effective':sorted(set(effective)),'start':positions[0],'end':positions[-1]})
            targetfile=out/(side+'-march.gif')
            subprocess.run(['ffmpeg','-v','error','-y','-framerate','8','-i',str(folder/'%04d.png'),'-filter_complex','[0:v]scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a','-loop','0',str(targetfile)],check=True)
            frames=[x for x in subprocess.check_output(['ffmpeg','-v','error','-i',str(targetfile),'-f','framemd5','-'],text=True).splitlines() if x and not x.startswith('#')]
            unique=len({x.rsplit(',',1)[1].strip() for x in frames});assert unique>30
            report['clips'].append({'file':str(targetfile.relative_to(ROOT)),'frames':len(frames),'unique_frames':unique,'actions':actions,'sha256':hashlib.sha256(targetfile.read_bytes()).hexdigest()})
            print('Recorded',side,flush=True)
        assert not report['errors'],report['errors'];assert source()==report['source_sha256']
        (out/'recordings.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');browser.close()

if __name__=='__main__':run()
