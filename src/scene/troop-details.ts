import * as THREE from "three";
import type { PieceKind, Side } from "../game/xiangqi";
import type { TroopRig } from "./combat";

export type TroopDetailMaterials = {
  faction: THREE.Material;
  cream: THREE.Material;
  gold: THREE.Material;
  wood: THREE.Material;
  steel: THREE.Material;
  dark: THREE.Material;
  mark?: THREE.Texture;
};
type DetailAnchors = { model: THREE.Group; combat: TroopRig };
type AnimatedDetail = { node: THREE.Object3D; rest: THREE.Quaternion; axis: "x" | "z"; amount: number };
export type TroopDetailsRig = {
  kind: PieceKind;
  standard: THREE.Group;
  cloth: THREE.Mesh<THREE.BufferGeometry>;
  restVertices: Float32Array;
  extras: AnimatedDetail[];
};
type StandardSpec = {
  outline: readonly (readonly [number, number])[];
  width: number;
  height: number;
  pole: number;
};

const standards: Record<PieceKind, StandardSpec> = {
  soldier: { outline: [[0, 0], [1, -.5], [0, -1]], width: .25, height: .19, pole: .46 },
  general: { outline: [[0, 0], [1, 0], [.69, -.5], [1, -1], [0, -1]], width: .3, height: .25, pole: .62 },
  advisor: { outline: [[0, 0], [.7, 0], [.7, -.75], [.48, -.75], [.48, -1], [0, -1]], width: .24, height: .24, pole: .4 },
  horse: { outline: [[0, 0], [1, -.23], [.76, -.52], [1, -.82], [0, -1]], width: .26, height: .16, pole: .28 },
  elephant: { outline: [[0, 0], [.74, 0], [1, -.82], [.65, -1], [.35, -.82], [0, -1]], width: .25, height: .13, pole: .23 },
  chariot: { outline: [[0, 0], [1, 0], [1, -.72], [.76, -.72], [.76, -1], [.5, -1], [.5, -.72], [0, -.72]], width: .27, height: .21, pole: .42 },
  cannon: { outline: [[0, 0], [1, -.25], [.61, -.55], [.84, -1], [0, -.8]], width: .23, height: .14, pole: .28 },
};

function part(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, name: string) {
  const node = new THREE.Mesh(geometry, material);
  node.name = name;
  node.position.set(x, y, z);
  node.castShadow = node.receiveShadow = true;
  parent.add(node);
  return node;
}

function clothGeometry(spec: StandardSpec) {
  const shape = new THREE.Shape(spec.outline.map(([x, y]) => new THREE.Vector2(-x * spec.width, y * spec.height)));
  const flat = new THREE.ShapeGeometry(shape).toNonIndexed();
  const source = flat.getAttribute("position");
  const vertices: number[] = [];
  const subdivide = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, depth: number) => {
    if (!depth) {
      for (const p of [a, b, c]) vertices.push(p.x, p.y, .009 * Math.sin(-p.x / spec.width * Math.PI * 2));
      return;
    }
    const ab = a.clone().lerp(b, .5), bc = b.clone().lerp(c, .5), ca = c.clone().lerp(a, .5);
    subdivide(a, ab, ca, depth - 1);
    subdivide(ab, b, bc, depth - 1);
    subdivide(ca, bc, c, depth - 1);
    subdivide(ab, bc, ca, depth - 1);
  };
  for (let index = 0; index < source.count; index += 3) {
    subdivide(new THREE.Vector3().fromBufferAttribute(source, index), new THREE.Vector3().fromBufferAttribute(source, index + 1), new THREE.Vector3().fromBufferAttribute(source, index + 2), 2);
  }
  flat.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  const uv: number[] = [];
  for (let i = 0; i < vertices.length; i += 3) uv.push((-vertices[i] / spec.width - .08) / .54, (vertices[i + 1] / spec.height + .76) / .52);
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

