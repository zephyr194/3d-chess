"""Verify walking, running and troop details through real chess UI handlers."""
import argparse
import hashlib
import importlib.util
import json
import math
import subprocess
import tempfile
from datetime import datetime,timedelta
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('v2',ROOT/'scripts/capture-battlefield-v2.py')
v2=importlib.util.module_from_spec(spec);spec.loader.exec_module(v2)
CASES=[('soldier',(2,6),(2,5)),('horse',(1,7),(2,5)),('chariot',(0,7),(0,6)),
       ('cannon',(1,7),(1,6)),('elephant',(2,9),(4,7)),('advisor',(3,9),(4,8)),('general',(4,9),(4,8))]
SNAPSHOT='''()=>{
  const p=window.__p,T=p.THREE,g=p.pieceGroups.get('actor'),r=g.userData.locomotionRig,d=g.userData.detailsRig;
  p.scene.updateMatrixWorld(true);
  return {root:g.position.toArray(),scale:g.scale.x,pace:g.userData.pace,motion:g.userData.marchMotion,
    upper:Object.fromEntries(Object.entries(g.userData.combatRig.joints).map(([name,j])=>[name,{p:j.node.position.toArray(),q:j.node.quaternion.toArray()}])),
    legs:r.legs.map(l=>({planted:l.planted,sole:l.sole.getWorldPosition(new T.Vector3()).toArray(),knee:l.knee.rotation.x})),
    wheels:r.wheels.map(w=>w.node.quaternion.toArray()),cloth:Array.from(d.cloth.geometry.attributes.position.array)};
}'''


