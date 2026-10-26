import * as THREE from "three";
import type { PieceKind, Side } from "../game/xiangqi";
import type { LocomotionPace } from "./locomotion";

type Actuators = {
  soldier: "spear" | "shield";
  horse: "rider" | "lance" | "head";
  chariot: "chassis" | "ram";
  cannon: "trunnion" | "barrel";
  elephant: "head" | "trunk" | "foot";
  advisor: "tabletArm";
  general: "torso" | "weapon";
};
type JointPose = { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number };
type Joint = {
  node: THREE.Object3D;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
};
export type TroopRig<K extends PieceKind = PieceKind> = {
  [P in K]: { kind: P; joints: Record<Actuators[P], Joint> };
}[K];
export type CombatPose<K extends PieceKind = PieceKind> = {
  [P in K]: { kind: P; joints: Partial<Record<Actuators[P], JointPose>> };
}[K];
type AttackProfile<K extends PieceKind> = {
  duration: number;
  impact: number;
  sample: (phase: number) => CombatPose<K>;
};

function stroke(t: number, impact: number) {
  if (t <= 0 || t >= 1) return 0;
  return t < impact
    ? Math.sin((t / impact) * Math.PI / 2)
    : Math.cos(((t - impact) / (1 - impact)) * Math.PI / 2) ** 2;
}

export const attackProfiles: { [K in PieceKind]: AttackProfile<K> } = {
  soldier: {
    duration: 1.05, impact: 0.48,
    sample: (t) => {
      const p = stroke(t, 0.48);
      return { kind: "soldier", joints: { spear: { rx: -1.3 * p, z: -0.32 * p }, shield: { rx: -0.35 * p, y: 0.15 * p, z: -0.12 * p } } };
    },
  },
  horse: {
    duration: 1.2, impact: 0.56,
    sample: (t) => {
      const p = stroke(t, 0.56);
      return { kind: "horse", joints: { rider: { rx: -0.38 * p }, lance: { rx: -1.4 * p, z: -0.2 * p }, head: { rx: 0.3 * p } } };
    },
  },
  chariot: {
    duration: 1.05, impact: 0.5,
    sample: (t) => {
      const p = stroke(t, 0.5);
      return { kind: "chariot", joints: { chassis: { rx: -0.12 * p, y: -0.035 * p }, ram: { z: -0.5 * p } } };
    },
  },
  cannon: {
    duration: 1.3, impact: 0.46,
    sample: (t) => {
      const aim = stroke(t, 0.33), recoil = t < 0.46 || t >= 1 ? 0 : Math.exp(-(t - 0.46) * 11) * Math.sin(Math.min(1, (t - 0.46) / 0.045) * Math.PI / 2);
      return { kind: "cannon", joints: { trunnion: { rx: -0.3 * aim }, barrel: { z: 0.31 * recoil } } };
    },
  },
  elephant: {
    duration: 1.35, impact: 0.58,
    sample: (t) => {
      const p = stroke(t, 0.58), lift = t < 0.58 ? Math.sin((t / 0.58) * Math.PI) : 0;
      return { kind: "elephant", joints: { head: { ry: -0.45 * p }, trunk: { rx: -0.65 * p, rz: 0.55 * p }, foot: { y: 0.16 * lift, rx: -0.2 * lift } } };
    },
  },
  advisor: {
    duration: 1.15, impact: 0.52,
    sample: (t) => {
      const p = stroke(t, 0.52);
      return { kind: "advisor", joints: { tabletArm: { rx: 1.05 * p, y: 0.07 * p } } };
    },
  },
  general: {
    duration: 1.25, impact: 0.55,
    sample: (t) => {
      const p = stroke(t, 0.55), turn = Math.max(0, Math.min(1, (t - 0.25) / 0.45)), sweep = Math.sin(t * Math.PI) * (0.7 - 1.6 * turn * turn * (3 - 2 * turn));
      return { kind: "general", joints: { torso: { ry: 0.3 * sweep }, weapon: { rx: -0.9 * p, ry: sweep, rz: -0.45 * p } } };
    },
  },
};

