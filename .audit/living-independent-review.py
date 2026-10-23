import hashlib,json,math
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path('/workspace/3d-chess')
files=sorted((root/'src').rglob('*.*'))+[root/'index.html']
hashes=lambda:{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
report={'source_before':hashes(),'errors':[]}
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader'])
 p=b.new_page(viewport={'width':1280,'height':960},reduced_motion='no-preference')
 def inject(route):
  r=route.fetch();route.fulfill(response=r,body=r.text()+'''\nwindow.__review={camera,controls,renderer,scene,battlefield,cameraPan,battleBanner,resetView};''')
 p.route('**/src/main.ts*',inject)
 p.route('**/favicon.ico',lambda r:r.fulfill(status=204))
 p.on('pageerror',lambda e:report['errors'].append(str(e)))
 p.clock.install()
 p.goto('http://127.0.0.1:5173',wait_until='networkidle');p.wait_for_function('window.__review')
 p.evaluate('''()=>{const x=window.__review;x.draw=x.renderer.render.bind(x.renderer);x.renderer.render=()=>{};x.controls.enableDamping=false;}''')
 p.clock.pause_at(__import__('datetime').datetime.now()+__import__('datetime').timedelta(seconds=1))
 pose=lambda:p.evaluate('({camera:__review.camera.position.toArray(),target:__review.controls.target.toArray()})')
 distance=lambda a,b:math.dist(a['target'],b['target'])
 p.locator('#game-canvas').focus();before=pose();p.keyboard.down('w');p.clock.run_for(300);p.keyboard.up('w');after=pose()
 assert distance(before,after)>.3,(before,after)
 report['keyboard_pan']={'before':before,'after':after}
 p.locator('#speed-select').focus();before=pose();p.keyboard.press('ArrowDown');p.clock.run_for(400);after=pose()
 assert distance(before,after)<1e-8,(before,after)
 report['speed_native_key_and_layout_keeps_camera']={'before':before,'after':after}
 p.locator('#game-canvas').focus();p.keyboard.down('d');p.clock.run_for(100);p.evaluate('window.dispatchEvent(new Event("blur"))');before=pose();p.clock.run_for(350);p.keyboard.up('d');after=pose()
 assert distance(before,after)<1e-8
 report['blur_stops_pan']=True
 p.locator('#game-canvas').focus();p.keyboard.down('s');p.clock.run_for(100);p.locator('#view-button').dispatch_event('click');p.clock.run_for(100);before=pose();p.clock.run_for(400);after=pose();p.keyboard.up('s')
 assert distance(before,after)<1e-8
 report['view_reset_clears_held_key']=True
 p.evaluate('__review.renderer.setAnimationLoop(null)')
 snapshot='''()=>{const result={};__review.battlefield.root.traverse(o=>{if(['cascade-whitewater','river-flow-glint','pine-canopy','windborne-leaf'].includes(o.name)&&!result[o.name])result[o.name]={p:o.position.toArray(),q:o.quaternion.toArray(),m:o.isInstancedMesh?Array.from(o.instanceMatrix.array).slice(0,16):null,v:o.name==='cascade-whitewater'?Array.from(o.geometry.attributes.position.array):null};});return result;}'''
 p.evaluate('__review.battlefield.update(100,false)');first=p.evaluate(snapshot)
 p.evaluate('__review.battlefield.update(300,false)');second=p.evaluate(snapshot)
 assert second['cascade-whitewater']['p'][1]<first['cascade-whitewater']['p'][1]
 assert second['river-flow-glint']['p'][0]<first['river-flow-glint']['p'][0]
 assert second['pine-canopy']['m']!=first['pine-canopy']['m']
 assert second['windborne-leaf']!=first['windborne-leaf']
 p.locator('#ambience-button').dispatch_event('click');rest=p.evaluate(snapshot)
 p.evaluate('__review.battlefield.update(9900,true)');assert p.evaluate(snapshot)==rest
 report['actual_scene_ambience']={'first':first,'second':second,'off_freezes':True}
 p.evaluate('''()=>{const x=__review;x.camera.position.set(19,23,25);x.controls.target.set(0,1,0);x.controls.update();x.draw(x.scene,x.camera);}''')
 p.evaluate('__review.battleBanner.show({kind:"engage",side:"red",actor:"soldier",target:"horse"})')
 assert p.locator('#battle-banner').is_visible()
 assert p.evaluate('__review.battleBanner.impact()') is True
 assert p.evaluate('__review.battleBanner.impact()') is False
 p.locator('#reset-button').dispatch_event('click');p.clock.run_for(300)
 assert p.locator('#battle-banner').is_hidden()
 report['banner_once_and_reset']=True
 p.clock.resume()
 p.evaluate('__review.renderer.setAnimationLoop(()=>__review.draw(__review.scene,__review.camera))')
 p.screenshot(path=str(root/'.audit/living-independent-scene.png'),full_page=True,animations='disabled')
 p.set_viewport_size({'width':390,'height':844})
 p.evaluate('__review.battleBanner.show({kind:"engage",side:"red",actor:"soldier",target:"horse"})')
 report['mobile_banner']=p.locator('#battle-banner').bounding_box()
 assert p.evaluate('document.documentElement.scrollWidth<=innerWidth')
 p.screenshot(path=str(root/'.audit/living-independent-mobile.png'),full_page=True,animations='disabled')
 b.close()
report['source_after']=hashes();report['source_unchanged']=report['source_before']==report['source_after'];report['status']='PASS'
(root/'.audit/living-independent-evidence.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'status':report['status'],'source_unchanged':report['source_unchanged'],'errors':report['errors'],'mobile':report['mobile_banner']}))
