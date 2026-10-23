"""Capture native browser views for jointed troops and battlefield feedback."""
import argparse
import importlib.util
import json
import subprocess
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('v2_capture', ROOT / 'scripts/capture-battlefield-v2.py')
previous = importlib.util.module_from_spec(spec)
spec.loader.exec_module(previous)


def run():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stage', choices=['before', 'after'], required=True)
    parser.add_argument('--base-url', default='http://127.0.0.1:5173')
    args = parser.parse_args()
    out = ROOT / 'screenshots/living-troops' / args.stage
    out.mkdir(parents=True, exist_ok=True)
    report = {'stage': args.stage, 'commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(), 'errors': []}
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'])
        page = browser.new_page(viewport={'width': 1280, 'height': 960}, device_scale_factor=1, reduced_motion='no-preference')
        def inject(route):
            response = route.fetch()
            route.fulfill(response=response, body=response.text() + previous.common.INSTRUMENT + previous.EXPOSE)
        page.route('**/src/main.ts*', inject)
        page.route('**/favicon.ico', lambda route: route.fulfill(status=204))
        page.on('pageerror', lambda error: report['errors'].append(str(error)))
        page.goto(args.base_url, wait_until='networkidle')
        page.wait_for_function('window.__v2')
        page.evaluate('window.__p.renderer.setAnimationLoop(null)')
        def capture(name, camera=None, target=None):
            if camera:
                page.evaluate('([at,to])=>{const p=window.__p;p.controls.enableDamping=false;p.camera.position.fromArray(at);p.controls.target.fromArray(to);p.controls.update()}', [camera, target])
            page.evaluate('window.__p.render()')
            page.screenshot(path=str(out / (name + '.png')), full_page=True)
            print('Captured', args.stage, name, flush=True)
        capture('01-overview')
        capture('02-waterfall', [1, 6, 10], [5.6, 3.2, 0])
        capture('09-road-junction', [5, 5.5, 14], [1.1, .54, 11.3])
        capture('10-road-junction-oblique', [-3, 2.4, 13], [1.1, .54, 11.3])
        page.evaluate('s=>window.__v2.load(s)', previous.fixture(kind='soldier', start=(2, 6)))
        pos = page.evaluate('window.__p.gridToWorld({x:2,y:6}).toArray()')
        at = [pos[0]+2.4, pos[1]+2.3, pos[2]-3.3]
        target = [pos[0], pos[1]+.6, pos[2]]
        capture('03-troop-detail', at, target)
        page.evaluate('window.__p.renderer.setAnimationLoop(null)')
        page.evaluate('''()=>{const p=window.__p, root=p.battlefield.root;
          const names=['river-flow-glint','headwater-cascade','cascade-whitewater','cascade-spray','pine-canopy','windborne-leaf'];
          const snapshot=()=>Object.fromEntries(names.map(name=>{const m=root.getObjectByName(name);return [name,m?{position:m.position.toArray(),rotation:m.rotation.toArray(),vertices:m.geometry?.attributes?.position?.array.slice(0,18),matrix:m.instanceMatrix?.array.slice(0,32)}:null]}));
          p.battlefield.update(500,false);const before=snapshot();p.battlefield.update(1700,false);window.__motionAudit={before,after:snapshot()};}''')
        report['motion'] = page.evaluate('window.__motionAudit')
        (out / 'inspection.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        assert not report['errors'], report['errors']
        browser.close()


if __name__ == '__main__':
    run()
