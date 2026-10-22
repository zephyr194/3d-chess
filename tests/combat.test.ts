import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { attackProfiles, applyCombatPose, createTroopRig, restoreCombatRig, sampleCombat, type TroopRig } from "../src/scene/combat";
import type { PieceKind } from "../src/game/xiangqi";

const kinds: PieceKind[] = ["soldier", "horse", "chariot", "cannon", "elephant", "advisor", "general"];

function rigFor(kind: PieceKind) {
  const names = {
    soldier: ["spear", "shield"], horse: ["rider", "lance", "head"], chariot: ["chassis", "ram"],
    cannon: ["trunnion", "barrel"], elephant: ["head", "trunk", "foot"], advisor: ["tabletArm"], general: ["torso", "weapon"],
  }[kind];
  const root = new THREE.Group();
  root.position.set(3, 0.545, -5);
  root.scale.setScalar(0.68);
  const nodes = Object.fromEntries(names.map((name) => {
    const node = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1));
    node.add(mesh);
    root.add(node);
    return [name, node];
  }));
  return { root, nodes, rig: createTroopRig(kind, nodes as never) as TroopRig };
}

describe("physical troop combat", () => {
  it.each(kinds)("moves actual %s parts and restores the standing pose without changing its station", (kind) => {
    const { root, nodes, rig } = rigFor(kind), profile = attackProfiles[kind];
    applyCombatPose(rig, sampleCombat(kind, 0.3));
    root.updateMatrixWorld(true);
    expect(Object.values(nodes).some((node) => node.position.length() > 0.02 || node.quaternion.angleTo(new THREE.Quaternion()) > 0.02)).toBe(true);
    expect(root.position.toArray()).toEqual([3, 0.545, -5]);
    expect(root.scale.toArray()).toEqual([0.68, 0.68, 0.68]);
    expect(profile.impact).toBeGreaterThan(0.2);
    expect(profile.impact).toBeLessThan(0.8);
    restoreCombatRig(rig);
    for (const node of Object.values(nodes)) {
      expect(node.position.length()).toBe(0);
      expect(node.quaternion.angleTo(new THREE.Quaternion())).toBe(0);
    }
  });

  it.each(kinds)("has a continuous %s windup, strike and recovery ending at rest", (kind) => {
    const { rig, nodes } = rigFor(kind);
    for (const endpoint of [0, 1]) {
      applyCombatPose(rig, sampleCombat(kind, endpoint));
      for (const node of Object.values(nodes)) {
        expect(node.position.length()).toBeCloseTo(0, 12);
        expect(node.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(0, 7);
      }
    }
    const previous = new Map<string, { position: THREE.Vector3; rotation: THREE.Quaternion }>();
    for (let frame = 0; frame <= 1000; frame++) {
      applyCombatPose(rig, sampleCombat(kind, frame / 1000));
      for (const [name, node] of Object.entries(nodes)) {
        const last = previous.get(name);
        if (last) {
          expect(node.position.distanceTo(last.position)).toBeLessThan(0.025);
          expect(node.quaternion.angleTo(last.rotation)).toBeLessThan(0.025);
        }
        previous.set(name, { position: node.position.clone(), rotation: node.quaternion.clone() });
      }
    }
  });

  it("thrusts the soldier spear forward and braces the actual shield", () => {
    const { rig, nodes } = rigFor("soldier"), tip = new THREE.Object3D();
    tip.position.y = 0.7;
    nodes.spear.add(tip);
    applyCombatPose(rig, sampleCombat("soldier", 0.48));
    expect(nodes.spear.position.z).toBeLessThan(-0.2);
    expect(new THREE.Vector3(0, 0.7, 0).applyQuaternion(nodes.spear.quaternion).z).toBeLessThan(-0.6);
    expect(nodes.shield.position.y).toBeGreaterThan(0.1);
  });

  it("lowers a mounted lance independently from the leaning rider and horse head", () => {
    const { rig, nodes } = rigFor("horse");
    applyCombatPose(rig, sampleCombat("horse", 0.56));
    expect(nodes.rider.rotation.x).toBeLessThan(-0.25);
    expect(nodes.lance.rotation.x).toBeLessThan(-1);
    expect(nodes.head.rotation.x).toBeGreaterThan(0.2);
  });

  it("braces a chariot chassis while extending its ram", () => {
    const { rig, nodes } = rigFor("chariot");
    applyCombatPose(rig, sampleCombat("chariot", 0.5));
    expect(nodes.chassis.position.y).toBeLessThan(-0.02);
    expect(nodes.ram.position.z).toBeLessThan(-0.4);
  });

  it("aims a cannon and recoils its barrel only after firing", () => {
    const { rig, nodes } = rigFor("cannon");
    applyCombatPose(rig, sampleCombat("cannon", 0.3));
    expect(nodes.trunnion.rotation.x).toBeLessThan(-0.2);
    expect(nodes.barrel.position.z).toBe(0);
    applyCombatPose(rig, sampleCombat("cannon", 0.5));
    expect(nodes.barrel.position.z).toBeGreaterThan(0.1);
  });

  it("lifts then plants an elephant foot while its head and trunk strike", () => {
    const { rig, nodes } = rigFor("elephant");
    applyCombatPose(rig, sampleCombat("elephant", 0.29));
    expect(nodes.foot.position.y).toBeGreaterThan(0.1);
    applyCombatPose(rig, sampleCombat("elephant", 0.58));
    expect(nodes.foot.position.y).toBeCloseTo(0, 10);
    expect(Math.abs(nodes.trunk.rotation.z)).toBeGreaterThan(0.4);
    expect(Math.abs(nodes.head.rotation.y)).toBeGreaterThan(0.3);
  });

  it("raises the advisor's tablet above its idle position", () => {
    const { root, rig, nodes } = rigFor("advisor"), tablet = new THREE.Object3D();
    tablet.position.set(-0.2, -0.15, -0.29);
    nodes.tabletArm.add(tablet);
    root.updateMatrixWorld(true);
    const resting = tablet.getWorldPosition(new THREE.Vector3());
    applyCombatPose(rig, sampleCombat("advisor", 0.52));
    root.updateMatrixWorld(true);
    const lifted = tablet.getWorldPosition(new THREE.Vector3());
    expect(lifted.y - resting.y).toBeGreaterThan(0.2);
  });

  it("sweeps the general weapon across its torso instead of wobbling the whole unit", () => {
    const { rig, nodes } = rigFor("general");
    applyCombatPose(rig, sampleCombat("general", 0.25));
    const initialYaw = nodes.weapon.rotation.y;
    applyCombatPose(rig, sampleCombat("general", 0.7));
    expect(initialYaw).toBeGreaterThan(0.1);
    expect(nodes.weapon.rotation.y).toBeLessThan(-0.3);
    expect(nodes.torso.rotation.y).toBeLessThan(0);
  });
});