export function createTroopRig<K extends PieceKind>(kind: K, nodes: Record<Actuators[K], THREE.Object3D>): TroopRig<K> {
  const joints = Object.fromEntries(Object.entries<THREE.Object3D>(nodes).map(([name, node]) => [name, {
    node, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone(),
  }]));
  return { kind, joints } as TroopRig<K>;
}

export function restoreCombatRig(rig: TroopRig) {
  for (const joint of Object.values(rig.joints) as Joint[]) {
    joint.node.position.copy(joint.position);
    joint.node.quaternion.copy(joint.quaternion);
    joint.node.scale.copy(joint.scale);
  }
}

export function sampleCombat<K extends PieceKind>(kind: K, phase: number): CombatPose<K> {
  return attackProfiles[kind].sample(Math.max(0, Math.min(1, phase))) as CombatPose<K>;
}

export function sampleMarchPose<K extends PieceKind>(kind: K, cycle: number, pace: LocomotionPace, narrow = 0, side: Side = "red"): CombatPose<K> {
  const wave = Math.sin(cycle * Math.PI * 2), counter = Math.cos(cycle * Math.PI * 2);
  const double = Math.cos(cycle * Math.PI * 4);
  const run = pace === "run" ? 1 : 0;
  const tribal = side === "black" ? 1 : 0;
  const careful = 1 - THREE.MathUtils.clamp(narrow, 0, 1) * .55;
  const swing = (.065 + run * .085) * careful;
  const poses: { [P in PieceKind]: CombatPose<P> } = {
    soldier: { kind: "soldier", joints: {
      spear: { rx: -.055 - run * .16 - tribal * .075 + wave * swing, rz: -.025 - run * .045 - tribal * .035 },
      shield: { rx: .025 - wave * swing * .8, rz: .02 + run * .035 + tribal * .04 },
    } },
    general: { kind: "general", joints: {
      torso: { rx: -run * .10 - tribal * .035 + double * .009 * careful, ry: wave * swing * (.4 + tribal * .12) },
      weapon: { rx: -.045 - run * .19 - wave * swing, rz: -run * .06 },
    } },
    advisor: { kind: "advisor", joints: {
      tabletArm: { rx: -.035 - run * .065 + tribal * .07 + wave * swing * .2, rz: counter * .015 * careful + tribal * .045 },
    } },
    horse: { kind: "horse", joints: {
      rider: { rx: -.035 - run * .15 - tribal * .035 + double * swing * .18, rz: wave * .014 * careful },
      lance: { rx: -.06 - run * .22 - tribal * .025 - double * swing * .15 },
      head: { rx: .015 + run * .04 + wave * swing * .35 },
    } },
    elephant: { kind: "elephant", joints: {
      head: { rx: double * .022 * careful, ry: wave * .025 * careful },
      trunk: { rx: -.035 - run * .07 - tribal * .02 + wave * swing * .65, rz: counter * swing * .4 },
    } },
    chariot: { kind: "chariot", joints: {
      chassis: { rx: -run * .035 + double * (.008 + run * .008) * careful, rz: wave * (.008 + tribal * .006) * careful },
    } },
    cannon: { kind: "cannon", joints: {
      trunnion: { rx: -run * .018 + double * .004 * careful + tribal * wave * .006 },
    } },
  };
  return poses[kind];
}

export function applyCombatPose(rig: TroopRig, pose: CombatPose, amplitude = 1) {
  if (rig.kind !== pose.kind) throw new Error("Combat pose does not match troop rig");
  restoreCombatRig(rig);
  for (const [name, offset] of Object.entries(pose.joints) as [string, JointPose][]) {
    const joint = (rig.joints as Record<string, Joint>)[name];
    joint.node.position.add(new THREE.Vector3(offset.x ?? 0, offset.y ?? 0, offset.z ?? 0).multiplyScalar(amplitude));
    joint.node.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(
      (offset.rx ?? 0) * amplitude, (offset.ry ?? 0) * amplitude, (offset.rz ?? 0) * amplitude,
    )));
  }
}
