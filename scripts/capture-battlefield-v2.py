"""Capture native terrain and verify real UI moves, live speed and seven combat rigs."""
import argparse
import importlib.util
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('road_capture', ROOT / 'scripts/capture-road-refinement.py')
common = importlib.util.module_from_spec(spec)
spec.loader.exec_module(common)
FRAMES = [('01-overview', None, None), ('02-ferry', [-4,8,10], [-9,.5,0]),
          ('03-watershed', [19,23,25], [0,1,0]), ('04-lake', [-3,12,3], [-7.8,0,-7.7])]
EXPOSE = '''
window.__v2 = {
  load: next => {
    animationEpoch++; battlefield.reset(); interactionLocked=false;
    selectedId=null; availableMoves=[]; lastMove=null; clearPreview(); effectLayer.clear();
    state={pieces:[],turn:'red',winner:null};renderPieces();
    state=next;renderPieces();renderMarkers();updateUI();
  },
  moves:()=>availableMoves,
  rig: id => {
    const g=pieceGroups.get(id), rig=g.userData.combatRig;
    return {phase:g.userData.combatPhase,progress:g.userData.combatProgress,
      impacts:g.userData.combatImpacts,at:g.position.toArray(),scale:g.scale.x,
      marchMotion:g.userData.marchMotion,
      joints:rig?Object.fromEntries(Object.entries(rig.joints).map(([name,j])=>[name,{
        position:j.node.position.toArray(),quaternion:j.node.quaternion.toArray(),
        restPosition:j.position.toArray(),restQuaternion:j.quaternion.toArray()
      }])):{}};
  },
};
window.__speedSamples=[];
const originalStart=battlefield.startMarch.bind(battlefield);
battlefield.startMarch=(...args)=>{
 const playback=originalStart(...args);let previous;
 return {durationSeconds:playback.durationSeconds,advance:delta=>{
   const wall=performance.now(), frame=playback.advance(delta);
   if(previous!==undefined)window.__speedSamples.push({wall:(wall-previous)/1000,
     delta,rate:Number(speedSelect.value),motion:frame.motion,surface:frame.surface});
   previous=wall;return frame;
 }};
};
'''

def fixture(kind='soldier',side='red',start=(2,4),target=None,pinned=False):
    pieces=[{'id':'rg','side':'red','kind':'general','x':4,'y':9},
            {'id':'bg','side':'black','kind':'general','x':4 if pinned else 3,'y':0}]
    if kind=='general': pieces=[p for p in pieces if p['side']!=side]
    pieces.append({'id':'actor','side':side,'kind':kind,'x':start[0],'y':start[1]})
    if target: pieces.append({'id':'victim','side':'black' if side=='red' else 'red','kind':'horse','x':target[0],'y':target[1]})
    if kind=='cannon': pieces.append({'id':'screen','side':'red','kind':'soldier','x':1,'y':5})
    return {'pieces':pieces,'turn':side,'winner':None}

