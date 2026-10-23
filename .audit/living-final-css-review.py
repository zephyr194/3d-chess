import hashlib
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path('/workspace/3d-chess')
report = {'source_css_sha256': hashlib.sha256((root / 'src/styles.css').read_bytes()).hexdigest(), 'errors': []}
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'])
    page = browser.new_page(viewport={'width': 1280, 'height': 960}, reduced_motion='no-preference')
    def inject(route):
        response = route.fetch()
        route.fulfill(response=response, body=response.text() + '\nrenderer.setAnimationLoop(null);window.__cssReview={battleBanner,attackProfiles,readPresentationRate};')
    page.route('**/src/main.ts*', inject)
    page.on('pageerror', lambda error: report['errors'].append(str(error)))
    page.goto('http://127.0.0.1:5173', wait_until='networkidle')
    page.wait_for_function('window.__cssReview')
    page.locator('#speed-select').select_option('3')
    report['fast_rate'] = page.evaluate('__cssReview.readPresentationRate()')
    report['earliest_impact_ms'] = page.evaluate('Math.min(...Object.values(__cssReview.attackProfiles).map(p=>p.duration*p.impact/__cssReview.readPresentationRate()*1000))')
    page.evaluate('__cssReview.battleBanner.show({kind:"engage",side:"red",actor:"soldier",target:"horse"})')
    report['entrance'] = page.evaluate('''()=>{
        const e=document.querySelector('#battle-banner');
        return e.getAnimations({subtree:true}).map(a=>{
            a.pause();
            const duration=a.effect.getTiming().duration;
            a.currentTime=duration;
            return {name:a.animationName,duration,state:a.playState};
        });
    }''')
    assert len(report['entrance']) == 5
    assert all(item['duration'] == 160 for item in report['entrance'])
    assert all(item['duration'] < report['earliest_impact_ms'] for item in report['entrance'])
    assert page.evaluate('__cssReview.battleBanner.impact()') is True
    assert page.evaluate('__cssReview.battleBanner.impact()') is False
    report['impact_names'] = page.evaluate('Array.from(document.querySelector("#battle-banner").getAnimations({subtree:true}),a=>a.animationName)')
    assert {'metal-jolt', 'metal-flash', 'metal-sheen', 'metal-spark'}.issubset(report['impact_names'])
    page.set_viewport_size({'width': 390, 'height': 844})
    page.evaluate('__cssReview.battleBanner.show({kind:"engage",side:"red",actor:"soldier",target:"horse"})')
    page.evaluate('document.querySelector("#battle-banner").getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=a.effect.getTiming().duration;})')
    report['mobile_seal'] = page.evaluate('''()=>{
        const e=document.querySelector('.banner-seal'),s=getComputedStyle(e),r=e.getBoundingClientRect();
        return {text:e.textContent,whiteSpace:s.whiteSpace,lineHeight:s.lineHeight,writingMode:s.writingMode,width:r.width,height:r.height,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight};
    }''')
    seal = report['mobile_seal']
    assert seal['text'] == '交锋'
    assert seal['whiteSpace'] == 'nowrap' and seal['writingMode'] == 'vertical-rl'
    assert seal['scrollWidth'] == seal['clientWidth'] and seal['scrollHeight'] == seal['clientHeight']
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    report['mobile_banner'] = page.locator('#battle-banner').bounding_box()
    page.emulate_media(reduced_motion='reduce')
    page.evaluate('__cssReview.battleBanner.show({kind:"engage",side:"black",actor:"general",target:"general"});__cssReview.battleBanner.impact()')
    report['reduced_motion'] = page.evaluate('''()=>({animations:document.querySelector('#battle-banner').getAnimations({subtree:true}).length,sparks:getComputedStyle(document.querySelector('.banner-sparks')).display,clash:getComputedStyle(document.querySelector('.banner-clash')).display})''')
    assert report['reduced_motion'] == {'animations': 0, 'sparks': 'none', 'clash': 'none'}
    browser.close()
assert not report['errors']
report['status'] = 'PASS'
(root / '.audit/living-final-css-evidence.json').write_text(json.dumps(report, indent=2, ensure_ascii=False))
print(json.dumps(report, ensure_ascii=False))
