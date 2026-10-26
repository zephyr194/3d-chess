import importlib.util,json,hashlib
from pathlib import Path
from datetime import datetime,timedelta
from playwright.sync_api import sync_playwright
ROOT=Path('/workspace/3d-chess')
spec=importlib.util.spec_from_file_location('v2',ROOT/'scripts/capture-battlefield-v2.py');v2=importlib.util.module_from_spec(spec);spec.loader.exec_module(v2)
errors=[];report={'checks':[],'errors':errors}
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader'])
 page=b.new_page(viewport={'width':1280,'height':960},device_scale_factor=1,reduced_motion='no-preference')
 def inject(route):
  response=route.fetch();body=response.text();assert 'createCameraFocus' in body
  body=body.replace('renderer.setAnimationLoop((time) => {','renderer.setAnimationLoop(window.__reviewLoop = (time) => {')
  route.fulfill(response=response,body=body+v2.common.INSTRUMENT+v2.EXPOSE+'\nwindow.__review={cameraFocus,audio,drums};')
 page.route('**/src/main.ts*',inject);page.route('**/favicon.ico',lambda r:r.fulfill(status=204))
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:5184',wait_until='networkidle');page.wait_for_function('window.__review')
 page.evaluate('''()=>{const p=window.__p,render=p.renderer.render.bind(p.renderer);window.__drawReview=()=>render(p.scene,p.camera);p.renderer.render=()=>{}}''')
 page.clock.install();page.clock.pause_at(datetime.now()+timedelta(seconds=1));page.evaluate('window.__p.renderer.setAnimationLoop(null);window.__p.renderer.setAnimationLoop(window.__reviewLoop)')
 def step(ms=50):page.clock.run_for(ms)
 def press(selector):page.locator(selector).dispatch_event('click')
 def state():return page.evaluate('''()=>{const p=window.__p;return {id:window.__review.cameraFocus.id,selected:p.getSelected(),turn:p.getState().turn,target:p.controls.target.toArray(),camera:p.camera.position.toArray(),distance:p.camera.position.distanceTo(p.controls.target)}}''')
 def cell(x,y):return f'.tactical-cell[data-x="{x}"][data-y="{y}"]'
 def load(s):
  press('#reset-button');page.evaluate('s=>window.__v2.load(s)',s)
  if page.locator('#tactical-panel').is_hidden():press('#tactical-toggle')
 def tap(id):
  at=page.evaluate('''id=>{const p=window.__p,T=p.THREE,g=p.pieceGroups.get(id);p.camera.updateMatrixWorld(true);p.scene.updateMatrixWorld(true);const q=g.position.clone().add(new T.Vector3(0,.7,0)).project(p.camera),r=p.renderer.domElement.getBoundingClientRect();return {x:r.x+(q.x+1)*r.width/2,y:r.y+(1-q.y)*r.height/2}}''',id)
  page.mouse.click(at['x'],at['y']);step(1100)
 def visibility():return page.evaluate("""()=>{
  const p=window.__p,T=p.THREE,g=p.pieceGroups.get('actor'),clear=[];p.scene.updateMatrixWorld(true);
  for(const height of [.2,.7,1.25]){
    const point=g.position.clone().add(new T.Vector3(0,height*.68,0)),direction=point.sub(p.camera.position);
    const ray=new T.Raycaster(p.camera.position,direction.clone().normalize(),0,direction.length()-.12);
    const hit=ray.intersectObject(p.battlefield.root,true).find(h=>{
      const o=h.object;if(!o.isMesh||!o.visible)return false;const ms=Array.isArray(o.material)?o.material:[o.material];
      return ms.some(m=>m.visible&&(!m.transparent||m.opacity>.8));
    });clear.push({height,clear:!hit,blocker:hit?.object.name??null});
  }return clear;
 }""")
 for side,start in [('red',(2,6)),('black',(2,3))]:
  load(v2.fixture(kind='soldier',side=side,start=start));press('#view-button');tap('actor');s=state()
  assert s['id']=='actor' and s['selected']=='actor',s
  assert abs(s['distance']-7.8)<.01,s
  assert page.evaluate('window.__p.controls.target.distanceTo(window.__p.pieceGroups.get("actor").position.clone().add(new window.__p.THREE.Vector3(0,.6,0)))')<.01
  rays=visibility();assert all(r['clear'] for r in rays),(side,rays)
  report['checks'].append({'side':side,'focus':s,'visibility':rays})
  if page.locator('#tactical-panel').is_visible():press('#tactical-toggle')
  page.evaluate('window.__drawReview()');page.screenshot(path=str(ROOT/f'.audit/focus-visibility-review-{side}.png'))
 at=page.locator('#game-canvas').bounding_box();page.mouse.move(at['x']+at['width']*.75,at['y']+at['height']*.65);page.mouse.wheel(0,300);step(800)
 assert state()['id']=='actor' and state()['distance']>8.2,state();report['checks'].append('Zoom retains focus after transition')
 page.emulate_media(reduced_motion='reduce');press('#tactical-toggle');press(cell(2,3));step(50)
 assert abs(state()['distance']-7.8)<.01,state()
 assert page.evaluate('window.__p.controls.target.distanceTo(window.__p.pieceGroups.get("actor").position.clone().add(new window.__p.THREE.Vector3(0,.6,0)))')<.01
 report['checks'].append('Reduced motion focuses in one frame without interpolated camera movement')
 page.keyboard.press('Escape');assert state()['id'] is None
 load(v2.fixture(kind='soldier',side='red',start=(2,6)))
 press(cell(3,0));step(50);assert state()['id']=='bg' and state()['selected'] is None and state()['turn']=='red',state();report['checks'].append('Tactical enemy inspection preserves turn and leaves selection empty')
 press('#view-button');assert state()['id'] is None
 page.set_viewport_size({'width':390,'height':844});step(100);press(cell(2,6));step(100)
 assert page.locator('#release-focus').is_visible()
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 report['checks'].append('390px focus chip visible without horizontal overflow')
 assert not errors,errors
 (ROOT/'.audit/focus-visibility-review-browser.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(report,ensure_ascii=False,indent=2));b.close()
