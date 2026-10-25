import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { addJointedLeg, applyLocomotion, createLocomotionRig, restoreLocomotion, type LegRole, type LocomotionPace } from "../src/scene/locomotion";
import { applyCombatPose, createTroopRig, restoreCombatRig, sampleCombat } from "../src/scene/combat";
import { BASE, PIECE_SCALE } from "../src/scene/board";
import type { PieceKind } from "../src/game/xiangqi";

const walkers = ["soldier", "general", "advisor", "horse", "elephant"] as const;
const paces: LocomotionPace[] = ["walk", "run"];
const material = new THREE.MeshBasicMaterial();

function walkingRig(kind: PieceKind, side: "red" | "black" = "red") {
  const root = new THREE.Group(), model = new THREE.Group();
  root.position.set(3, BASE, -5);
  root.scale.setScalar(PIECE_SCALE);
  root.add(model);
  model.rotation.y = side === "black" ? Math.PI : 0;
  root.rotation.y = -model.rotation.y;
  const quadruped = kind === "horse" || kind === "elephant";
  const roles: LegRole[] = quadruped ? ["frontLeft", "frontRight", "rearLeft", "rearRight"] : ["left", "right"];
  const legs = roles.map((role, index) => addJointedLeg(model, {
    role, at: new THREE.Vector3(index % 2 ? .2 : -.2, quadruped ? .55 : .43, quadruped ? index < 2 ? -.24 : .24 : 0),
    upper: quadruped ? kind === "horse" ? .31 : .3 : .23,
    lower: quadruped ? kind === "horse" ? .3 : .27 : .23,
    width: kind === "elephant" ? .105 : .067,
    ankleHeight: kind === "elephant" ? .08 : kind === "horse" ? .06 : .07,
    bend: quadruped && index > 1 ? -1 : 1,
    upperMaterial: material, lowerMaterial: material, footMaterial: material,
  }));
  return { root, model, rig: createLocomotionRig(kind, legs, []) };
}

function footPosition(leg: ReturnType<typeof addJointedLeg>) {
  return leg.sole.getWorldPosition(new THREE.Vector3());
}

