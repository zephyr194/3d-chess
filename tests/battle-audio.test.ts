import { describe, expect, it } from "vitest";
import { scoreBattleCue, type BattleCue } from "../src/game/battle-audio";
import type { PieceKind } from "../src/game/xiangqi";

const troops: PieceKind[] = ["soldier", "general", "advisor", "horse", "elephant", "chariot", "cannon"];
const end = (cue: BattleCue) => Math.max(...scoreBattleCue(cue).map(layer => layer.at + layer.duration));

describe("battle audio scores", () => {
  it("gives every troop a distinct impact and a preceding swing", () => {
    const identities = troops.map(attacker => {
      const impact = scoreBattleCue({ kind: "impact", attacker, defender: "soldier" });
      const swing = scoreBattleCue({ kind: "swing", troop: attacker });
      expect(swing.some(layer => layer.kind === "noise" && layer.to > layer.from)).toBe(true);
      expect(impact.length).toBeGreaterThan(2);
      return JSON.stringify(impact);
    });
    expect(new Set(identities).size).toBe(troops.length);
  });
  it("retains the metallic ring after the initial collision", () => {
    const layers = scoreBattleCue({ kind: "impact", attacker: "soldier", defender: "chariot" });
    expect(layers.some(layer => layer.kind === "tone" && layer.from > 800 && layer.duration > .5)).toBe(true);
    expect(layers.some(layer => layer.kind === "noise" && layer.filter === "bandpass")).toBe(true);
  });
  it("builds victory into a sustained four-second fanfare", () => {
    const cue = { kind: "victory" } as const;
    expect(end(cue)).toBeGreaterThanOrEqual(4);
    expect(end(cue)).toBeLessThan(4.5);
    expect(scoreBattleCue(cue).some(layer => layer.at > 2 && layer.duration > 1)).toBe(true);
    expect(end({ kind: "check" })).toBeLessThan(1);
  });
  it("uses surface footsteps without losing ordinary troop identities", () => {
    const walks = troops.map(troop => JSON.stringify(scoreBattleCue({ kind: "step", troop, step: 0 })));
    expect(new Set(walks).size).toBe(troops.length);
    expect(scoreBattleCue({ kind: "step", troop: "soldier", step: 0, surface: "mud" }))
      .not.toEqual(scoreBattleCue({ kind: "step", troop: "soldier", step: 0, surface: "boardwalk" }));
  });
  it("schedules finite positive layers for all playable cues", () => {
    const cues: BattleCue[] = [{ kind: "select" }, { kind: "cannon" }, { kind: "check" }, { kind: "victory" },
      ...troops.flatMap(troop => [{ kind: "step", troop, step: 3 }, { kind: "swing", troop }, { kind: "impact", attacker: troop, defender: troop }] as BattleCue[])];
    for (const cue of cues) for (const layer of scoreBattleCue(cue)) {
      expect(layer.gain).toBeGreaterThan(0);
      expect(layer.at).toBeGreaterThanOrEqual(0);
      expect(layer.duration).toBeGreaterThan(layer.attack);
      expect(Number.isFinite(layer.from) && Number.isFinite(layer.to)).toBe(true);
      expect(Math.min(layer.from, layer.to)).toBeGreaterThan(0);
    }
  });
});
