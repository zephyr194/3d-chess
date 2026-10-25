import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { PieceKind, Side } from "../src/game/xiangqi";
import { createTroopRig } from "../src/scene/combat";
import { createTroopDetails, restoreTroopDetails, updateTroopDetails } from "../src/scene/troop-details";

const kinds: PieceKind[] = ["soldier", "general", "advisor", "horse", "elephant", "chariot", "cannon"];
const pivots: Record<PieceKind, Record<string, [number, number, number]>> = {
  soldier: { spear: [.3, .78, 0], shield: [-.25, .78, 0] },
  general: { torso: [0, .5, 0], weapon: [.28, .78, 0] },
  advisor: { tabletArm: [.2, .85, 0] },
  horse: { rider: [0, .72, .08], lance: [.28, 1.1, 0], head: [0, .9, -.35] },
  elephant: { head: [0, .85, -.3], trunk: [0, .79, -.55], foot: [.24, .55, -.21] },
  chariot: { chassis: [0, .45, 0], ram: [0, .54, -.15] },
  cannon: { barrel: [0, .67, 0], trunnion: [0, .67, 0] },
};
function fixture(kind: PieceKind, side: Side = "red") {
  const model = new THREE.Group();
  const sole = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .1));
  sole.position.y = .05;
  model.add(sole);
  const joints = Object.fromEntries(Object.entries(pivots[kind]).map(([name, at]) => {
    const joint = new THREE.Group();
    joint.position.set(...at);
    model.add(joint);
    return [name, joint];
  }));
  const material = new THREE.MeshStandardMaterial();
  const combat = createTroopRig(kind, joints as never);
  const rig = createTroopDetails(kind, side, { model, combat }, {
    faction: material, cream: material, gold: material, wood: material, steel: material, dark: material, mark: new THREE.Texture(),
  });
  return { model, rig, joints };
}

const motion = { time: 1.7, moving: true, pace: "run" as const, reduced: false };

describe("troop identities and physical standards", () => {
  it("gives all seven standards distinct actual cloth outlines", () => {
    const signatures = kinds.map((kind) => {
      const { rig } = fixture(kind);
      const points = rig.restVertices;
      expect(points.length).toBeGreaterThan(30);
      const xs = [], ys = [];
      for (let i = 0; i < points.length; i += 3) { xs.push(points[i]); ys.push(points[i + 1]); }
      const width = -Math.min(...xs), height = -Math.min(...ys);
      const unique = new Set<string>();
      for (let i = 0; i < points.length; i += 3) unique.add(`${(points[i] / width).toFixed(5)},${(points[i + 1] / height).toFixed(5)}`);
      return [...unique].sort().join(";");
    });
    expect(new Set(signatures).size).toBe(7);
  });

  it.each(kinds)("pins the %s cloth pole edge while free vertices flutter within bounds", (kind) => {
    const { model, rig } = fixture(kind);
    const pole = rig.standard.getObjectByName("standard-pole")!;
    model.updateMatrixWorld(true);
    const poleTransform = pole.matrixWorld.clone();
    updateTroopDetails(rig, motion);
    model.updateMatrixWorld(true);
    expect(pole.matrixWorld.equals(poleTransform)).toBe(true);
    const positions = rig.cloth.geometry.getAttribute("position");
    let changed = false, pinned = 0;
    for (let i = 0; i < positions.count; i++) {
      expect(positions.getX(i)).toBe(rig.restVertices[i * 3]);
      expect(positions.getY(i)).toBe(rig.restVertices[i * 3 + 1]);
      const dz = positions.getZ(i) - rig.restVertices[i * 3 + 2];
      expect(Math.abs(dz)).toBeLessThanOrEqual(.041);
      if (positions.getX(i) === 0) { expect(dz).toBe(0); pinned++; }
      if (Math.abs(dz) > .001) changed = true;
    }
    expect(pinned).toBeGreaterThan(0);
    expect(changed).toBe(true);
  });

  it.each(kinds)("restores %s cloth and extras exactly for reduced motion and reset", (kind) => {
    const { rig } = fixture(kind);
    updateTroopDetails(rig, motion);
    const first = Array.from(rig.cloth.geometry.getAttribute("position").array);
    updateTroopDetails(rig, motion);
    expect(Array.from(rig.cloth.geometry.getAttribute("position").array)).toEqual(first);
    updateTroopDetails(rig, { ...motion, reduced: true });
    expect(Array.from(rig.cloth.geometry.getAttribute("position").array)).toEqual(Array.from(rig.restVertices));
    for (const extra of rig.extras) expect(extra.node.quaternion.angleTo(extra.rest)).toBeLessThan(1e-7);
    updateTroopDetails(rig, { ...motion, time: 3 });
    restoreTroopDetails(rig);
    expect(Array.from(rig.cloth.geometry.getAttribute("position").array)).toEqual(Array.from(rig.restVertices));
  });

  it.each(kinds)("keeps %s added geometry above the existing sole plane for both factions", (kind) => {
    for (const side of ["red", "black"] as const) {
      const { model, rig } = fixture(kind, side);
      expect(new THREE.Box3().setFromObject(model).min.y).toBeCloseTo(0, 7);
      updateTroopDetails(rig, motion);
      expect(new THREE.Box3().setFromObject(model).min.y).toBeCloseTo(0, 7);
    }
  });


  it.each(kinds)("keeps the %s standard glyph on the deforming cloth", (kind) => {
    const { rig } = fixture(kind);
    const mark = rig.cloth.getObjectByName("standard-mark") as THREE.Mesh;
    expect(mark.geometry).toBe(rig.cloth.geometry);
    updateTroopDetails(rig, motion);
    expect(mark.geometry.getAttribute("position")).toBe(rig.cloth.geometry.getAttribute("position"));
    expect(mark.geometry.getAttribute("uv").count).toBe(rig.cloth.geometry.getAttribute("position").count);
  });

  it("attaches moving equipment and standards to their authored combat parents", () => {
    const horse = fixture("horse"), general = fixture("general"), cannon = fixture("cannon");
    expect(horse.rig.standard.parent).toBe(horse.joints.lance);
    expect(horse.model.getObjectByName("horse-muzzle")!.parent).toBe(horse.joints.head);
    expect(general.rig.standard.parent).toBe(general.joints.torso);
    expect(cannon.model.getObjectByName("cannon-dark-bore")!.parent).toBe(cannon.joints.barrel);
    const parent = horse.joints.lance;
    horse.model.updateMatrixWorld(true);
    const before = horse.rig.standard.getWorldPosition(new THREE.Vector3());
    parent.rotation.x = -1;
    horse.model.updateMatrixWorld(true);
    expect(horse.rig.standard.getWorldPosition(new THREE.Vector3()).distanceTo(before)).toBeGreaterThan(.1);
  });
});
