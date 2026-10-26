import * as THREE from "three";
import type { PieceKind } from "../game/xiangqi";
import { PIECE_SCALE } from "./board";
import { surfaceSpeed, type Surface } from "./landscape-layout";

export type LegRole = "left" | "right" | "frontLeft" | "frontRight" | "rearLeft" | "rearRight";
export type LegChain = {
  role: LegRole;
  hip: THREE.Group;
  knee: THREE.Group;
  ankle: THREE.Group;
  sole: THREE.Object3D;
  upper: number;
  lower: number;
  ankleHeight: number;
  groundY: number;
  bend: number;
  planted: boolean;
};
export type WheelJoint = { node: THREE.Object3D; radius: number; rest: THREE.Quaternion };
export type LocomotionPace = "walk" | "run";
export type LocomotionRig = {
  kind: PieceKind;
  legs: LegChain[];
  wheels: WheelJoint[];
  distance: number;
  cycle: number;
  startCycle: number;
  narrow: number;
  pace: LocomotionPace;
  motion: "resting" | "stepping";
  stepOffsets: { z: number; until: number }[];
};
export type LocomotionInput = {
  distance: number;
  surface: Surface;
  motion: "walking" | "riding" | "waiting" | "idle";
  reduced: boolean;
  pace?: LocomotionPace;
};
export type JointedLegSpec = {
  role: LegRole;
  at: THREE.Vector3;
  upper: number;
  lower: number;
  width: number;
  ankleHeight: number;
  bend?: number;
  groundY?: number;
  upperMaterial: THREE.Material;
  lowerMaterial: THREE.Material;
  footMaterial: THREE.Material;
};

export function addJointedLeg(parent: THREE.Group, spec: JointedLegSpec): LegChain {
  const hip = new THREE.Group(), knee = new THREE.Group(), ankle = new THREE.Group();
  hip.name = `${spec.role}-hip`;
  knee.name = `${spec.role}-knee`;
  ankle.name = `${spec.role}-ankle`;
  hip.position.copy(spec.at);
  knee.position.y = -spec.upper;
  ankle.position.y = -spec.lower;
  const thigh = new THREE.Mesh(new THREE.CylinderGeometry(spec.width, spec.width * .86, spec.upper, 7), spec.upperMaterial);
  thigh.position.y = -spec.upper / 2;
  const shin = new THREE.Mesh(new THREE.CylinderGeometry(spec.width * .8, spec.width * .68, spec.lower, 7), spec.lowerMaterial);
  shin.position.y = -spec.lower / 2;
  const kneecap = new THREE.Mesh(new THREE.SphereGeometry(spec.width * 1.08, 8, 6), spec.upperMaterial);
  kneecap.scale.set(1, .85, 1);
  const boot = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 2.1, spec.ankleHeight, spec.width * 3.2), spec.footMaterial);
  boot.name = `${spec.role}-boot`;
  boot.position.set(0, -spec.ankleHeight / 2, -spec.width * .45);
  const sole = new THREE.Object3D();
  sole.name = `${spec.role}-sole`;
  sole.position.set(0, -spec.ankleHeight, -spec.width * .45);
  ankle.add(boot, sole);
  knee.add(shin, kneecap, ankle);
  hip.add(thigh, knee);
  parent.add(hip);
  hip.traverse((part) => { if (part instanceof THREE.Mesh) part.castShadow = part.receiveShadow = true; });
  const leg: LegChain = {
    role: spec.role, hip, knee, ankle, sole,
    upper: spec.upper, lower: spec.lower, ankleHeight: spec.ankleHeight,
    groundY: spec.groundY ?? 0, bend: spec.bend ?? 1, planted: true,
  };
  poseLeg(leg, 0, 0);
  return leg;
}

type GaitProfile = { stride: number; stance: number; lift: number; phases: readonly number[] };
export const gaitProfiles: Record<PieceKind, GaitProfile> = {
  soldier: { stride: .50, stance: .60, lift: .075, phases: [0, .5] },
  general: { stride: .44, stance: .62, lift: .06, phases: [0, .5] },
  advisor: { stride: .36, stance: .70, lift: .05, phases: [0, .5] },
  horse: { stride: .8, stance: .56, lift: .19, phases: [0, .5, .5, 0] },
  elephant: { stride: .46, stance: .8, lift: .075, phases: [0, .5, .75, .25] },
  chariot: { stride: 1, stance: 1, lift: 0, phases: [] },
  cannon: { stride: 1, stance: 1, lift: 0, phases: [] },
};

