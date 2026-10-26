"""Capture both production faction factories on a fixed inspection stage."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('v2', ROOT/'scripts/capture-battlefield-v2.py')
v2=importlib.util.module_from_spec(spec);spec.loader.exec_module(v2)
KINDS=['soldier','horse','chariot','cannon','elephant','advisor','general']

def run():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stage',choices=['before','after'],required=True)
    parser.add_argument('--base-url',required=True)
    args=parser.parse_args()
    out=ROOT/'screenshots/factions-focus'/args.stage;out.mkdir(parents=True,exist_ok=True)
    report={'stage':args.stage,'models':[],'errors':[],'method':'Actual production model factory, separate inspection stage, not a gameplay layout'}
    expected=ROOT if args.stage=='after' else Path('/tmp/factions-baseline')
    report['source_sha256']={str(p.relative_to(expected)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [*sorted((expected/'src').rglob('*.*')),expected/'index.html']}
    report['baseline_commit']='782a93c2bd940a33570f1f84d5ed69410b3bf7f2'
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader'])
        page=browser.new_page(viewport={'width':1440,'height':1024},device_scale_factor=1,reduced_motion='reduce')
        def inject(route):
            response=route.fetch();body=response.text()
            assert ('createCameraFocus' in body)==(args.stage=='after'),'Wrong capture source'
            route.fulfill(response=response,body=body+v2.common.INSTRUMENT+v2.EXPOSE+'\nwindow.__factory={createTroopModel};')
        page.route('**/src/main.ts*',inject)
        page.route('**/favicon.ico',lambda r:r.fulfill(status=204))
        page.on('pageerror',lambda e:report['errors'].append(str(e)))
        page.goto(args.base_url,wait_until='networkidle');page.wait_for_function('window.__factory')
        page.evaluate('window.__p.renderer.setAnimationLoop(null)')
        for side in ['red','black']:
            data=page.evaluate('''side=>{
              const p=window.__p,T=p.THREE,s=new T.Scene();s.background=new T.Color('#b8c4a0');
              s.add(new T.HemisphereLight('#fff4da','#52634c',2.5));
              const sun=new T.DirectionalLight('#fff4d2',3);sun.position.set(-3,8,-6);s.add(sun);
              const plane=new T.Mesh(new T.PlaneGeometry(30,30),new T.MeshStandardMaterial({color:'#9ca980',roughness:1}));
              plane.rotation.x=-Math.PI/2;plane.position.y=.54;s.add(plane);
              const kinds=['soldier','horse','chariot','cannon','elephant','advisor','general'],models=[];
              kinds.forEach((kind,i)=>{
                const model=window.__factory.createTroopModel(kind,side),root=new T.Group();
                model.rotation.y=0;model.position.y=-new T.Box3().setFromObject(model).min.y;
                root.add(model);root.scale.setScalar(.68);root.position.set((i%4-1.5)*2.1,.545,Math.floor(i/4)*3-1.5);root.rotation.y=-.28;s.add(root);
                root.updateMatrixWorld(true);const b=new T.Box3().setFromObject(root);
                models.push({side,kind,scale:root.scale.x,rootY:root.position.y,bounds:{min:b.min.toArray(),max:b.max.toArray()}});
              });
              const c=new T.PerspectiveCamera(32,p.camera.aspect,.1,100);c.position.set(1.5,5,-11);c.lookAt(0,.7,0);c.updateMatrixWorld(true);
              document.querySelector('#status-title').textContent=side==='red'?'红方 · 正规军检阅':'黑方 · 荒野部族检阅';
              document.querySelector('#status-detail').textContent='实际模型工厂 · 同一缩放 · 独立模型检阅，非对局';
              p.renderer.render(s,c);return models;
            }''',side)
            report['models']+=data
            page.screenshot(path=str(out/(side+'-army.png')),full_page=True)
            print('Captured',args.stage,side,flush=True)
        assert not report['errors'],report['errors']
        (out/'models.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
        browser.close()

if __name__=='__main__':run()