def run():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stage',choices=['before','after'],required=True)
    parser.add_argument('--base-url',default='http://127.0.0.1:5173')
    parser.add_argument('--verify',action='store_true')
    args=parser.parse_args()
    out=ROOT/'screenshots/battlefield-v2'/args.stage
    out.mkdir(parents=True,exist_ok=True)
    errors=[];report={'stage':args.stage,'frames':FRAMES,'viewport':[1440,1024],'pawn_checks':[],
                      'combat':[],'live_speed':{},'checks':[],'console_errors':errors}
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader'])
        page=browser.new_page(viewport={'width':1440,'height':1024},device_scale_factor=1,reduced_motion='reduce')
        def inject(route):
            response=route.fetch();route.fulfill(response=response,body=response.text()+common.INSTRUMENT+EXPOSE)
        page.route('**/src/main.ts*',inject)
        page.route('**/favicon.ico',lambda route:route.fulfill(status=204))
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
        page.goto(args.base_url,wait_until='networkidle');page.wait_for_function('window.__v2');page.evaluate('window.__p.pause()')
        def snap(name,full=False):
            page.evaluate('window.__p.render()');page.screenshot(path=str(out/(name+'.png')),full_page=full)
            print('Captured',name,flush=True)
        def camera(at,target):
            page.evaluate('([at,target])=>{const p=window.__p;p.controls.enableDamping=false;p.camera.position.fromArray(at);p.controls.target.fromArray(target);p.controls.update()}',[at,target])
        def cell(x,y):return page.locator(f'.tactical-cell[data-x="{x}"][data-y="{y}"]')
        def load(state):
            page.evaluate('s=>window.__v2.load(s)',state)
            if page.locator('#tactical-panel').is_hidden():page.locator('#tactical-toggle').click()
        def done():
            page.wait_for_function('!window.__p.getLocked()',timeout=60000)
            assert not errors,errors
        def synced():
            assert page.evaluate('()=>window.__p.getState().pieces.every(p=>document.querySelector(`.tactical-cell[data-x="${p.x}"][data-y="${p.y}"]`).dataset.pieceId===p.id)')
        for name,at,target in FRAMES:
            if at:camera(at,target)
            snap(name)
        report['scene']=page.evaluate('''()=>{
          const p=window.__p,T=p.THREE,mat=new T.Matrix4(),pos=new T.Vector3();
          let interiorTrees=0,totalTrees=0;
          p.battlefield.root.traverse(o=>{if(o.name==='forest-trunks'&&o.isInstancedMesh){
            for(let i=0;i<o.count;i++){o.getMatrixAt(i,mat);pos.setFromMatrixPosition(mat);
              totalTrees++;if(Math.abs(pos.x)<12.8&&Math.abs(pos.z)<15.74)interiorTrees++;}}});
          const boat=p.battlefield.root.getObjectByName('working-ferry');
          const box=new T.Box3().setFromObject(boat);
          return {interiorTrees,totalTrees,boatBox:{min:box.min.toArray(),max:box.max.toArray()},
            terrainVertices:p.battlefield.terrain.geometry.attributes.position.count};
        }''')
        if args.verify:
            assert report['scene']['interiorTrees']>=25
            for side,y in [('red',4),('black',5)]:
                load(fixture(side=side,start=(2,y)))
                cell(2,y).click()
                check=page.evaluate('''()=>({moves:window.__v2.moves(),markers:window.__p.markerLayer.children.map(m=>m.userData.move),
                  priority:window.__p.markerLayer.children.map(m=>({depth:m.material.depthTest,order:m.renderOrder})),
                  mini:[...document.querySelectorAll('.tactical-cell.legal')].map(b=>({x:Number(b.dataset.x),y:Number(b.dataset.y)}))})''')
                key=lambda a:sorted((p['x'],p['y']) for p in a)
                assert key(check['moves'])==key(check['markers'])==key(check['mini'])
                assert (1,y) in key(check['moves']) and (3,y) in key(check['moves'])
                assert all(not m['depth'] for m in check['priority'])
                camera([2,38,29],[0,0,0]);snap('05-'+side+'-crossed-pawn')
                cell(3,y).hover();assert page.evaluate('window.__p.routePreviewLayer.children.length')==2
                cell(3,y).click();done();synced()
                assert page.evaluate('window.__p.getState().pieces.find(p=>p.id==="actor").x')==3
                report['pawn_checks'].append({'side':side,'legal':check['moves'],'sideways_move':True})
            load(fixture(start=(4,4),pinned=True));cell(4,4).click()
            assert page.evaluate('window.__v2.moves().length')==1
            cell(3,4).click()
            assert '照面' in page.locator('#status-detail').inner_text()
            assert page.evaluate('window.__p.getState().pieces.find(p=>p.id==="actor").x')==4
            report['checks'].append('Crossed red and black soldiers show forward and lateral moves; facing-general pin remains illegal with explanation')

            page.emulate_media(reduced_motion='no-preference')
            load(fixture(kind='chariot',start=(0,9)))
            page.locator('#speed-select').select_option('0.62')
            page.evaluate('window.__speedSamples=[]')
            cell(0,9).click();cell(0,0).click()
            page.wait_for_function('window.__speedSamples.filter(s=>s.rate===.62&&s.delta>0).length>=15',timeout=60000)
            page.locator('#speed-select').select_option('1.7')
            page.wait_for_function('window.__speedSamples.filter(s=>s.rate===1.7&&s.delta>0).length>=15',timeout=60000)
            samples=page.evaluate('window.__speedSamples')
            for rate in [.62,1.7]:
                selected=[s for s in samples if s['rate']==rate and s['delta']>0][3:]
                observed=sum(s['delta'] for s in selected)/sum(s['wall'] for s in selected)
                assert abs(observed-rate)<rate*.18,(rate,observed)
                report['live_speed'][str(rate)]={'frames':len(selected),'observed_rate':observed}
            page.locator('#speed-select').select_option('0.25')
            page.wait_for_function('window.__speedSamples.at(-1)?.motion==="riding"',timeout=60000)
            before=page.evaluate('window.__speedSamples.length')
            page.locator('#speed-select').select_option('1.7')
            page.wait_for_function('(n)=>window.__speedSamples.length>n+4',arg=before,timeout=60000)
            assert page.evaluate('window.__speedSamples.slice(-3).every(s=>s.rate===1.7)')
            page.locator('#speed-select').select_option('3');done();synced()
            report['checks'].append('Live .62 to 1.7 speed change alters presentation slope during a real march; ferry uses the live rate too')

            report['transport']=[]
            support_watch=common.WATCH.replace('p.battlefield.decks', '[p.battlefield.roadGroup,...p.battlefield.decks]')
            for side,start,target in [('red',(0,9),(0,0)),('black',(0,0),(0,9))]:
                load(fixture(kind='chariot',side=side,start=start))
                page.locator('#speed-select').select_option('3')
                page.evaluate(support_watch,'actor')
                cell(*start).click();cell(*target).click()
                page.wait_for_function('window.__p.pieceGroups.get("actor").userData.marchMotion==="riding"',timeout=60000)
                page.locator('#speed-select').select_option('0.25')
                page.wait_for_function('Math.abs(window.__p.battlefield.root.getObjectByName("working-ferry").position.z)<.8',timeout=60000)
                if side=='red':
                    camera([-5,3.5,2.5],[-9.6,.35,0]);snap('07-ferry-underway')
                page.locator('#speed-select').select_option('3');done();synced()
                watch=page.evaluate('window.__watch.stop()')
                assert len(watch['samples'])>20 and not watch['failures'],watch['failures'][:10]
                assert not watch['gaitFailures'],watch['gaitFailures'][:10]
                assert any(s['motion']=='riding' for s in watch['samples'])
                assert all(abs(s['actor'][1]-.545)<1e-8 and abs(s['scale']-.68)<1e-8 for s in watch['samples'])
                (out/('transport-'+side+'.json')).write_text(json.dumps(watch,indent=2)+'\n')
                report['transport'].append({'side':side,'frames':len(watch['samples']),
                    'footprint_rays':len(watch['samples'])*9,'unsupported':len(watch['failures']),
                    'gait_failures':len(watch['gaitFailures'])})
                print('Verified real ferry footprint',side,flush=True)
            report['checks'].append('Both ferry directions retain nine-point actual mesh support and fixed root height/scale under normal motion')

            cases=[('soldier',(2,4),(3,4)),('horse',(1,7),(2,5)),('chariot',(0,7),(0,6)),
                   ('cannon',(1,7),(1,3)),('elephant',(2,9),(4,7)),('advisor',(3,9),(4,8)),('general',(4,9),(4,8))]
            for kind,start,target in cases:
                scene=fixture(kind=kind,start=start,target=target)
                if kind in ['advisor','general']:
                    scene['pieces'][-1]['kind']='soldier'
                load(scene);page.locator('#speed-select').select_option('3')
                at=page.evaluate('p=>window.__p.gridToWorld(p).toArray()',{'x':target[0],'y':target[1]})
                camera([at[0]+4,at[1]+4,at[2]+6],[at[0],at[1]+.5,at[2]])
                cell(*start).click();assert page.evaluate('(to)=>window.__v2.moves().some(p=>p.x===to[0]&&p.y===to[1])',list(target)),kind
                cell(*target).click()
                page.wait_for_function('window.__v2.rig("actor").phase==="attacking"',timeout=60000)
                page.locator('#speed-select').select_option('0.25')
                page.wait_for_function('window.__v2.rig("actor").progress>=.48',timeout=30000)
                peak=page.evaluate('window.__v2.rig("actor")')
                if kind=='general':
                    assert page.evaluate('''()=>{const r=window.__p.pieceGroups.get('actor').userData.combatRig;
                      return r.joints.weapon.node.getObjectByName('human-arm-1')?.parent===r.joints.weapon.node
                        && !r.joints.torso.node.getObjectByName('human-arm-1')}''')
                changed=[]
                for name,joint in peak['joints'].items():
                    if sum(abs(a-b) for a,b in zip(joint['position'],joint['restPosition']))+sum(abs(a-b) for a,b in zip(joint['quaternion'],joint['restQuaternion']))>0.01:changed.append(name)
                assert changed,(kind,peak)
                assert abs(peak['at'][1]-.545)<1e-8 and abs(peak['scale']-.68)<1e-8
                snap('attack-'+kind)
                page.locator('#speed-select').select_option('3');done();synced()
                final=page.evaluate('window.__v2.rig("actor")')
                assert final['impacts']==1 and final['phase']=='idle',(kind,final)
                for joint in final['joints'].values():
                    assert sum(abs(a-b) for a,b in zip(joint['position'],joint['restPosition']))<1e-8
                    assert sum(abs(a-b) for a,b in zip(joint['quaternion'],joint['restQuaternion']))<1e-8
                assert page.evaluate('!window.__p.getState().pieces.some(p=>p.id==="victim")')
                report['combat'].append({'kind':kind,'changed_real_joints':changed,'peak':peak,'impacts':1,'restored':True})
                print('Verified actual combat',kind,flush=True)
            report['checks'].append('All seven real models perform distinct actuator attacks, one impact each, then restore rig and commit one capture')
            load(fixture(kind='chariot',start=(0,7),target=(0,6)));page.locator('#speed-select').select_option('3')
            cell(0,7).click();cell(0,6).click();page.wait_for_function('window.__v2.rig("actor").phase==="attacking"',timeout=60000)
            page.locator('#reset-button').click();page.wait_for_timeout(800)
            assert page.evaluate('window.__p.getState().pieces.length===32&&!window.__p.getLocked()')
            assert page.evaluate('[...window.__p.pieceGroups.values()].every(g=>g.userData.combatPhase==="idle"&&g.visible)')
            report['checks'].append('Reset during an attack restores all initial rigs and cancels the pending capture')
            page.set_viewport_size({'width':390,'height':844});page.emulate_media(reduced_motion='reduce')
            snap('06-mobile',True);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            report['checks'].append('390px mobile layout has no horizontal overflow')
        (out/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
        assert not errors,errors
        browser.close();print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)

if __name__=='__main__':run()
