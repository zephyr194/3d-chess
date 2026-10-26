import type { GameState } from "./xiangqi";
import type { AudioPort } from "./battle-audio";
export class BattleDrums {
  private context: AudioContext | null = null;
  private out: GainNode | null = null;
  private timer = 0;
  private beat = 0;
  private strength = 0;
  private enabled = true;
  private volume: number;
  private finished = false;
  constructor(private readonly port?: () => AudioPort | null) {
    this.volume = port ? 1 : .4;
  }
  private dead = false;
  unlock() {
    if (this.dead) return;
    if (!this.context) {
      const shared = this.port?.();
      if (this.port && !shared) return;
      this.context = shared?.context ?? new AudioContext();
      this.out = this.context.createGain();
      this.out.gain.value = this.enabled && !this.finished ? this.volume : 0;
      this.out.connect(shared?.output ?? this.context.destination);
    }
    void this.context.resume();
    this.schedule();
  }
  private schedule() {
    if (
      this.timer ||
      !this.enabled ||
      this.finished ||
      document.hidden ||
      !this.context ||
      this.dead
    )
      return;
    this.timer = window.setInterval(
      () => this.play(),
      320 - this.strength * 65,
    );
  }
  private stop() {
    clearInterval(this.timer);
    this.timer = 0;
  }
  private play() {
    const c = this.context;
    if (!c || !this.out || c.state !== "running") return;
    const b = this.beat++ % 8;
    if (b % 2 && this.strength < 0.5) return;
    const o = c.createOscillator(),
      g = c.createGain(),
      time = c.currentTime;
    o.type = "sine";
    o.frequency.setValueAtTime(b === 0 ? 85 : 118, time);
    o.frequency.exponentialRampToValueAtTime(35, time + 0.22);
    g.gain.setValueAtTime(0.001, time);
    g.gain.exponentialRampToValueAtTime(b === 0 ? 0.7 : 0.32, time + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.28);
    o.connect(g).connect(this.out);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
    o.start(time);
    o.stop(time + 0.3);
    if (b === 0) {
      const bass = c.createOscillator(),
        gain = c.createGain();
      bass.type = "triangle";
      bass.frequency.value = 55;
      gain.gain.setValueAtTime(0.09, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 1);
      bass.connect(gain).connect(this.out);
      bass.onended = () => {
        bass.disconnect();
        gain.disconnect();
      };
      bass.start(time);
      bass.stop(time + 1);
    }
  }
  setState(state: GameState, check = false, capture = false) {
    const crossings = state.pieces.filter((p) =>
      p.side === "red" ? p.y < 5 : p.y > 4,
    ).length;
    this.finished = Boolean(state.winner);
    if (this.out && this.context) this.out.gain.setValueAtTime(this.enabled && !this.finished ? this.volume : 0, this.context.currentTime);
    this.strength = state.winner
      ? 0
      : Math.min(
          1,
          crossings * 0.07 +
            (32 - state.pieces.length) * 0.025 +
            (check ? 0.35 : 0) +
            (capture ? 0.2 : 0),
        );
    this.stop();
    this.schedule();
  }
  setEnabled(v: boolean) {
    this.enabled = v;
    if (this.out && this.context) this.out.gain.setValueAtTime(v && !this.finished ? this.volume : 0, this.context.currentTime);
    if (v) {
      this.unlock();
    } else this.stop();
  }
  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
    if (this.out && this.context)
      this.out.gain.setValueAtTime(this.enabled && !this.finished ? this.volume : 0, this.context.currentTime);
  }
  visibility() {
    this.stop();
    if (this.out && this.context) this.out.gain.setValueAtTime(!document.hidden && this.enabled && !this.finished ? this.volume : 0, this.context.currentTime);
    if (!document.hidden) this.schedule();
  }
  dispose() {
    this.dead = true;
    this.stop();
    this.out?.disconnect();
    if (!this.port) void this.context?.close();
  }
}