export function createTroopDetails(kind: PieceKind, side: Side, anchors: DetailAnchors, m: TroopDetailMaterials): TroopDetailsRig {
  const { model, combat } = anchors;
  if (kind !== combat.kind) throw new Error("Troop detail anchors do not match kind");
  const box = (parent: THREE.Object3D, size: [number, number, number], material: THREE.Material, at: [number, number, number], name: string) => part(parent, new THREE.BoxGeometry(...size), material, ...at, name);
  const ball = (parent: THREE.Object3D, radius: number, material: THREE.Material, at: [number, number, number], name: string) => part(parent, new THREE.SphereGeometry(radius, 8, 6), material, ...at, name);
  const extras: AnimatedDetail[] = [];
  const animate = (node: THREE.Object3D, axis: "x" | "z", amount: number) => extras.push({ node, rest: node.quaternion.clone(), axis, amount });
  let flagParent: THREE.Object3D = model;
  let flagAt = new THREE.Vector3();

  switch (combat.kind) {
    case "soldier": {
      for (const x of [-.16, .16]) for (let row = 0; row < 3; row++) {
        const plate = box(model, [.12, .105, .07], m.steel, [x, .79 - row * .105, -.19], "soldier-lamellar");
        plate.rotation.z = x * .28;
      }
      box(model, [.045, .13, .25], m.faction, [0, 1.28, .015], "soldier-helmet-crest");
      for (const x of [-.075, .075]) ball(model, .022, m.dark, [x, 1.015, -.166], "soldier-eye");
      const shield = combat.joints.shield.node;
      const face = part(shield, new THREE.CylinderGeometry(.21, .21, .07, 8), m.gold, .02, -.13, -.225, "soldier-shield-rim");
      face.rotation.x = Math.PI / 2;
      const panel = part(shield, new THREE.CylinderGeometry(.18, .18, .08, 8), m.faction, .02, -.13, -.235, "soldier-shield-face");
      panel.rotation.x = Math.PI / 2;
      ball(shield, .065, m.gold, [.02, -.13, -.295], "soldier-shield-boss").scale.z = .5;
      flagAt.set(.26, .97, .18);
      break;
    }
    case "general": {
      const torso = combat.joints.torso.node;
      for (const x of [-.17, .17]) for (let row = 0; row < 3; row++) box(torso, [.14, .09, .09], row % 2 ? m.gold : m.steel, [x, .31 - row * .1, -.19], "general-command-armor");
      const cape = box(torso, [.43, .49, .045], m.faction, [0, .14, .23], "general-cape");
      cape.rotation.x = -.12;
      animate(cape, "x", .09);
      part(torso, new THREE.CylinderGeometry(.195, .205, .12, 8), m.gold, 0, .735, 0, "general-crown-band");
      for (const x of [-.13, 0, .13]) part(torso, new THREE.ConeGeometry(.055, x === 0 ? .23 : .17, 4), m.gold, x, .87, -.03, "general-crown-point");
      ball(torso, .045, m.faction, [0, .86, -.18], "general-crown-jewel");
      flagParent = torso;
      flagAt.set(.35, .47, .16);
      break;
    }
    case "advisor": {
      const robe = part(model, new THREE.CylinderGeometry(.22, .31, .44, 8, 1, true), m.faction, 0, .48, .015, "advisor-long-robe");
      animate(robe, "z", .025);
      for (const x of [-1, 1]) {
        const wing = box(model, [.18, .045, .1], m.dark, [x * .22, 1.25, 0], "advisor-winged-hat");
        wing.rotation.z = x * .17;
      }
      box(combat.joints.tabletArm.node, [.12, .12, .14], m.cream, [.06, -.14, 0], "advisor-tablet-cuff");
      box(combat.joints.tabletArm.node, [.23, .37, .014], m.cream, [-.2, -.15, -.34], "advisor-tablet-inlay");
      box(model, [.12, .12, .14], m.cream, [-.26, .58, 0], "advisor-left-cuff");
      flagAt.set(.25, 1.0, .18);
      break;
    }
    case "horse": {
      const head = combat.joints.head.node;
      for (let i = 0; i < 5; i++) {
        const tuft = part(head, new THREE.ConeGeometry(.075, .14, 4), m.dark, 0, .07 + i * .075, .13 - i * .048, "horse-mane");
        tuft.rotation.x = -.3;
      }
      const muzzle = ball(head, .13, m.wood, [0, .14, -.239], "horse-muzzle");
      muzzle.scale.set(.85, .65, 1.05);
      for (const x of [-.13, .13]) {
        box(head, [.025, .21, .025], m.gold, [x, .2, -.15], "horse-bridle").rotation.x = -.3;
        ball(head, .018, m.dark, [x, .26, -.23], "horse-eye");
      }
      const saddle = box(model, [.39, .1, .31], m.wood, [0, .9, .08], "horse-saddle");
      saddle.rotation.x = -.1;
      const tail = part(model, new THREE.ConeGeometry(.065, .24, 6), m.dark, 0, .59, .37, "horse-tail");
      tail.rotation.x = -.55;
      animate(tail, "z", .15);
      flagParent = combat.joints.lance.node;
      flagAt.set(0, .48, .02);
      break;
    }
    case "elephant": {
      const head = combat.joints.head.node;
      for (const x of [-1, 1]) {
        const ear = ball(head, .205, m.faction, [x * .27, -.025, -.075], "elephant-fan-ear");
        ear.scale.set(.43, 1, .65);
        ear.rotation.z = x * -.24;
        animate(ear, "z", .05 * x);
        const tusk = part(head, new THREE.ConeGeometry(.06, .29, 8), m.cream, x * .16, -.17, -.32, "elephant-tusk");
        tusk.rotation.x = -Math.PI / 2.5;
        box(head, [.025, .13, .025], m.gold, [x * .085, -.015, -.365], "elephant-brow-trim");
      }
      box(head, [.19, .23, .022], m.faction, [0, -.015, -.375], "elephant-forehead-cloth");
      part(head, new THREE.OctahedronGeometry(.055), m.gold, 0, -.04, -.4, "elephant-forehead-jewel");
      flagAt.set(.16, .79, .19);
      break;
    }
    case "chariot": {
      const chassis = combat.joints.chassis.node;
      for (const x of [-.28, .28]) {
        box(chassis, [.045, .2, .59], m.gold, [x, .37, .015], "chariot-rail");
        for (const z of [-.23, .23]) box(chassis, [.065, .25, .065], m.wood, [x, .3, z], "chariot-rail-post");
      }
      box(chassis, [.55, .23, .035], m.steel, [0, .17, -.37], "chariot-front-armor");
      for (const x of [-.22, .22]) ball(chassis, .035, m.gold, [x, .17, -.4], "chariot-armor-rivet");
      flagParent = chassis;
      flagAt.set(.23, .52, .16);
      break;
    }
    case "cannon": {
      const barrel = combat.joints.barrel.node;
      for (const z of [-.48, -.28, .15]) part(barrel, new THREE.TorusGeometry(z === .15 ? .125 : .165, .025, 6, 14), m.gold, 0, 0, z, "cannon-barrel-band");
      const bore = part(barrel, new THREE.CircleGeometry(.135, 16), m.dark, 0, 0, -.586, "cannon-dark-bore");
      bore.rotation.y = Math.PI;
      for (const x of [-.21, .21]) {
        box(model, [.075, .27, .35], m.wood, [x, .51, -.02], "cannon-cradle-cheek");
        ball(combat.joints.trunnion.node, .07, m.gold, [x, 0, 0], "cannon-trunnion-cap");
      }
      flagAt.set(.27, .56, .2);
      break;
    }
  }

  const spec = standards[kind];
  const standard = new THREE.Group();
  standard.name = `${kind}-standard-${side}`;
  standard.position.copy(flagAt);
  flagParent.add(standard);
  part(standard, new THREE.CylinderGeometry(.013, .016, spec.pole, 6), m.wood, 0, spec.pole / 2, 0, "standard-pole");
  part(standard, new THREE.OctahedronGeometry(.032), m.gold, 0, spec.pole, 0, "standard-finial");
  const clothMaterial = new THREE.MeshStandardMaterial({ color: side === "red" ? "#d33c30" : "#243a40", side: THREE.DoubleSide, roughness: .88, metalness: 0 });
  const cloth = part(standard, clothGeometry(spec), clothMaterial, 0, spec.pole - .035, 0, `${kind}-cloth`);
  if (m.mark) {
    part(cloth, cloth.geometry, new THREE.MeshStandardMaterial({ map: m.mark, transparent: true, alphaTest: .1, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 0, 0, 0, "standard-mark");
  } else {
    part(standard, new THREE.OctahedronGeometry(spec.height * .12), m.gold, -spec.width * .28, spec.pole - .035 - spec.height * .4, .014, "standard-mark").scale.z = .2;
  }
  return { kind, standard, cloth, restVertices: (cloth.geometry.getAttribute("position").array as Float32Array).slice(), extras };
}

export function restoreTroopDetails(rig: TroopDetailsRig) {
  const positions = rig.cloth.geometry.getAttribute("position") as THREE.BufferAttribute;
  (positions.array as Float32Array).set(rig.restVertices);
  positions.needsUpdate = true;
  rig.cloth.geometry.computeVertexNormals();
  for (const extra of rig.extras) extra.node.quaternion.copy(extra.rest);
}

export function updateTroopDetails(rig: TroopDetailsRig, input: { time: number; moving: boolean; pace: "walk" | "run"; reduced: boolean; attackProgress?: number }) {
  if (input.reduced) { restoreTroopDetails(rig); return; }
  const positions = rig.cloth.geometry.getAttribute("position") as THREE.BufferAttribute;
  const width = standards[rig.kind].width;
  const attack = Math.sin((input.attackProgress ?? 0) * Math.PI);
  const amplitude = .008 + (input.moving ? input.pace === "run" ? .022 : .012 : 0) + attack * .01;
  for (let i = 0; i < positions.count; i++) {
    const x = rig.restVertices[i * 3], y = rig.restVertices[i * 3 + 1], baseZ = rig.restVertices[i * 3 + 2], free = -x / width;
    positions.setXYZ(i, x, y, baseZ + free * amplitude * Math.sin(input.time * 5.5 + free * 7 + y * 11));
  }
  positions.needsUpdate = true;
  rig.cloth.geometry.computeVertexNormals();
  for (const extra of rig.extras) {
    extra.node.quaternion.copy(extra.rest);
    const angle = Math.sin(input.time * (input.pace === "run" ? 10 : 6)) * extra.amount * (input.moving ? 1 : .12);
    extra.node.rotateOnAxis(extra.axis === "x" ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1), angle);
  }
}
