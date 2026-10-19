from pathlib import Path
import json
from playwright.sync_api import sync_playwright,expect
out=Path('/workspace/3d-chess/screenshots/restored')
errors=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader'])
 page=b.new_page(viewport={'width':1440,'height':1024},device_scale_factor=1,reduced_motion='reduce',has_touch=True)
 def instrument(route):
  r=route.fetch();route.fulfill(response=r,body=r.text()+'\nwindow.__p={scene,camera,renderer,controls,battlefield,pieceGroups,routePreviewLayer,markerLayer,getMarchPath,gridToWorld,getState:()=>state,getSelected:()=>selectedId,getLocked:()=>interactionLocked,render:()=>renderer.render(scene,camera),pause:()=>renderer.setAnimationLoop(time=>{battlefield.update(time,reducedMotion.matches);controls.update();})};')
 page.route('**/src/main.ts*',instrument);page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:errors.append(m.text) if m.type=='error' and 'favicon' not in m.text else None)
 page.route('**/favicon.ico',lambda route:route.fulfill(status=204))
 page.goto('http://127.0.0.1:5173',wait_until='networkidle');page.wait_for_function('window.__p');page.evaluate('window.__p.pause()')
 def snap(name,full=False):page.evaluate('window.__p.render()');page.screenshot(path=str(out/name),full_page=full,timeout=60000)
 def cell(x,y):return page.locator(f'.tactical-cell[data-x="{x}"][data-y="{y}"]')
 def move(x,y,tx,ty):
  old=page.evaluate('window.__p.getState().turn');cell(x,y).click();cell(tx,ty).click();page.wait_for_function('(turn)=>window.__p.getState().turn!==turn&&!window.__p.getLocked()',arg=old,timeout=60000)
 def reset():page.locator('#reset-button').click();page.wait_for_function('!window.__p.getLocked()');page.wait_for_function('!document.querySelector("#battle-toast").classList.contains("show")')
 def sync():assert page.evaluate('()=>window.__p.getState().pieces.every(p=>document.querySelector(`.tactical-cell[data-x="${p.x}"][data-y="${p.y}"]`).dataset.pieceId===p.id)')
 snap('01-battlefield.png');page.locator('#tactical-toggle').click();snap('02-tactical.png');assert page.locator('.tactical-cell:not(.empty)').count()==32
 for p in page.evaluate('window.__p.getState().pieces.filter(p=>p.side==="red")'):
  cell(p['x'],p['y']).click();assert page.evaluate('window.__p.getSelected()')==p['id']
 assert all(abs(v-.68)<1e-8 for v in page.evaluate('[...window.__p.pieceGroups.values()].map(g=>g.scale.x)'))
 reset();cell(1,9).focus();page.keyboard.press('Enter');before=page.evaluate('JSON.stringify(window.__p.getState())');cell(1,8).click();assert page.evaluate('JSON.stringify(window.__p.getState())')==before;cell(2,7).hover();assert page.evaluate('window.__p.routePreviewLayer.children.length')==2;cell(1,9).focus();page.keyboard.press('ArrowRight');page.keyboard.press('ArrowUp');page.keyboard.press('ArrowUp');page.keyboard.press('Enter');page.wait_for_function('window.__p.getState().turn==="black"');sync()
 reset();move(1,7,1,0);assert page.evaluate('window.__p.getState().pieces.length')==31;assert cell(1,0).inner_text()=='炮';sync();print('Map selection, keyboard, horse rules and cannon capture passed',flush=True)
 reset();move(0,6,0,5);move(6,3,6,4);cell(0,5).click();cell(0,4).hover();assert '渡船' in page.locator('#route-caption').inner_text();snap('03-river-route.png');move(0,5,0,4);sync()
 assert all(abs(v-.545)<1e-8 for v in page.evaluate('[...window.__p.pieceGroups.values()].map(g=>g.position.y)'))
 reset();move(8,6,8,5);move(0,3,0,4);cell(8,5).click();cell(8,4).hover();assert '栈道' in page.locator('#route-caption').inner_text();snap('04-cliff-route.png');move(8,5,8,4);sync();print('Ferry and cliff routes complete at equal height',flush=True)
 reset();page.locator('#tactical-toggle').click();page.evaluate('()=>{const p=window.__p;p.controls.enableDamping=false;p.controls.target.set(0,.4,0);p.camera.position.set(14,9,18);p.controls.update();}');snap('05-bridge-detail.png')
 page.evaluate('()=>{const p=window.__p;p.controls.target.set(0,1,15.7);p.camera.position.set(2,7,24.5);p.controls.update();}');snap('06-troop-detail.png')
 page.locator('#view-button').click();page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(300);page.locator('#tactical-toggle').click();snap('07-mobile.png',True);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');move(0,6,0,5);sync()
 page.set_viewport_size({'width':1440,'height':1024});page.wait_for_timeout(300);reset();cell(0,6).click();page.emulate_media(reduced_motion='no-preference');cell(0,5).click();page.locator('#reset-button').click();page.wait_for_timeout(800);assert page.evaluate('window.__p.getState().pieces.length')==32;assert page.locator('.last-move').count()==0;sync()
 assert not errors,errors
 (out/'verification.json').write_text(json.dumps({'checks':['32 real pieces, all red pieces selectable','constant scale .68 and root height .545','synchronized 2D and 3D state','keyboard move and illegal horse endpoint rejected','cannon screen capture','real ferry route','real cliff route','mobile 390px without overflow','reset cancels pending state commit'],'console_errors':errors},ensure_ascii=False,indent=2))
 print('All browser checks passed, screenshots saved',flush=True);b.close()
