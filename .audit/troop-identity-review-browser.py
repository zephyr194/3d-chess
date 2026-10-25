import hashlib
import importlib.util
import json
from datetime import datetime, timedelta
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.audit'
spec = importlib.util.spec_from_file_location('capture', ROOT / 'scripts/capture-battlefield-v2.py')
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)
KINDS = ['soldier', 'general', 'advisor', 'horse', 'elephant', 'chariot', 'cannon']


def source():
    return {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in [*sorted((ROOT / 'src').rglob('*.*')), ROOT / 'index.html']}


def run():
    evidence = {'source_sha256': source(), 'errors': [], 'models': [], 'moves': [], 'status': 'RUNNING'}
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'])
        page = browser.new_page(viewport={'width': 1280, 'height': 960}, reduced_motion='no-preference')

        def inject(route):
            response = route.fetch()
            body = response.text().replace('renderer.setAnimationLoop((time) => {', 'renderer.setAnimationLoop(window.__nativeLoop=(time) => {')
            assert 'window.__nativeLoop=' in body
            route.fulfill(response=response, body=body + capture.common.INSTRUMENT + capture.EXPOSE + '\nwindow.__review={createTroopModel};')

        page.route('**/src/main.ts*', inject)
        page.route('**/favicon.ico', lambda route: route.fulfill(status=204))
        page.on('pageerror', lambda error: evidence['errors'].append(str(error)))
        page.on('console', lambda message: evidence['errors'].append(message.text) if message.type == 'error' else None)
        try:
            page.goto('http://127.0.0.1:5173', wait_until='networkidle')
            page.wait_for_function('window.__review')
            page.evaluate('''()=>{const p=window.__p, render=p.renderer.render.bind(p.renderer);
                window.__drawRender=render;window.__draw=()=>render(p.scene,p.camera);p.renderer.render=()=>{};}''')
            page.clock.install()
            page.clock.pause_at(datetime.now() + timedelta(seconds=1))
            page.evaluate('window.__p.renderer.setAnimationLoop(null);window.__p.renderer.setAnimationLoop(window.__nativeLoop)')

            def step(ms=50):
                page.clock.run_for(ms)

            def press(selector):
                page.locator(selector).dispatch_event('click')

            def load(state):
                press('#reset-button')
                page.evaluate('s=>window.__v2.load(s)', state)
                if page.locator('#tactical-panel').is_hidden():
                    press('#tactical-toggle')
                page.evaluate('window.__speedSamples=[]')

            def move(start, target):
                for x, y in [start, target]:
                    press(f'.tactical-cell[data-x="{x}"][data-y="{y}"]')
                assert page.evaluate('window.__p.getLocked()')

            def until(expr, limit=100000):
                for _ in range(limit // 50):
                    if page.evaluate(expr):
                        return
                    step()
                raise AssertionError(expr)

            for kind in KINDS:
                for side in ['red', 'black']:
                    load(capture.fixture(kind=kind, side=side, start=(2, 6)))
                    model = page.evaluate('''()=>{
                      const p=window.__p,T=p.THREE,g=p.pieceGroups.get('actor'),m=g.userData.troop,d=g.userData.detailsRig,c=g.userData.combatRig;
                      const positions=d.cloth.geometry.getAttribute('position'),mark=d.cloth.getObjectByName('standard-mark');
                      const pinned=[];for(let i=0;i<positions.count;i++)if(positions.getX(i)===0)pinned.push([i,positions.getY(i),positions.getZ(i)]);
                      p.scene.updateMatrixWorld(true);const b=new T.Box3().setFromObject(m), marks=[];
                      m.traverse(o=>{if(o.name==='identity-mark')marks.push({parent:o.parent.name,local:o.position.toArray()})});
                      return {root:g.position.toArray(),scale:g.scale.x,restY:g.userData.restY,
                        bounds:{min:b.min.toArray(),max:b.max.toArray()},color:d.cloth.material.color.getHexString(),
                        markSharedGeometry:mark.geometry===d.cloth.geometry,markSharedUV:mark.geometry.getAttribute('uv')===d.cloth.geometry.getAttribute('uv'),
                        pinned,cloth:Array.from(positions.array),standardParent:d.standard.parent.name,
                        joints:Object.fromEntries(Object.entries(c.joints).map(([n,j])=>[n,j.node.name])),marks,
                        ears: m.getObjectsByProperty('name','').length,
                        descendants:(()=>{const names=[];m.traverse(o=>{if(o.name)names.push({name:o.name,parent:o.parent?.name})});return names})()};
                    }''')
                    assert model['root'][1] == .545 and model['scale'] == .68
                    assert abs(model['bounds']['min'][1] - .545) < 1e-8, (kind, model['bounds'])
                    assert model['markSharedGeometry'] and model['markSharedUV'] and len(model['pinned']) > 0
                    assert model['color'] == ('d33c30' if side == 'red' else '243a40')
                    step(100)
                    cloth = page.evaluate('''()=>Array.from(window.__p.pieceGroups.get('actor').userData.detailsRig.cloth.geometry.attributes.position.array)''')
                    assert cloth != model['cloth']
                    for index, y, z in model['pinned']:
                        assert cloth[index * 3:index * 3 + 3] == [0, y, z]
                    evidence['models'].append({'kind': kind, 'side': side, **{k: v for k, v in model.items() if k not in ['cloth', 'pinned', 'ears']}, 'pinned_vertices': len(model['pinned']), 'flutter': True})

            for side, start, target in [('red', (2, 6), (2, 5)), ('black', (2, 3), (2, 4))]:
                runs = {}
                for pace in ['walk', 'run']:
                    load(capture.fixture(side=side, start=start))
                    page.locator('#pace-select').select_option(pace)
                    page.locator('#speed-select').select_option('0.62')
                    move(start, target)
                    samples = []
                    for _ in range(20):
                        step()
                        samples.append(page.evaluate('''()=>{const g=window.__p.pieceGroups.get('actor'),r=g.userData.locomotionRig;
                          return {root:g.position.toArray(),pace:r.pace,cycle:r.cycle,knees:r.legs.map(l=>l.knee.rotation.x),
                            upper:Object.values(g.userData.combatRig.joints).map(j=>j.node.quaternion.toArray())}}'''))
                    assert any(s['pace'] == pace for s in samples)
                    until('!window.__p.getLocked()')
                    duration = page.evaluate('window.__speedSamples.reduce((a,s)=>a+s.delta,0)')
                    runs[pace] = {'duration': duration, 'sample': samples[10]}
                assert abs(runs['walk']['duration'] - runs['run']['duration']) < .04
                assert runs['walk']['sample']['knees'] != runs['run']['sample']['knees']
                assert runs['walk']['sample']['upper'] != runs['run']['sample']['upper']
                evidence['moves'].append({'side': side, 'kind': 'soldier', 'rate': .62, 'paces': runs})

            load(capture.fixture(kind='horse', start=(1, 7)))
            page.locator('#pace-select').select_option('run')
            page.locator('#speed-select').select_option('0.62')
            move((1, 7), (2, 5))
            until('window.__p.pieceGroups.get("actor").userData.locomotionRig.cycle>.3')
            transitions = []
            for requested in ['walk', 'run']:
                before = page.evaluate('''()=>{const r=window.__p.pieceGroups.get('actor').userData.locomotionRig;return {cycle:r.cycle,pace:r.pace}}''')
                page.locator('#pace-select').select_option(requested)
                until(f'window.__p.pieceGroups.get("actor").userData.locomotionRig.pace==="{requested}"')
                after = page.evaluate('''()=>{const p=window.__p,T=p.THREE,g=p.pieceGroups.get('actor'),r=g.userData.locomotionRig;
                  return {cycle:r.cycle,pace:r.pace,soles:r.legs.map(l=>l.sole.getWorldPosition(new T.Vector3()).toArray())}}''')
                assert after['cycle'] >= int(before['cycle']) + 1
                assert min(s[1] for s in after['soles']) >= .539
                transitions.append({'requested': requested, 'before': before, 'after': after})
                step(100)
            until('!window.__p.getLocked()')
            evidence['native_midstride_pace_changes'] = transitions

            load(capture.fixture(kind='chariot', start=(4, 7)))
            page.locator('#pace-select').select_option('run')
            page.locator('#speed-select').select_option('3')
            move((4, 7), (4, 2))
            until('window.__speedSamples.some(s=>s.surface==="bridge")')
            assert page.evaluate('window.__p.pieceGroups.get("actor").userData.locomotionRig.pace') == 'walk'
            bridge = page.evaluate('''()=>{const g=window.__p.pieceGroups.get('actor'),r=g.userData.locomotionRig;
              return {pace:r.pace,narrow:r.narrow,rate:document.querySelector('#speed-select').value,requested:document.querySelector('#pace-select').value}}''')
            until('!window.__p.getLocked()')
            evidence['bridge'] = bridge

            load(capture.fixture(kind='horse', start=(1, 7)))
            page.locator('#pace-select').select_option('run')
            page.locator('#speed-select').select_option('0.62')
            move((1, 7), (2, 5))
            step(400)
            page.emulate_media(reduced_motion='reduce')
            step()
            reduced = page.evaluate('''()=>{const p=window.__p,T=p.THREE,g=p.pieceGroups.get('actor'),r=g.userData.combatRig,d=g.userData.detailsRig;
              return {upperRest:Object.values(r.joints).every(j=>j.node.position.distanceTo(j.position)<1e-9&&j.node.quaternion.angleTo(j.quaternion)<1e-6),
                clothRest:Array.from(d.cloth.geometry.attributes.position.array).every((x,i)=>x===d.restVertices[i]),
                planted:g.userData.locomotionRig.legs.every(l=>l.planted),root:g.position.toArray(),scale:g.scale.x}}''')
            assert reduced['upperRest'] and reduced['clothRest'] and reduced['planted']
            until('!window.__p.getLocked()')
            page.emulate_media(reduced_motion='no-preference')
            load(capture.fixture())
            press('#ambience-button')
            step()
            a = page.evaluate('Array.from(window.__p.pieceGroups.get("actor").userData.detailsRig.cloth.geometry.attributes.position.array)')
            step(300)
            b = page.evaluate('Array.from(window.__p.pieceGroups.get("actor").userData.detailsRig.cloth.geometry.attributes.position.array)')
            assert a == b
            press('#ambience-button')
            step(300)
            assert a != page.evaluate('Array.from(window.__p.pieceGroups.get("actor").userData.detailsRig.cloth.geometry.attributes.position.array)')
            evidence['reduced_during_run'] = reduced
            evidence['ambience_off_and_resume'] = True
            press('#reset-button')
            step()
            assert page.evaluate('''()=>window.__p.getState().pieces.length===32&&[...window.__p.pieceGroups.values()].every(g=>{
              const r=g.userData.combatRig;return g.position.y===.545&&g.scale.x===.68&&Object.values(r.joints).every(j=>j.node.quaternion.angleTo(j.quaternion)<1e-6)})''')
            page.set_viewport_size({'width': 390, 'height': 844})
            press('#view-button')
            step(1200)
            assert page.locator('#pace-select').is_visible()
            assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
            page.evaluate('window.__draw()')
            page.screenshot(path=str(OUT / 'troop-identity-review-mobile.png'), full_page=True)
            evidence['mobile_no_overflow'] = True
            page.set_viewport_size({'width': 1280, 'height': 960})
            step(100)
            if page.locator('#tactical-panel').is_visible():
                press('#tactical-toggle')
            page.evaluate('''()=>{
              const p=window.__p,T=p.THREE,scene=new T.Scene();scene.background=new T.Color('#b8c4a0');
              scene.add(new T.HemisphereLight('#fff4da','#52634c',2.5));
              const sun=new T.DirectionalLight('#fff4d2',3);sun.position.set(-3,8,-6);scene.add(sun);
              const kinds=['soldier','horse','chariot','cannon','elephant','advisor','general'];
              ['red','black'].forEach((side,row)=>kinds.forEach((kind,index)=>{
                const model=window.__review.createTroopModel(kind,side),root=new T.Group();
                model.position.y=-new T.Box3().setFromObject(model).min.y;root.add(model);root.scale.setScalar(.68);
                root.position.set((index-3)*1.4,0,row*3.2);root.rotation.y=side==='red'?-.3:Math.PI-.3;scene.add(root);
              }));
              const camera=new T.PerspectiveCamera(32,1280/692,.1,100);
              camera.position.set(1,5,-13);camera.lookAt(0,.4,1.6);camera.updateMatrixWorld(true);
              document.querySelector('#status-title').textContent='双方原生模型检阅';
              document.querySelector('#status-detail').textContent='实际模型工厂 · 材质与形态检阅，非对局';
              window.__drawRender(scene,camera);
            }''')
            page.screenshot(path=str(OUT / 'troop-identity-review-faction-gallery.png'))
            assert not evidence['errors'], evidence['errors']
            assert source() == evidence['source_sha256'], 'Product source changed during independent verification'
            evidence['status'] = 'PASS'
        except Exception as error:
            evidence['status'] = 'FAIL'
            evidence['failure'] = str(error)
            raise
        finally:
            evidence['script_sha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
            (OUT / 'troop-identity-review-browser.json').write_text(json.dumps(evidence, indent=2) + '\n')
            browser.close()


if __name__ == '__main__':
    run()
