import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { PieceKind, Side } from "../src/game/xiangqi";
import { applyCombatPose, createTroopRig, sampleCombat } from "../src/scene/combat";
import { createTroopDetails, restoreTroopDetails, updateTroopDetails } from "../src/scene/troop-details";

const pivots = {
  soldier: { spear: [.3, .78, 0], shield: [-.25, .78, 0] },
  general: { torso: [0, .5, 0], weapon: [.28, .78, 0] },
  advisor: { tabletArm: [.2, .85, 0] },
  horse: { rider: [0, .72, .08], lance: [.28, 1.1, 0], head: [0, .9, -.35] },
  elephant: { head: [0, .85, -.3], trunk: [0, .79, -.55], foot: [.24, .55, -.21] },
  chariot: { chassis: [0, .45, 0], ram: [0, .54, -.15] },
  cannon: { barrel: [0, .67, 0], trunnion: [0, .67, 0] },
} satisfies Record<PieceKind, Record<string, number[]>>;
const kinds = Object.keys(pivots) as PieceKind[];

function fixture(kind: PieceKind, side: Side) {
  const model = new THREE.Group();
  const joints = Object.fromEntries(Object.entries(pivots[kind]).map(([name, at]) => {
    const node = new THREE.Group();
    node.position.fromArray(at);
    model.add(node);
    return [name, node];
  }));
  const combat = createTroopRig(kind, joints as never);
  const material = new THREE.MeshStandardMaterial({ color: "#ffffff" });
  const rig = createTroopDetails(kind, side, { model, combat }, {
    faction: material, cream: material, gold: material, wood: material, steel: material, dark: material, mark: new THREE.Texture(),
  });
  return { model, rig, combat };
}

function bodyGeometry(model: THREE.Group) {
  const coordinates: string[] = [];
  model.updateMatrixWorld(true);
  model.traverse(node => {
    if (!(node instanceof THREE.Mesh) || node.name.startsWith("standard") || node.name.endsWith("-cloth")) return;
    const positions = node.geometry.getAttribute("position");
    const point = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld);
      coordinates.push(point.toArray().map(x => x.toFixed(3)).join(","));
    }
  });
  return new Set(coordinates);
}

describe("regular army and wilderness silhouettes", () => {
  it.each(kinds)("distinguishes %s factions through body geometry at identical material input", kind => {
    const red = bodyGeometry(fixture(kind, "red").model);
    const black = bodyGeometry(fixture(kind, "black").model);
    const exclusive = [...black].filter(point => !red.has(point));
    expect(exclusive.length / black.size).toBeGreaterThan(.35);
  });

  it.each(kinds)("keeps %s tribal standard pinned and its glyph attached during motion and reset", kind => {
    const { model, rig, combat } = fixture(kind, "black");
    const mark = rig.cloth.getObjectByName("standard-mark") as THREE.Mesh;
    expect(mark.geometry).toBe(rig.cloth.geometry);
    const before = Array.from(rig.restVertices);
    updateTroopDetails(rig, { time: 1.3, moving: true, pace: "run", reduced: false, attackProgress: .5 });
    applyCombatPose(combat, sampleCombat(kind, .55));
    model.updateMatrixWorld(true);
    const positions = rig.cloth.geometry.getAttribute("position");
    let freeMoved = false;
    for (let i = 0; i < positions.count; i++) {
      const dz = positions.getZ(i) - before[i * 3 + 2];
      if (positions.getX(i) === 0) expect(dz).toBe(0);
      else if (Math.abs(dz) > .001) freeMoved = true;
    }
    expect(freeMoved).toBe(true);
    expect(mark.geometry.getAttribute("position")).toBe(positions);
    restoreTroopDetails(rig);
    expect(Array.from(positions.array)).toEqual(before);
  });

  it("gives seven tribal standards different cuts and distinguishes every cut from its army counterpart", () => {
    const signatures = kinds.map(kind => {
      const red = fixture(kind, "red").rig.restVertices;
      const black = fixture(kind, "black").rig.restVertices;
      expect(Array.from(black)).not.toEqual(Array.from(red));
      return Array.from(black).join(",");
    });
    expect(new Set(signatures).size).toBe(kinds.length);
  });
});
