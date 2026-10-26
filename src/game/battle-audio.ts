import type { PieceKind } from "./xiangqi";
import type { Surface } from "../scene/landscape-layout";

export type BattleCue =
  | { kind: "select" | "cannon" | "check" | "victory" }
  | { kind: "step"; troop: PieceKind; step: number; surface?: Surface }
  | { kind: "swing"; troop: PieceKind }
  | { kind: "impact"; attacker: PieceKind; defender: PieceKind };
export type AudioPort = { context: AudioContext; output: AudioNode };
type ToneLayer = { kind: "tone"; at: number; duration: number; gain: number; from: number; to: number; wave: OscillatorType; attack: number };
type NoiseLayer = { kind: "noise"; at: number; duration: number; gain: number; from: number; to: number; filter: BiquadFilterType; attack: number };
export type SoundLayer = ToneLayer | NoiseLayer;
export type SoundVoice = { cancel: () => void; duration: number };

export function scoreBattleCue(cue: BattleCue): SoundLayer[] {
  const layers: SoundLayer[] = [];
  const tone = (from: number, to: number, duration: number, gain: number, wave: OscillatorType = "sine", at = 0, attack = .006) =>
    layers.push({ kind: "tone", from, to, duration, gain, wave, at, attack });
  const noise = (from: number, to: number, duration: number, gain: number, filter: BiquadFilterType = "lowpass", at = 0, attack = .004) =>
    layers.push({ kind: "noise", from, to, duration, gain, filter, at, attack });
  const drum = (gain: number, at = 0, low = 44) => {
    tone(135, low, .34, gain, "sine", at);
    noise(1600, 180, .12, gain * .55, "lowpass", at);
  };
  const metal = (gain: number) => {
    for (const [frequency, length, level] of [[920, .68, 1], [1471, .5, .62], [2437, .32, .35], [3271, .2, .18]])
      tone(frequency, frequency * .97, length, gain * level);
    noise(4600, 1700, .12, gain * 2.1, "bandpass");
  };
  switch (cue.kind) {
    case "select":
      tone(490, 690, .12, .13, "sine");
      tone(980, 1180, .09, .055, "triangle", .025);
      break;
    case "step": {
      if (cue.surface === "boardwalk") {
        tone(cue.step % 2 ? 170 : 205, 90, .11, .16, "triangle");
        noise(1900, 800, .065, .11);
        break;
      }
      if (cue.surface === "mud") {
        noise(730, 190, .17, .33);
        tone(110, 50, .12, .12);
        break;
      }
      const profiles: Record<PieceKind, readonly [number, number, number]> = {
        soldier: [190, .12, .15], general: [155, .17, .17], advisor: [220, .11, .11],
        horse: [235, .15, .23], elephant: [85, .3, .29], chariot: [112, .23, .2], cannon: [96, .2, .18],
      };
      const [frequency, duration, gain] = profiles[cue.troop];
      tone(frequency * (cue.step % 2 ? .84 : 1), 46, duration, gain, "triangle");
      noise(cue.troop === "horse" ? 2200 : 1050, 250, duration * .75, gain * .8);
      break;
    }
    case "swing": {
      const heavy = cue.troop === "elephant" || cue.troop === "chariot";
      const duration = heavy ? .4 : .25;
      noise(heavy ? 550 : 950, heavy ? 2400 : 6100, duration, heavy ? .76 : .58, "bandpass", 0, duration * .42);
      tone(heavy ? 120 : 220, 48, duration, .08, "triangle", .03, .04);
      break;
    }
    case "cannon":
      drum(.7, 0, 27);
      noise(4200, 210, .75, .95);
      tone(210, 37, .54, .22, "sawtooth");
      noise(1700, 180, .4, .24, "lowpass", .16);
      break;
    case "impact": {
      const gain = cue.attacker === "general" ? .27 : .23;
      if (cue.attacker === "advisor") {
        tone(440, 420, .62, .21, "triangle");
        tone(880, 840, .48, .13, "sine", .035);
        noise(2800, 720, .24, .33, "bandpass");
      } else if (cue.attacker === "elephant") {
        drum(.64, 0, 27);
        noise(1800, 130, .66, .72);
      } else if (cue.attacker === "cannon") {
        drum(.68, 0, 24);
        noise(3600, 160, .8, .9);
        metal(.11);
      } else {
        metal(cue.attacker === "chariot" ? gain * .78 : gain);
        if (cue.attacker === "chariot") noise(950, 170, .5, .42);
        if (cue.attacker === "horse") tone(190, 55, .27, .2, "triangle", .035);
        drum(cue.attacker === "chariot" || cue.attacker === "horse" ? .5 : .32);
        noise(cue.defender === "cannon" || cue.defender === "chariot" ? 3100 : 1600, 350, .24, .3);
      }
      break;
    }
    case "check":
      tone(220, 165, .48, .24, "triangle");
      tone(330, 247, .42, .16, "triangle", .12);
      drum(.27);
      break;
    case "victory": {
      metal(.15);
      for (const at of [0, .18, .36, .54, .9, 1.2, 1.5, 1.8, 2.1, 2.25, 2.4]) drum(at >= 2.1 ? .48 : .32, at);
      const melody = [[261.63, 0, .34], [329.63, .3, .34], [392, .6, .4], [523.25, .95, .72], [493.88, 1.65, .3], [523.25, 1.95, .42], [659.25, 2.4, 1.5]];
      for (const [frequency, at, duration] of melody) {
        tone(frequency, frequency, duration, .19, "sawtooth", at, .035);
        tone(frequency * .5, frequency * .5, duration, .12, "triangle", at, .03);
      }
      for (const frequency of [130.81, 261.63, 392, 523.25]) tone(frequency, frequency, 1.65, .11, "triangle", 2.4, .06);
      noise(7200, 1000, 1.5, .25, "highpass", 2.4, .035);
      break;
    }
  }
  return layers;
}

