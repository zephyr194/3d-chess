import type { GameState } from "./xiangqi";
/** Small Web Audio score. Starts from a user gesture and never catches up hidden beats. */
export class BattleDrums {
  private context: AudioContext | null = null;
  private out: GainNode | null = null;
  private timer = 0;
  private beat = 0;
  private strength = 0;
  private enabled = true;
  private volume = 0.28;
  private dead = false;
  unlock() {
    if (this.dead) return;
    if (!this.context) {
      this.context = new AudioContext();
      this.out = this.context.createGain();
      this.out.gain.value = this.volume * 0.4;
      this.out.connect(this.context.destination);
    }
    void this.context.resume();
    this.schedule();
  }
  private schedule() {
    if (
      this.timer ||
      !this.enabled ||
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
    if (v) {
      this.unlock();
    } else this.stop();
  }
  setVolume(v: number) {
    this.volume = v;
    if (this.out && this.context)
      this.out.gain.setTargetAtTime(v * 0.4, this.context.currentTime, 0.05);
  }
  visibility() {
    this.stop();
    if (!document.hidden) this.schedule();
  }
  dispose() {
    this.dead = true;
    this.stop();
    void this.context?.close();
  }
}