def run():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url',default='http://127.0.0.1:5173')
    parser.add_argument('--record',action='store_true')
    args=parser.parse_args()
    out=ROOT/'screenshots/troop-identity/after';out.mkdir(parents=True,exist_ok=True)
    source=lambda:{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [*sorted((ROOT/'src').rglob('*.*')),ROOT/'index.html']}
    report={'source_sha256':source(),'errors':[],'marches':[],'capture_method':'Native WebGL frames from actual application callbacks on a controlled clock; not a real-time frame-rate measurement'}
    with sync_playwright() as pw,tempfile.TemporaryDirectory(prefix='troop-identity-') as temp:
        browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader'])
        page=browser.new_page(viewport={'width':1280,'height':960},reduced_motion='no-preference',device_scale_factor=1)
        def inject(route):
            response=route.fetch();route.fulfill(response=response,body=response.text()+v2.common.INSTRUMENT+v2.EXPOSE)
        page.route('**/src/main.ts*',inject);page.route('**/favicon.ico',lambda r:r.fulfill(status=204))
        page.on('pageerror',lambda error:report['errors'].append(str(error)))
        page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
        try:
            page.goto(args.base_url,wait_until='networkidle');page.wait_for_function('window.__v2')
            page.evaluate('''()=>{const p=window.__p,render=p.renderer.render.bind(p.renderer);
              window.__draw=()=>render(p.scene,p.camera);p.renderer.render=()=>{};}''')
            page.clock.install();page.clock.pause_at(datetime.now()+timedelta(seconds=1))
            def step(ms=50):page.clock.run_for(ms)
            def press(selector):page.locator(selector).dispatch_event('click')
            def cell(pos):return f'.tactical-cell[data-x="{pos[0]}"][data-y="{pos[1]}"]'
            def load(state):
                press('#reset-button');page.evaluate('s=>window.__v2.load(s)',state)
                if page.locator('#tactical-panel').is_hidden():press('#tactical-toggle')
                page.evaluate('window.__speedSamples=[]')
            def until(expr,limit=120000):
                for _ in range(math.ceil(limit/50)):
                    if page.evaluate(expr):return
                    step()
                raise AssertionError(expr)
            def follow():
                page.evaluate('''()=>{const p=window.__p,at=p.pieceGroups.get('actor').position;
                  p.controls.enableDamping=false;p.camera.position.set(at.x+1.9,at.y+1.8,at.z-3.1);
                  p.controls.target.set(at.x,at.y+.55,at.z);p.controls.update();}''')
            def battle_camera():
                return page.evaluate('''()=>{
                  const p=window.__p,T=p.THREE,actors=['actor','victim'].map(id=>p.pieceGroups.get(id)),
                    center=actors[0].position.clone().add(actors[1].position).multiplyScalar(.5).add(new T.Vector3(0,.55,0)),blockers=[];
                  p.scene.updateMatrixWorld(true);p.battlefield.root.traverse(o=>{if(o.isMesh&&o.visible){const ms=Array.isArray(o.material)?o.material:[o.material];if(ms.some(m=>m.visible&&!m.transparent))blockers.push(o)}});
                  let best;
                  for(const offset of [[2.8,3.2,-4],[-2.8,3.2,-4],[2.8,3.2,4],[-2.8,3.2,4],[0,5,-3],[0,5,3]]){
                    const at=center.clone().add(new T.Vector3(...offset));let clear=0;
                    for(const g of actors)for(const h of [.2,.7,1.2]){
                      const point=g.position.clone().add(new T.Vector3(0,h*.68,0)),v=point.sub(at),ray=new T.Raycaster(at,v.clone().normalize(),0,v.length()-.04);
                      if(!ray.intersectObjects(blockers,false)[0])clear++;
                    }
                    if(!best||clear>best.clear)best={at:at.toArray(),target:center.toArray(),clear};if(clear===6)break;
                  }
                  p.controls.enableDamping=false;p.camera.position.fromArray(best.at);p.controls.target.fromArray(best.target);p.controls.update();return best;
                }''')
            def frame(folder):
                folder.mkdir(exist_ok=True);page.evaluate('window.__draw()')
                page.screenshot(path=str(folder/f'{len(list(folder.glob("*.png"))):04d}.png'))
            def encode(folder,name):
                target=out/(name+'.gif')
                subprocess.run(['ffmpeg','-v','error','-y','-framerate','8','-i',str(folder/'%04d.png'),
                  '-filter_complex','[0:v]scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a',
                  '-loop','0',str(target)],check=True)
                frames=[x for x in subprocess.check_output(['ffmpeg','-v','error','-i',str(target),'-f','framemd5','-'],text=True).splitlines() if x and not x.startswith('#')]
                unique=len({x.rsplit(',',1)[1].strip() for x in frames})
                assert unique>4
                report.setdefault('clips',[]).append({'file':str(target.relative_to(ROOT)),'frames':len(frames),'unique_frames':unique,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
            for kind,start,target in CASES:
                durations={};poses={}
                for pace in ['walk','run']:
                    load(v2.fixture(kind=kind,start=start));page.locator('#speed-select').select_option('0.62' if args.record else '1')
                    page.locator('#pace-select').select_option(pace)
                    press(cell(start));press(cell(target));assert page.evaluate('window.__p.getLocked()')
                    samples=[]
                    for _ in range(16):
                        step(125 if args.record else 50);samples.append(page.evaluate(SNAPSHOT))
                        if args.record and kind in ['soldier','horse']:
                            follow()
                            if page.locator('#tactical-panel').is_visible():press('#tactical-toggle')
                            frame(Path(temp)/kind)
                    assert any(s['pace']==pace for s in samples),(kind,pace,[s['pace'] for s in samples])
                    assert all(s['scale']==.68 and abs(s['root'][1]-.545)<1e-8 for s in samples)
                    soles=[l['sole'][1] for s in samples for l in s['legs']]
                    assert min(soles,default=.545)>=.539,(kind,pace,min(soles))
                    planted=[abs(l['sole'][1]-.545) for s in samples for l in s['legs'] if l['planted']]
                    assert max(planted,default=0)<.01,(kind,pace,max(planted))
                    poses[pace]=samples
                    until('!window.__p.getLocked()')
                    durations[pace]=page.evaluate('window.__speedSamples.reduce((sum,s)=>sum+s.delta,0)')
                    assert page.evaluate('([x,y])=>{const p=window.__p;return p.pieceGroups.get("actor").position.distanceTo(p.gridToWorld({x,y}))<1e-8}',target)
                    rest=page.evaluate('''()=>{const r=window.__p.pieceGroups.get('actor').userData.combatRig;
                      return Object.values(r.joints).every(j=>j.node.position.distanceTo(j.position)<1e-8&&j.node.quaternion.angleTo(j.quaternion)<1e-6)}''')
                    assert rest,(kind,pace,'upper-body failed to settle')
                    print('Verified',kind,pace,flush=True)
                assert abs(durations['walk']-durations['run'])<.06,(kind,durations)
                assert poses['walk'][5]['upper']!=poses['run'][5]['upper'],kind
                report['marches'].append({'kind':kind,'durations':durations,'both_paces':True,'upper_pose_distinct':True,'minimum_sole':min((l['sole'][1] for values in poses.values() for s in values for l in s['legs']),default=None)})
                if args.record and kind in ['soldier','horse']:encode(Path(temp)/kind,'pace-'+kind)
            load(v2.fixture(kind='soldier',start=(2,6)))
            before=page.evaluate(SNAPSHOT);step(250);after=page.evaluate(SNAPSHOT)
            assert before['cloth']!=after['cloth']
            press('#ambience-button');step();frozen=page.evaluate(SNAPSHOT);step(300)
            assert frozen==page.evaluate(SNAPSHOT)
            press('#ambience-button');page.emulate_media(reduced_motion='reduce');step()
            reduced=page.evaluate(SNAPSHOT);step(300);assert reduced==page.evaluate(SNAPSHOT)
            page.emulate_media(reduced_motion='no-preference')
            report['flag_freeze']={'live':True,'off':True,'reduced':True}
            load(v2.fixture(kind='chariot',start=(0,9)))
            page.locator('#pace-select').select_option('run');page.locator('#speed-select').select_option('3')
            watch=v2.common.WATCH.replace('p.battlefield.decks','[p.battlefield.roadGroup,...p.battlefield.decks]')
            watch=watch.replace('const wheels = (actor.userData.wheels ?? []).flatMap(wheel => wheel.quaternion.toArray());','const wheels = actor.userData.locomotionRig.wheels.flatMap(wheel => wheel.node.quaternion.toArray());')
            page.evaluate(watch,'actor');press(cell((0,9)));press(cell((0,0)));until('!window.__p.getLocked()')
            ferry=page.evaluate('window.__watch.stop()')
            assert not ferry['failures'] and not ferry['gaitFailures'] and any(s['motion']=='riding' for s in ferry['samples'])
            assert all(len(s['wheels'])==16 for s in ferry['samples'])
            report['ferry']={'frames':len(ferry['samples']),'rays':len(ferry['samples'])*9,'unsupported':0,'gait_failures':0}
            report['attacks']=[]
            for kind,start,target in [('soldier',(2,4),(3,4)),('horse',(1,7),(2,5)),('chariot',(0,7),(0,6)),('cannon',(1,7),(1,3)),('elephant',(2,9),(4,7)),('advisor',(3,9),(4,8)),('general',(4,9),(4,8))]:
                state=v2.fixture(kind=kind,start=start,target=target)
                if kind in ['advisor','general']:state['pieces'][-1]['kind']='soldier'
                load(state);page.locator('#pace-select').select_option('run');page.locator('#speed-select').select_option('3');press(cell(start));press(cell(target))
                until('window.__v2.rig("actor").phase==="attacking"')
                if args.record:
                    framing=battle_camera();assert framing['clear']>=4,(kind,framing)
                    page.locator('#speed-select').select_option('0.62')
                    if page.locator('#tactical-panel').is_visible():press('#tactical-toggle')
                    for _ in range(16):step(125);frame(Path(temp)/'combat')
                    page.locator('#speed-select').select_option('3')
                else:step(50)
                assert page.locator('#battle-banner').is_visible()
                until('!window.__p.getLocked()')
                assert page.evaluate('window.__v2.rig("actor").impacts===1&&!window.__p.getState().pieces.some(p=>p.id==="victim")')
                report['attacks'].append({'kind':kind,'impact':1,'capture':True})
            if args.record:encode(Path(temp)/'combat','seven-troop-combat')
            press('#reset-button');step(1500)
            assert page.evaluate('window.__p.getState().pieces.length===32&&!window.__p.getLocked()')
            page.set_viewport_size({'width':390,'height':844});step(300)
            assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
            assert page.locator('#pace-select').is_visible()
            page.evaluate('window.__draw()');page.screenshot(path=str(out/'mobile-pace.png'),full_page=True)
            report['mobile']=True
            assert not report['errors'],report['errors']
            assert source()==report['source_sha256'],'Product changed during verification'
            report['status']='PASS'
        except Exception as error:
            report['status']='FAIL';report['failure']=str(error);raise
        finally:
            (out/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');browser.close()


if __name__=='__main__':run()