describe("troop ground contact", () => {
  it.each(walkers.flatMap((kind) => paces.map((pace) => ({ kind, pace }))))("plants $kind soles during $pace while the body advances", ({ kind, pace }) => {
    for (const side of ["red", "black"] as const) {
      const { root, rig } = walkingRig(kind, side);
      const previous = new Map<LegRole, THREE.Vector3>();
      let plantedSamples = 0, airborneSamples = 0, greatestLift = 0;
      for (let frame = 0; frame <= 600; frame++) {
        const distance = frame / 1000;
        root.position.z = -5 - distance;
        applyLocomotion(rig, { distance, surface: "imperial", motion: "walking", reduced: false, pace });
        root.updateMatrixWorld(true);
        for (const leg of rig.legs) {
          const foot = footPosition(leg);
          greatestLift = Math.max(greatestLift, foot.y - BASE);
          expect(foot.y).toBeGreaterThanOrEqual(BASE - 1e-8);
          if (leg.planted) {
            expect(foot.y).toBeCloseTo(BASE, 8);
            const last = previous.get(leg.role);
            if (last) {
              expect(foot.distanceTo(last)).toBeLessThan(1e-7);
              plantedSamples++;
            }
            previous.set(leg.role, foot);
          } else {
            previous.delete(leg.role);
            airborneSamples++;
          }
          const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(leg.ankle.getWorldQuaternion(new THREE.Quaternion()));
          expect(normal.y).toBeCloseTo(1, 10);
        }
      }
      expect(plantedSamples).toBeGreaterThan(200);
      expect(airborneSamples).toBeGreaterThan(20);
      expect(greatestLift).toBeGreaterThan(.025);
      expect(root.position.y).toBe(BASE);
      expect(root.scale.toArray()).toEqual([PIECE_SCALE, PIECE_SCALE, PIECE_SCALE]);
    }
  });

  it.each(paces)("keeps at least three elephant feet grounded through its heavy four beat %s", (pace) => {
    const { rig } = walkingRig("elephant");
    for (let frame = 0; frame < 600; frame++) {
      applyLocomotion(rig, { distance: frame / 1000, surface: "dirt", motion: "walking", reduced: false, pace });
      expect(rig.legs.filter((leg) => leg.planted).length).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(walkers)("gives %s a longer stride and higher actual lifted soles at run", (kind) => {
    const walk = walkingRig(kind), run = walkingRig(kind);
    let walkLift = 0, runLift = 0;
    for (let frame = 0; frame < 1200; frame++) {
      const distance = frame / 1000;
      applyLocomotion(walk.rig, { distance, surface: "dirt", motion: "walking", reduced: false, pace: "walk" });
      applyLocomotion(run.rig, { distance, surface: "dirt", motion: "walking", reduced: false, pace: "run" });
      for (const leg of walk.rig.legs) walkLift = Math.max(walkLift, footPosition(leg).y - BASE);
      for (const leg of run.rig.legs) runLift = Math.max(runLift, footPosition(leg).y - BASE);
      if (kind === "horse") expect(run.rig.legs.some((leg) => leg.planted)).toBe(true);
    }
    expect(runLift).toBeGreaterThan(walkLift * 1.15);
    expect(run.rig.cycle).toBeLessThan(walk.rig.cycle);
    expect(run.rig.distance).toBe(walk.rig.distance);
    expect(run.rig.pace).toBe("run");
  });

  it.each(walkers)("keeps %s soles flat above mud and narrow surfaces in both paces and sides", (kind) => {
    for (const side of ["red", "black"] as const) for (const pace of paces) {
      for (const surface of ["mud", "bridge", "boardwalk"] as const) {
        const { rig } = walkingRig(kind, side);
        for (let frame = 0; frame < 500; frame++) {
          applyLocomotion(rig, { distance: frame / 700, surface, motion: "walking", reduced: false, pace });
          for (const leg of rig.legs) {
            const foot = footPosition(leg);
            expect(foot.y).toBeGreaterThanOrEqual(BASE - 1e-8);
            if (leg.planted) expect(foot.y).toBeCloseTo(BASE, 8);
            expect(new THREE.Vector3(0, 1, 0).applyQuaternion(leg.ankle.getWorldQuaternion(new THREE.Quaternion())).y).toBeCloseTo(1, 10);
          }
        }
        expect(rig.pace).toBe(surface === "mud" ? pace : "walk");
      }
    }
  });

  it.each(walkers)("changes the %s stride at cycle boundaries without sliding planted soles", (kind) => {
    const { root, rig } = walkingRig(kind);
    const previous = new Map<LegRole, THREE.Vector3>();
    let paceChanges = 0;
    for (let frame = 0; frame < 2800; frame++) {
      const distance = frame / 2000;
      root.position.z = -5 - distance;
      const oldPace = rig.pace;
      applyLocomotion(rig, { distance, surface: "dirt", motion: "walking", reduced: false, pace: frame < 150 || frame > 1500 ? "walk" : "run" });
      if (oldPace !== rig.pace) paceChanges++;
      for (const leg of rig.legs) {
        const foot = footPosition(leg);
        expect(foot.y).toBeGreaterThanOrEqual(BASE - 1e-8);
        if (leg.planted) {
          const last = previous.get(leg.role);
          if (last) expect(foot.distanceTo(last)).toBeLessThan(1e-7);
          previous.set(leg.role, foot);
        } else previous.delete(leg.role);
      }
    }
    expect(paceChanges).toBe(2);
  });

  it.each(paces)("advances %s gait from ground distance independently of frame partitioning", (pace) => {
    const fine = walkingRig("horse"), coarse = walkingRig("horse");
    for (let frame = 0; frame <= 1000; frame++) applyLocomotion(fine.rig, {
      distance: frame / 1000, surface: "dirt", motion: "walking", reduced: false, pace,
    });
    for (const distance of [0, .11, .35, .7, 1]) applyLocomotion(coarse.rig, {
      distance, surface: "dirt", motion: "walking", reduced: false, pace,
    });
    expect(fine.rig.cycle).toBeCloseTo(coarse.rig.cycle, 10);
    fine.rig.legs.forEach((leg, index) => expect(footPosition(leg).distanceTo(footPosition(coarse.rig.legs[index]))).toBeLessThan(1e-8));
  });

  it.each(walkers)("keeps %s supported through pace changes and entering and leaving a bridge", (kind) => {
    for (const side of ["red", "black"] as const) {
      const { rig } = walkingRig(kind, side);
      for (let frame = 0; frame < 1800; frame++) {
        const distance = frame / 1000;
        const surface = distance > .3 && distance < .75 ? "bridge" : distance > 1 ? "mud" : "dirt";
        applyLocomotion(rig, { distance, surface, motion: "walking", reduced: false, pace: distance < .9 || distance > 1.3 ? "run" : "walk" });
        for (const leg of rig.legs) {
          expect(footPosition(leg).y).toBeGreaterThanOrEqual(BASE - 1e-8);
          if (leg.planted) expect(footPosition(leg).y).toBeCloseTo(BASE, 8);
        }
        if (surface === "bridge") expect(rig.pace).toBe("walk");
        if (kind === "elephant") expect(rig.legs.filter((leg) => leg.planted).length).toBeGreaterThanOrEqual(3);
        if (kind === "horse") expect(rig.legs.some((leg) => leg.planted)).toBe(true);
      }
    }
  });

  it("gives the horse a diagonal trot and a lower careful boardwalk step", () => {
    const open = walkingRig("horse"), narrow = walkingRig("horse");
    let openLift = 0, narrowLift = 0, narrowFourBeatFrames = 0;
    for (let frame = 0; frame < 1600; frame++) {
      const distance = frame / 1000;
      applyLocomotion(open.rig, { distance, surface: "dirt", motion: "walking", reduced: false });
      applyLocomotion(narrow.rig, { distance, surface: "boardwalk", motion: "walking", reduced: false });
      expect(open.rig.legs[0].planted).toBe(open.rig.legs[3].planted);
      expect(open.rig.legs[1].planted).toBe(open.rig.legs[2].planted);
      if (frame > 500) {
        for (const leg of open.rig.legs) openLift = Math.max(openLift, footPosition(leg).y - BASE);
        for (const leg of narrow.rig.legs) narrowLift = Math.max(narrowLift, footPosition(leg).y - BASE);
        if (narrow.rig.legs.filter((leg) => leg.planted).length >= 3) narrowFourBeatFrames++;
      }
    }
    expect(narrowLift).toBeGreaterThan(.04);
    expect(narrowLift).toBeLessThan(openLift * .6);
    expect(narrowFourBeatFrames).toBeGreaterThan(500);
  });

  it.each(["waiting", "riding", "idle"] as const)("restores flat feet during %s without moving the body", (motion) => {
    const { root, rig } = walkingRig("soldier");
    applyLocomotion(rig, { distance: .14, surface: "dirt", motion: "walking", reduced: false, pace: "run" });
    applyLocomotion(rig, { distance: .14, surface: "dirt", motion, reduced: false });
    for (const leg of rig.legs) expect(footPosition(leg).y).toBeCloseTo(BASE, 10);
    const pose = rig.legs.map((leg) => footPosition(leg).toArray());
    const cycle = rig.cycle;
    applyLocomotion(rig, { distance: .4, surface: "dirt", motion, reduced: false, pace: "run" });
    expect(rig.legs.map((leg) => footPosition(leg).toArray())).toEqual(pose);
    expect(rig.cycle).toBe(cycle);
    expect(root.position.toArray()).toEqual([3, BASE, -5]);
  });

  it("restores a moving troop for reduced motion and reset", () => {
    const { rig } = walkingRig("horse");
    applyLocomotion(rig, { distance: .23, surface: "dirt", motion: "walking", reduced: true, pace: "run" });
    for (const leg of rig.legs) expect(footPosition(leg).y).toBeCloseTo(BASE, 10);
    expect(rig.cycle).toBe(0);
    applyLocomotion(rig, { distance: .41, surface: "dirt", motion: "walking", reduced: false });
    restoreLocomotion(rig, true);
    for (const leg of rig.legs) expect(footPosition(leg).y).toBeCloseTo(BASE, 10);
    expect(rig.distance).toBe(0);
    expect(rig.pace).toBe("walk");
  });
});

describe("rolling and combat", () => {
  it.each(paces.flatMap((pace) => [["chariot", .18], ["cannon", .23]].map(([kind, radius]) => ({ kind: kind as "chariot" | "cannon", radius: radius as number, pace }))))("rolls $kind during $pace without slipping, freezes on a ferry and restores its original axle", ({ kind, radius, pace }) => {
    const root = new THREE.Group(), wheel = new THREE.Group(), tread = new THREE.Object3D();
    root.scale.setScalar(PIECE_SCALE);
    root.add(wheel);
    wheel.rotation.z = Math.PI / 2;
    tread.position.x = -radius;
    wheel.add(tread);
    const rest = wheel.quaternion.clone();
    const rig = createLocomotionRig(kind, [], [{ node: wheel, radius, rest }]);
    const distance = radius * PIECE_SCALE * Math.PI / 2;
    applyLocomotion(rig, { distance, surface: "dirt", motion: "walking", reduced: false, pace });
    const offset = tread.getWorldPosition(new THREE.Vector3());
    expect(offset.z).toBeCloseTo(radius * PIECE_SCALE, 10);
    expect(offset.y).toBeCloseTo(0, 10);
    const stopped = wheel.quaternion.clone();
    for (const motion of ["waiting", "riding", "idle"] as const) {
      applyLocomotion(rig, { distance, surface: "dirt", motion, reduced: false });
      expect(wheel.quaternion.angleTo(stopped)).toBeCloseTo(0, 10);
    }
    restoreLocomotion(rig, true);
    expect(wheel.quaternion.angleTo(rest)).toBeCloseTo(0, 10);
    expect(tread.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(-radius * PIECE_SCALE, 10);
  });

  it("lets the elephant combat foot lift and stamp independently of its knee solver", () => {
    const root = new THREE.Group(), foot = new THREE.Group(), head = new THREE.Group(), trunk = new THREE.Group();
    foot.position.set(.24, .55, -.21);
    root.add(foot, head, trunk);
    const leg = addJointedLeg(foot, {
      role: "frontRight", at: new THREE.Vector3(), upper: .3, lower: .27, width: .105,
      ankleHeight: .08, groundY: -.55,
      upperMaterial: material, lowerMaterial: material, footMaterial: material,
    });
    const walking = createLocomotionRig("elephant", [leg], []);
    const combat = createTroopRig("elephant", { foot, head, trunk });
    applyLocomotion(walking, { distance: .1, surface: "dirt", motion: "walking", reduced: false });
    restoreLocomotion(walking);
    applyCombatPose(combat, sampleCombat("elephant", .29));
    expect(footPosition(leg).y).toBeGreaterThan(.1);
    applyCombatPose(combat, sampleCombat("elephant", .58));
    expect(footPosition(leg).y).toBeCloseTo(0, 10);
    restoreCombatRig(combat);
    restoreLocomotion(walking, true);
    expect(footPosition(leg).y).toBeCloseTo(0, 10);
  });
});