export const runGaitProfiles: Record<PieceKind, GaitProfile> = {
  soldier: { stride: .60, stance: .50, lift: .125, phases: [0, .5] },
  general: { stride: .58, stance: .50, lift: .105, phases: [0, .5] },
  advisor: { stride: .48, stance: .525, lift: .085, phases: [0, .5] },
  horse: { stride: .98, stance: .58, lift: .23, phases: [0, .48, .58, .08] },
  elephant: { stride: .58, stance: .8, lift: .105, phases: [0, .5, .75, .25] },
  chariot: { stride: 1, stance: 1, lift: 0, phases: [] },
  cannon: { stride: 1, stance: 1, lift: 0, phases: [] },
};

const cadences: Record<PieceKind, Record<LocomotionPace, number>> = {
  soldier: { walk: 1.45, run: 2.1 },
  general: { walk: 1.35, run: 2.0 },
  advisor: { walk: 1.35, run: 1.85 },
  horse: { walk: 1.65, run: 2.15 },
  elephant: { walk: 1.25, run: 1.5 },
  chariot: { walk: 1.5, run: 2.4 },
  cannon: { walk: 1.25, run: 1.85 },
};

export function gaitTravelScale(kind: PieceKind, pace: LocomotionPace, surface: Surface) {
  if (surface === "ferry") return 1;
  const narrow = surface === "bridge" || surface === "boardwalk";
  const effectivePace = narrow ? "walk" : pace;
  const profile = (effectivePace === "run" ? runGaitProfiles : gaitProfiles)[kind];
  const stride = profile.stride * (narrow ? .72 : 1);
  return stride * PIECE_SCALE * cadences[kind][effectivePace] / surfaceSpeed(kind, "dirt");
}

export function poseLeg(leg: LegChain, z: number, lift: number) {
  const down = leg.hip.position.y - leg.groundY - leg.ankleHeight - lift;
  const reach = Math.hypot(down, z);
  const length = THREE.MathUtils.clamp(reach, Math.abs(leg.upper - leg.lower) + 1e-6, leg.upper + leg.lower - 1e-6);
  const bearing = Math.atan2(-z, down);
  const hipBend = Math.acos(THREE.MathUtils.clamp((leg.upper ** 2 + length ** 2 - leg.lower ** 2) / (2 * leg.upper * length), -1, 1));
  const kneeBend = Math.acos(THREE.MathUtils.clamp((length ** 2 - leg.upper ** 2 - leg.lower ** 2) / (2 * leg.upper * leg.lower), -1, 1));
  leg.hip.rotation.x = bearing + hipBend * leg.bend;
  leg.knee.rotation.x = -kneeBend * leg.bend;
  leg.ankle.rotation.x = -leg.hip.rotation.x - leg.knee.rotation.x;
}

export function createLocomotionRig(kind: PieceKind, legs: LegChain[], wheels: WheelJoint[]): LocomotionRig {
  const rig: LocomotionRig = { kind, legs, wheels, distance: 0, cycle: 0, startCycle: 0, narrow: 0, pace: "walk", motion: "resting", stepOffsets: [] };
  restoreLocomotion(rig, true);
  return rig;
}

export function restoreLocomotion(rig: LocomotionRig, resetDistance = false) {
  rig.motion = "resting";
  rig.stepOffsets = [];
  for (const leg of rig.legs) {
    poseLeg(leg, 0, 0);
    leg.planted = true;
  }
  if (resetDistance) {
    rig.distance = rig.cycle = rig.narrow = 0;
    rig.pace = "walk";
    for (const wheel of rig.wheels) wheel.node.quaternion.copy(wheel.rest);
  }
}

const axle = new THREE.Vector3(0, 1, 0);
const wheelTurn = new THREE.Quaternion();