export function renderBattleCue(context: BaseAudioContext, output: AudioNode, cue: BattleCue, at = context.currentTime): SoundVoice {
  const layers = scoreBattleCue(cue);
  const sources = new Set<AudioScheduledSourceNode>();
  const nodes: AudioNode[] = [];
  const bus = context.createGain();
  bus.connect(output);
  let remaining = layers.length;
  let cleaned = false;
  const clean = () => {
    if (cleaned) return;
    cleaned = true;
    for (const node of nodes) node.disconnect();
    bus.disconnect();
  };
  let seed = 0x7f4a7c15;
  for (const layer of layers) {
    const gain = context.createGain();
    const start = at + layer.at, end = start + layer.duration;
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(layer.gain, start + Math.min(layer.attack, layer.duration * .45));
    gain.gain.exponentialRampToValueAtTime(layer.gain * .22, start + layer.duration * .55);
    gain.gain.exponentialRampToValueAtTime(.0001, end);
    gain.connect(bus);
    nodes.push(gain);
    let source: AudioScheduledSourceNode;
    if (layer.kind === "tone") {
      const oscillator = context.createOscillator();
      oscillator.type = layer.wave;
      oscillator.frequency.setValueAtTime(layer.from, start);
      oscillator.frequency.exponentialRampToValueAtTime(layer.to, end);
      oscillator.connect(gain);
      source = oscillator;
    } else {
      const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * layer.duration), context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        data[i] = (seed >>> 0) / 2147483648 - 1;
      }
      const noise = context.createBufferSource();
      const filter = context.createBiquadFilter();
      noise.buffer = buffer;
      filter.type = layer.filter;
      filter.Q.value = .65;
      filter.frequency.setValueAtTime(layer.from, start);
      filter.frequency.exponentialRampToValueAtTime(layer.to, end);
      noise.connect(filter).connect(gain);
      nodes.push(filter);
      source = noise;
    }
    nodes.push(source);
    sources.add(source);
    source.onended = () => { sources.delete(source); if (!--remaining) clean(); };
    source.start(start);
    source.stop(end + .008);
  }
  return {
    duration: Math.max(...layers.map(layer => layer.at + layer.duration)) + .008,
    cancel() {
      bus.gain.cancelScheduledValues(context.currentTime);
      bus.gain.setValueAtTime(0, context.currentTime);
      for (const source of sources) source.stop();
      sources.clear();
      clean();
    },
  };
}

export function createBattleMixer(context: BaseAudioContext) {
  const effects = context.createGain(), music = context.createGain(), compressor = context.createDynamicsCompressor(), master = context.createGain();
  effects.gain.value = .75;
  music.gain.value = .4;
  compressor.threshold.value = -10;
  compressor.knee.value = 8;
  compressor.ratio.value = 8;
  compressor.attack.value = .003;
  compressor.release.value = .15;
  master.gain.value = .78;
  effects.connect(compressor); music.connect(compressor); compressor.connect(master).connect(context.destination);
  return { effects, music, master };
}

export class BattleAudio {
  private context: AudioContext | null = null;
  private mixer: ReturnType<typeof createBattleMixer> | null = null;
  private enabled = true;
  private levels = { effects: .75, music: .4 };
  private voices = new Set<SoundVoice>();
  private cleanups = new Set<ReturnType<typeof setTimeout>>();
  private dead = false;

  unlock() {
    if (this.dead) return;
    if (!this.context) {
      this.context = new AudioContext();
      this.mixer = createBattleMixer(this.context);
      this.mixer.effects.gain.value = this.enabled ? this.levels.effects : 0;
      this.mixer.music.gain.value = this.levels.music;
    }
    if (this.context.state === "suspended") void this.context.resume();
  }
  musicPort(): AudioPort | null {
    this.unlock();
    return this.context && this.mixer ? { context: this.context, output: this.mixer.music } : null;
  }
  play(cue: BattleCue) {
    if (!this.enabled || this.dead || this.levels.effects === 0) return;
    this.unlock();
    if (!this.context || !this.mixer) return;
    const voice = renderBattleCue(this.context, this.mixer.effects, cue);
    this.voices.add(voice);
    const cleanup = setTimeout(() => { this.voices.delete(voice); this.cleanups.delete(cleanup); }, (voice.duration + .1) * 1000);
    this.cleanups.add(cleanup);
  }
  setVolume(bus: "effects" | "music", value: number) {
    this.levels[bus] = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
    if (this.context && this.mixer) this.mixer[bus].gain.setValueAtTime(bus === "effects" && !this.enabled ? 0 : this.levels[bus], this.context.currentTime);
    if (bus === "effects" && this.levels.effects === 0) this.cancelEffects();
  }
  setEffectsEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.cancelEffects();
    if (this.context && this.mixer) this.mixer.effects.gain.setValueAtTime(enabled ? this.levels.effects : 0, this.context.currentTime);
  }
  cancelEffects() {
    for (const voice of this.voices) voice.cancel();
    this.voices.clear();
    for (const timer of this.cleanups) clearTimeout(timer);
    this.cleanups.clear();
  }
  dispose() {
    this.cancelEffects();
    this.dead = true;
    void this.context?.close();
  }
}
