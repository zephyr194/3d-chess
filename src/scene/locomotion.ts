import * as THREE from "three";
import type { PieceKind } from "../game/xiangqi";
import { PIECE_SCALE } from "./board";
import type { Surface } from "./landscape-layout";

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
export type LocomotionRig = {
  kind: PieceKind;
  legs: LegChain[];
  wheels: WheelJoint[];
  distance: number;
  cycle: number;
  narrow: number;
};
export type LocomotionInput = {
  distance: number;
  surface: Surface;
  motion: "walking" | "riding" | "waiting" | "idle";
  reduced: boolean;
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
  soldier: { stride: .58, stance: .62, lift: .13, phases: [0, .5] },
  general: { stride: .48, stance: .7, lift: .085, phases: [0, .5] },
  advisor: { stride: .36, stance: .73, lift: .065, phases: [0, .5] },
  horse: { stride: .8, stance: .56, lift: .19, phases: [0, .5, .5, 0] },
  elephant: { stride: .46, stance: .8, lift: .075, phases: [0, .5, .75, .25] },
  chariot: { stride: 1, stance: 1, lift: 0, phases: [] },
  cannon: { stride: 1, stance: 1, lift: 0, phases: [] },
};

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
  const rig = { kind, legs, wheels, distance: 0, cycle: 0, narrow: 0 };
  restoreLocomotion(rig, true);
  return rig;
}

export function restoreLocomotion(rig: LocomotionRig, resetDistance = false) {
  for (const leg of rig.legs) {
    poseLeg(leg, 0, 0);
    leg.planted = true;
  }
  if (resetDistance) {
    rig.distance = rig.cycle = rig.narrow = 0;
    for (const wheel of rig.wheels) wheel.node.quaternion.copy(wheel.rest);
  }
}

const axle = new THREE.Vector3(0, 1, 0);
const wheelTurn = new THREE.Quaternion();

export function applyLocomotion(rig: LocomotionRig, input: LocomotionInput) {
  const localDistance = input.distance / PIECE_SCALE;
  const delta = Math.max(0, localDistance - rig.distance);
  const profile = gaitProfiles[rig.kind];
  rig.distance = localDistance;
  if (input.motion !== "walking" || input.reduced) {
    restoreLocomotion(rig);
    return;
  }
  const narrowTarget = input.surface === "boardwalk" || input.surface === "bridge" ? 1 : 0;
  rig.narrow += THREE.MathUtils.clamp(narrowTarget - rig.narrow, -delta * 4, delta * 4);
  const stride = profile.stride * THREE.MathUtils.lerp(1, .72, rig.narrow);
  rig.cycle += delta / stride;
  const stance = rig.kind === "horse" ? THREE.MathUtils.lerp(profile.stance, .76, rig.narrow) : profile.stance;
  const lift = profile.lift * THREE.MathUtils.lerp(1, .48, rig.narrow) * (input.surface === "mud" ? 1.2 : 1);
  rig.legs.forEach((leg, index) => {
    const offset = rig.kind === "horse" ? THREE.MathUtils.lerp(profile.phases[index], [0, .5, .25, .75][index], rig.narrow) : profile.phases[index];
    const phase = (rig.cycle + offset) % 1;
    const planted = phase < stance;
    let z: number, y = 0;
    const sweep = stride * stance;
    if (planted) z = (phase - stance / 2) * stride;
    else {
      const u = (phase - stance) / (1 - stance);
      const smooth = u * u * (3 - 2 * u);
      z = sweep * (.5 - smooth);
      y = Math.sin(u * Math.PI) ** 2 * lift;
    }
    poseLeg(leg, z, y);
    leg.planted = planted;
  });
  for (const wheel of rig.wheels) {
    wheelTurn.setFromAxisAngle(axle, localDistance / wheel.radius);
    wheel.node.quaternion.copy(wheel.rest).multiply(wheelTurn);
  }
}
