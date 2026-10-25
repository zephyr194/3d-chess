"""Capture the actual troop factory and UI for the seven troop identity iteration."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('v2',ROOT/'scripts/capture-battlefield-v2.py')
v2=importlib.util.module_from_spec(spec)
spec.loader.exec_module(v2)
KINDS=['soldier','horse','chariot','cannon','elephant','advisor','general']


def run():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stage',choices=['before','after'],required=True)
    parser.add_argument('--base-url',default='http://127.0.0.1:5173')
    args=parser.parse_args()
    baseline_ref='047a50b72123956333b4ce14f59955ed344dcac2'
    out=ROOT/'screenshots/troop-identity'/args.stage
    out.mkdir(parents=True,exist_ok=True)
    report={'stage':args.stage,'viewport':[1280,960],'errors':[],'models':[]}
    if args.stage=='before':report['baseline_commit']=baseline_ref
    source=lambda:{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [*sorted((ROOT/'src').rglob('*.*')),ROOT/'index.html']}
    if args.stage=='after':report['source_sha256']=source()
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader'])
        page=browser.new_page(viewport={'width':1280,'height':960},device_scale_factor=1,reduced_motion='reduce')
        def inject(route):
            response=route.fetch()
            if args.stage=='before':assert 'createTroopDetails' not in response.text(),'Baseline server is serving the modified troop factory'
            route.fulfill(response=response,body=response.text()+v2.common.INSTRUMENT+v2.EXPOSE+'\nwindow.__identity={createTroopModel};')
        page.route('**/src/main.ts*',inject)
        page.route('**/favicon.ico',lambda r:r.fulfill(status=204))
        page.on('pageerror',lambda error:report['errors'].append(str(error)))
        page.goto(args.base_url,wait_until='networkidle')
        page.wait_for_function('window.__identity')
        page.evaluate('window.__p.renderer.setAnimationLoop(null)')
        for kind in KINDS:
            page.evaluate('s=>window.__v2.load(s)',v2.fixture(kind=kind,start=(2,6)))
            data=page.evaluate('''()=>{
              const p=window.__p,T=p.THREE,g=p.pieceGroups.get('actor'),at=g.position;
              p.controls.enableDamping=false;p.camera.position.set(at.x+1.9,at.y+1.7,at.z-3.0);
              p.controls.target.set(at.x,at.y+.55,at.z);p.controls.update();
              p.scene.updateMatrixWorld(true);
              const bounds=new T.Box3().setFromObject(g.userData.troop),nodes=[];
              g.traverse(o=>{if(o.name)nodes.push(o.name)});p.render();
              return {bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},root:g.position.toArray(),scale:g.scale.x,nodes};
            }''')
            page.screenshot(path=str(out/(kind+'.png')),full_page=True)
            report['models'].append({'kind':kind,**data})
            print('Captured',args.stage,kind,flush=True)
        page.evaluate('''()=>{
          const p=window.__p,T=p.THREE,scene=new T.Scene();scene.background=new T.Color('#b8c4a0');
          scene.add(new T.HemisphereLight('#fff4da','#52634c',2.5));
          const sun=new T.DirectionalLight('#fff4d2',3);sun.position.set(-3,8,-6);scene.add(sun);
          const plane=new T.Mesh(new T.PlaneGeometry(30,30),new T.MeshStandardMaterial({color:'#9ca980',roughness:1}));
          plane.rotation.x=-Math.PI/2;plane.position.y=.54;scene.add(plane);
          const kinds=['soldier','horse','chariot','cannon','elephant','advisor','general'];
          kinds.forEach((kind,index)=>{
            const model=window.__identity.createTroopModel(kind,'red'),root=new T.Group(),min=new T.Box3().setFromObject(model).min.y;
            model.position.y=-min;root.add(model);root.scale.setScalar(.68);
            root.position.set((index%4-1.5)*2.1,.545,Math.floor(index/4)*3.0-1.5);
            root.rotation.y=-.28;scene.add(root);
          });
          const camera=new T.PerspectiveCamera(32,p.camera.aspect,.1,100);
          camera.position.set(1.5,5,-11);camera.lookAt(0,.7,0);camera.updateMatrixWorld(true);
          document.querySelector('#status-title').textContent='七军形态检阅';
          document.querySelector('#status-detail').textContent='实际模型工厂 · 同一缩放 · 独立模型检阅，非对局';
          p.renderer.render(scene,camera);
        }''')
        page.screenshot(path=str(out/'00-seven-troops.png'),full_page=True)
        assert not report['errors'],report['errors']
        if args.stage=='after':assert source()==report['source_sha256'],'Product changed during capture'
        report['capture_script_sha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
        (out/'models.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
        browser.close()


if __name__=='__main__':run()
