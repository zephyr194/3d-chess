"""Render production Web Audio cues in Chromium and export auditionable WAVs."""
import argparse
import base64
import json
import hashlib
import subprocess
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def run():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default='http://127.0.0.1:5173')
    parser.add_argument('--baseline-url')
    parser.add_argument('--output', default='screenshots/factions-focus/after/audio')
    args = parser.parse_args()
    out = ROOT / args.output
    out.mkdir(parents=True, exist_ok=True)
    source_files = [ROOT / 'src/game/battle-audio.ts', ROOT / 'src/game/battle-drums.ts']
    source_hashes = {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest() for path in source_files}
    baseline = None
    if args.baseline_url:
        baseline = {name: urllib.request.urlopen(args.baseline_url.rstrip('/') + path).read().decode() for name, path in [('main', '/src/main.ts'), ('metal', '/src/game/metal-impact.ts')]}
        ref = '782a93c2bd940a33570f1f84d5ed69410b3bf7f2'
        baseline['source_sha256'] = {}
        for name, path in [('main', 'src/main.ts'), ('metal', 'src/game/metal-impact.ts')]:
            mapping = json.loads(base64.b64decode(baseline[name].rsplit('sourceMappingURL=data:application/json;base64,', 1)[1]))
            original = mapping['sourcesContent'][0].encode()
            assert original == subprocess.check_output(['git', 'show', ref + ':' + path], cwd=ROOT), 'Baseline server source does not match ' + ref
            baseline['source_sha256'][path] = hashlib.sha256(original).hexdigest()
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        page = browser.new_page()
        page.route(args.base_url.rstrip('/') + '/', lambda route: route.fulfill(body='<html><body>Native Web Audio verification</body></html>', content_type='text/html'))
        page.goto(args.base_url, wait_until='networkidle')
        data = page.evaluate('''async(baseline)=>{
          const {renderBattleCue,createBattleMixer,BattleAudio}=await import('/src/game/battle-audio.ts');
          function stats(data,rate){
            let peak=0,power=0,last=0;
            for(let i=0;i<data.length;i++){const v=data[i];peak=Math.max(peak,Math.abs(v));power+=v*v;if(Math.abs(v)>.001)last=i;}
            return {peak,rms:Math.sqrt(power/data.length),last_audible_seconds:last/rate};
          }
          function wav(data,rate){
            const b=new ArrayBuffer(44+data.length*2),v=new DataView(b);
            const text=(at,s)=>[...s].forEach((x,i)=>v.setUint8(at+i,x.charCodeAt(0)));
            text(0,'RIFF');v.setUint32(4,b.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);
            v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);
            text(36,'data');v.setUint32(40,data.length*2,true);data.forEach((x,i)=>v.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,x))*32767),true));
            let s='';const bytes=new Uint8Array(b);for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);
          }
          const rate=22050,clips=[];
          const cues=[['swing',{kind:'swing',troop:'soldier'},1],['metal-impact',{kind:'impact',attacker:'general',defender:'chariot'},1],
            ['horse-impact',{kind:'impact',attacker:'horse',defender:'soldier'},1],['cannon',{kind:'cannon'},1.2],['elephant',{kind:'impact',attacker:'elephant',defender:'soldier'},1],['victory',{kind:'victory'},4.5]];
          for(const [name,cue,seconds] of cues){
            const c=new OfflineAudioContext(1,Math.ceil(seconds*rate),rate),m=createBattleMixer(c);renderBattleCue(c,m.effects,cue);
            const b=await c.startRendering(),d=b.getChannelData(0);clips.push({name,stats:stats(d,rate),wav:wav(d,rate)});
          }
          if(baseline){
            const block=baseline.main.slice(baseline.main.indexOf('let soundEnabled'),baseline.main.indexOf('const scene =')).replace('let audioContext = null;', 'let audioContext = context;');
            const metal=baseline.metal.slice(0,baseline.metal.indexOf('//# sourceMappingURL')).replace('export function','function');
            for(const [name,call,seconds] of [['before-metal-impact','playImpactSound("general","chariot")',1],['before-victory','playAlertSound(true)',4.5]]){
              const c=new OfflineAudioContext(1,Math.ceil(seconds*rate),rate);Object.defineProperty(c,'state',{get:()=> 'running'});
              new Function('context',metal+block+';'+call)(c);const b=await c.startRendering(),d=b.getChannelData(0);
              clips.push({name,stats:stats(d,rate),wav:wav(d,rate)});
            }
          }
          const previewContext=new OfflineAudioContext(1,Math.ceil(13.5*rate),rate),mix=createBattleMixer(previewContext);
          const preview=[[0,{kind:'swing',troop:'soldier'}],[.25,{kind:'impact',attacker:'soldier',defender:'chariot'}],
            [1.5,{kind:'swing',troop:'horse'}],[1.78,{kind:'impact',attacker:'horse',defender:'soldier'}],
            [3.1,{kind:'cannon'}],[3.55,{kind:'impact',attacker:'cannon',defender:'chariot'}],
            [5.2,{kind:'swing',troop:'elephant'}],[5.6,{kind:'impact',attacker:'elephant',defender:'soldier'}],[7.4,{kind:'victory'}]];
          for(const [at,cue] of preview)renderBattleCue(previewContext,mix.effects,cue,at);
          const pb=await previewContext.startRendering();clips.push({name:'battle-preview',stats:stats(pb.getChannelData(0),rate),wav:wav(pb.getChannelData(0),rate)});
          const checks=[];
          for(const action of ['muted','zero','cancel']){
            const c=new OfflineAudioContext(1,rate*5,rate),m=createBattleMixer(c),audio=new BattleAudio();
            Object.defineProperty(c,'state',{get:()=> 'running'});audio.context=c;audio.mixer=m;
            if(action==='muted')audio.setEffectsEnabled(false);
            if(action==='zero')audio.setVolume('effects',0);
            audio.play({kind:'victory'});
            if(action==='cancel')audio.cancelEffects();
            const b=await c.startRendering(),s=stats(b.getChannelData(0),rate);audio.cancelEffects();checks.push({action,...s});
          }
          for(const action of ['mute-during-victory','reset-during-victory']){
            const c=new OfflineAudioContext(1,rate*5,rate),m=createBattleMixer(c),audio=new BattleAudio();
            Object.defineProperty(c,'state',{get:()=> 'running'});audio.context=c;audio.mixer=m;audio.play({kind:'victory'});
            const suspended=c.suspend(.4),rendering=c.startRendering();await suspended;
            if(action==='mute-during-victory')audio.setEffectsEnabled(false);else audio.cancelEffects();
            await c.resume();const b=await rendering,d=b.getChannelData(0);
            checks.push({action,before:stats(d.subarray(0,Math.floor(.35*rate)),rate),after:stats(d.subarray(Math.ceil(.43*rate)),rate)});audio.cancelEffects();
          }
          const full=new OfflineAudioContext(1,rate*2,rate),fm=createBattleMixer(full);fm.effects.gain.value=1;fm.music.gain.value=1;
          for(const cue of [{kind:'cannon'},{kind:'impact',attacker:'chariot',defender:'cannon'},{kind:'victory'}])renderBattleCue(full,fm.effects,cue);
          renderBattleCue(full,fm.music,{kind:'victory'});const fb=await full.startRendering();checks.push({action:'maximum-overlap',...stats(fb.getChannelData(0),rate)});
          return {sample_rate:rate,clips,checks};
        }''', baseline)
        for clip in data['clips']:
            target = out / (clip['name'] + '.wav')
            target.write_bytes(base64.b64decode(clip.pop('wav')))
            clip['file'] = str(target.relative_to(ROOT))
            assert clip['stats']['peak'] < .99, clip
            assert clip['stats']['rms'] > (.001 if clip['name'].startswith('before-') else .015), clip
        for check in data['checks']:
            if check['action'] in ['muted', 'zero', 'cancel']:
                assert check['peak'] == 0, check
            elif 'during' in check['action']:
                assert check['before']['rms'] > .01 and check['after']['peak'] == 0, check
            elif check['action'] == 'maximum-overlap':
                assert check['peak'] < .99, check
        assert next(c for c in data['clips'] if c['name'] == 'victory')['stats']['last_audible_seconds'] > 3.5
        assert source_hashes == {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest() for path in source_files}, 'Audio source changed during verification'
        data['source_sha256'] = source_hashes
        if baseline:
            by_name = {clip['name']: clip['stats'] for clip in data['clips']}
            import math
            data['baseline_comparison'] = {'baseline_source_sha256': baseline['source_sha256'], 'baseline_commit': '782a93c2bd940a33570f1f84d5ed69410b3bf7f2', 'impact_rms_gain_db': 20 * math.log10(by_name['metal-impact']['rms'] / by_name['before-metal-impact']['rms']), 'victory_rms_gain_db': 20 * math.log10(by_name['victory']['rms'] / by_name['before-victory']['rms'])}
            assert data['baseline_comparison']['impact_rms_gain_db'] > 3, data['baseline_comparison']
        (out / 'verification.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps(data, ensure_ascii=False, indent=2))
        browser.close()


if __name__ == '__main__':
    run()