function gaitStep(kind: PieceKind, profile: GaitProfile, index: number, cycle: number, narrow: number, mud: boolean) {
  const stride = profile.stride * THREE.MathUtils.lerp(1, .72, narrow);
  const stance = kind === "horse" ? THREE.MathUtils.lerp(profile.stance, .76, narrow) : profile.stance;
  const offset = kind === "horse" ? THREE.MathUtils.lerp(profile.phases[index], [0, .5, .25, .75][index], narrow) : profile.phases[index];
  const phase = (cycle + offset) % 1;
  const planted = phase < stance;
  const u = planted ? 0 : (phase - stance) / (1 - stance);
  const smooth = u * u * (3 - 2 * u);
  return {
    z: planted ? (phase - stance / 2) * stride : stride * stance * (.5 - smooth),
    lift: Math.sin(u * Math.PI) ** 2 * profile.lift * THREE.MathUtils.lerp(1, .48, narrow) * (mud ? 1.2 : 1),
    planted, offset, correction: 1 - smooth,
  };
}

function stepCorrection(rig: LocomotionRig, index: number, cycle: number, correction: number) {
  const offset = rig.stepOffsets[index];
  return offset && cycle < offset.until ? offset.z * correction : 0;
}

export function applyLocomotion(rig: LocomotionRig, input: LocomotionInput) {
  const localDistance = input.distance / PIECE_SCALE;
  const delta = Math.max(0, localDistance - rig.distance);
  rig.distance = localDistance;
  if (input.motion !== "walking" || input.reduced) {
    restoreLocomotion(rig);
    return;
  }
  const narrowTarget = input.surface === "boardwalk" || input.surface === "bridge" ? 1 : 0;
  rig.narrow += THREE.MathUtils.clamp(narrowTarget - rig.narrow, -delta * 4, delta * 4);
  const requested = narrowTarget ? "walk" : input.pace ?? "walk";
  if (rig.motion === "resting") {
    rig.pace = requested;
    const startingProfile = (requested === "run" ? runGaitProfiles : gaitProfiles)[rig.kind];
    const humanoid = rig.kind === "soldier" || rig.kind === "general" || rig.kind === "advisor";
    rig.cycle = rig.startCycle = humanoid ? startingProfile.stance / 2 : 0;
    rig.stepOffsets = (humanoid ? rig.legs : []).map((_, index) => {
      const step = gaitStep(rig.kind, startingProfile, index, rig.cycle, rig.narrow, input.surface === "mud");
      return { z: -step.z / step.correction, until: Math.floor(rig.cycle + step.offset) + 1 - step.offset };
    });
    rig.motion = "stepping";
  }
  let profile = (rig.pace === "run" ? runGaitProfiles : gaitProfiles)[rig.kind];
  const stride = profile.stride * THREE.MathUtils.lerp(1, .72, rig.narrow);
  const nextCycle = rig.cycle + delta / stride;
  const boundary = Math.ceil(rig.cycle - 1e-10);
  if (requested !== rig.pace && (narrowTarget || nextCycle >= boundary)) {
    const switchCycle = narrowTarget ? rig.cycle : boundary;
    const oldProfile = profile;
    profile = (requested === "run" ? runGaitProfiles : gaitProfiles)[rig.kind];
    rig.legs.forEach((_, index) => {
      const before = gaitStep(rig.kind, oldProfile, index, switchCycle, rig.narrow, input.surface === "mud");
      const after = gaitStep(rig.kind, profile, index, switchCycle, rig.narrow, input.surface === "mud");
      const z = before.z + stepCorrection(rig, index, switchCycle, before.correction) - after.z;
      rig.stepOffsets[index] = { z, until: Math.floor(switchCycle + after.offset) + 1 - after.offset };
    });
    const remaining = delta - (switchCycle - rig.cycle) * stride;
    rig.cycle = switchCycle + remaining / (profile.stride * THREE.MathUtils.lerp(1, .72, rig.narrow));
    rig.pace = requested;
  } else rig.cycle = nextCycle;
  rig.legs.forEach((leg, index) => {
    const step = gaitStep(rig.kind, profile, index, rig.cycle, rig.narrow, input.surface === "mud");
    poseLeg(leg, step.z + stepCorrection(rig, index, rig.cycle, step.correction), step.lift * THREE.MathUtils.smoothstep(rig.cycle - rig.startCycle, 0, .5));
    leg.planted = step.planted;
  });
  for (const wheel of rig.wheels) {
    wheelTurn.setFromAxisAngle(axle, localDistance / wheel.radius);
    wheel.node.quaternion.copy(wheel.rest).multiply(wheelTurn);
  }
}
