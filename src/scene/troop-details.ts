import * as THREE from "three";
import type { PieceKind, Side } from "../game/xiangqi";
import type { TroopRig } from "./combat";

export const factionColors: Record<Side, { cloth: string; hide: string; bone: string; rope: string; iron: string; skin: string }> = {
  red: { cloth: "#cb352b", hide: "#7d392b", bone: "#f4dba8", rope: "#d5ab55", iron: "#596d73", skin: "#f7ddb0" },
  black: { cloth: "#25363b", hide: "#584334", bone: "#e1c695", rope: "#a38254", iron: "#3b4445", skin: "#ba8861" },
};

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
  side: Side;
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

const tribalStandards: Record<PieceKind, StandardSpec> = {
  soldier: { ...standards.soldier, outline: [[0, 0], [1, -.16], [.64, -.4], [.94, -.66], [.5, -.73], [0, -1]] },
  general: { ...standards.general, outline: [[0, 0], [.82, -.08], [1, -.36], [.73, -.48], [.94, -.72], [.55, -.79], [.66, -1], [0, -.9]] },
  advisor: { ...standards.advisor, outline: [[0, 0], [.75, -.08], [.66, -.4], [.83, -.52], [.61, -.74], [.46, -1], [.23, -.82], [0, -.95]] },
  horse: { ...standards.horse, outline: [[0, 0], [1, -.24], [.55, -.5], [.87, -.7], [.36, -1], [0, -.83]] },
  elephant: { ...standards.elephant, outline: [[0, 0], [.66, -.08], [1, -.49], [.71, -.61], [.83, -.87], [.4, -1], [0, -.77]] },
  chariot: { ...standards.chariot, outline: [[0, 0], [.85, -.03], [1, -.35], [.74, -.51], [.92, -.7], [.51, -.67], [.57, -1], [.23, -.87], [0, -.94]] },
  cannon: { ...standards.cannon, outline: [[0, 0], [.8, -.12], [1, -.47], [.64, -.53], [.83, -.81], [.31, -1], [0, -.7]] },
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

  if (side === "red") switch (combat.kind) {
    case "soldier": {
      for (const x of [-.16, .16]) for (let row = 0; row < 3; row++) {
        const plate = box(model, [.12, .105, .07], m.steel, [x, .79 - row * .105, -.19], "soldier-lamellar");
        plate.rotation.z = x * .28;
      }
      box(model, [.045, .13, .25], m.faction, [0, 1.28, .015], "soldier-helmet-crest");
      for (const x of [-.075, .075]) ball(model, .022, m.dark, [x, 1.015, -.166], "soldier-eye");
      for (const x of [-1, 1]) {
        box(model, [.045, .15, .09], m.steel, [x * .185, 1.055, -.06], "soldier-cheekguard");
        for (let i = 0; i < 3; i++) ball(model, .018, m.gold, [x * .16, .79 - i * .105, -.231], "soldier-armor-rivet");
      }
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
      for (const x of [-.185, .185]) box(cape, [.025, .45, .012], m.gold, [x, 0, .027], "general-cape-braid");
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
      for (const x of [-.13, .13]) box(model, [.025, .31, .025], m.gold, [x, .52, -.245], "advisor-robe-braid");
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
      box(head, [.16, .065, .035], m.steel, [0, .34, -.265], "horse-army-browplate");
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


  else {
    const colors = factionColors.black;
    const material = (color: string, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness: metalness ? .72 : .95, metalness, flatShading: true });
    const hide = material(colors.hide), bone = material(colors.bone), rope = material(colors.rope), iron = material(colors.iron, .25);
    const cone = (parent: THREE.Object3D, radius: number, height: number, at: [number, number, number], name: string, material: THREE.Material = bone) => part(parent, new THREE.ConeGeometry(radius, height, 5), material, ...at, name);
    const mantle = (parent: THREE.Object3D, y: number, width: number, name: string) => {
      const fur = ball(parent, width, hide, [0, y, .035], name);
      fur.scale.set(1.6, .43, .9);
      for (let i = 0; i < 7; i++) {
        const x = (i - 3) * width * .4;
        const tuft = cone(parent, width * .25, .14 + (i % 2) * .035, [x, y - .065, -.06], `${name}-tuft`, hide);
        tuft.rotation.z = Math.PI + (i - 3) * .09;
      }
      return fur;
    };
    const teeth = (parent: THREE.Object3D, y: number, z: number, width: number, name: string) => {
      for (let i = 0; i < 5; i++) {
        const tooth = cone(parent, .022, .08 + (i % 2) * .025, [(i - 2) * width / 4, y, z], name);
        tooth.rotation.z = Math.PI + (i - 2) * .12;
      }
    };
    switch (combat.kind) {
      case "soldier": {
        mantle(model, .86, .21, "soldier-hide-mantle");
        for (const x of [-1, 1]) {
          const horn = cone(model, .045, .22, [x * .19, 1.33, 0], "soldier-bone-horn");
          horn.rotation.z = -x * .48;
          const warpaint = box(model, [.033, .025, .018], m.faction, [x * .086, .995, -.17], "soldier-warpaint");
          warpaint.rotation.z = x * .25;
          ball(model, .02, m.dark, [x * .072, 1.035, -.17], "soldier-eye");
        }
        box(model, [.075, .32, .055], rope, [.12, .66, -.225], "soldier-leather-baldric").rotation.z = -.33;
        const shield = combat.joints.shield.node;
        const face = part(shield, new THREE.CylinderGeometry(.21, .19, .07, 7), hide, .02, -.13, -.225, "soldier-hide-shield");
        face.rotation.x = Math.PI / 2;
        for (const x of [-.085, .085]) box(shield, [.027, .27, .035], rope, [.02 + x, -.13, -.27], "soldier-shield-binding");
        ball(shield, .055, bone, [.02, -.13, -.287], "soldier-shield-bone-boss").scale.z = .5;
        teeth(model, .83, -.2, .26, "soldier-tooth-collar");
        flagAt.set(.26, .97, .18);
        break;
      }
      case "general": {
        const torso = combat.joints.torso.node;
        mantle(torso, .37, .23, "general-chief-fur");
        box(torso, [.38, .43, .045], hide, [0, .12, .23], "general-hide-cape").rotation.x = -.12;
        teeth(torso, .29, -.22, .29, "general-chief-trophies");
        for (const x of [-1, 1]) {
          const horn = cone(torso, .055, .28, [x * .16, .8, 0], "general-chief-horn");
          horn.rotation.z = -x * .52;
          box(torso, [.065, .2, .04], bone, [x * .13, .55, -.16], "general-bone-faceguard").rotation.z = -x * .1;
        }
        part(torso, new THREE.CylinderGeometry(.2, .205, .065, 7), hide, 0, .735, 0, "general-chief-headband");
        for (let i = 0; i < 3; i++) {
          const crest = cone(torso, .038, .21 - i * .025, [(i - 1) * .07, .85, .05], "general-chief-crest", m.dark);
          crest.rotation.x = -.18;
        }
        box(combat.joints.weapon.node, [.16, .28, .075], iron, [.025, .66, -.08], "general-rough-cleaver").rotation.z = -.07;
        flagParent = torso;
        flagAt.set(.35, .47, .16);
        break;
      }
      case "advisor": {
        mantle(model, .88, .2, "advisor-shaman-fur");
        const skirt = part(model, new THREE.CylinderGeometry(.22, .3, .4, 7, 1, true), hide, 0, .47, .015, "advisor-hide-robe");
        animate(skirt, "z", .025);
        box(model, [.27, .24, .045], bone, [0, 1.075, -.17], "advisor-shaman-mask");
        for (const x of [-1, 1]) {
          box(model, [.065, .032, .02], m.dark, [x * .07, 1.105, -.202], "advisor-mask-eye").rotation.z = x * -.22;
          const horn = cone(model, .035, .19, [x * .15, 1.30, 0], "advisor-shaman-horn");
          horn.rotation.z = -x * .5;
        }
        teeth(model, .9, -.22, .24, "advisor-bone-necklace");
        box(combat.joints.tabletArm.node, [.23, .37, .025], hide, [-.2, -.15, -.34], "advisor-carved-tablet");
        for (const x of [-.28, -.12]) box(combat.joints.tabletArm.node, [.025, .3, .015], bone, [x, -.15, -.36], "advisor-tablet-bone-edge");
        flagAt.set(.25, 1, .18);
        break;
      }
      case "horse": {
        const head = combat.joints.head.node;
        for (let i = 0; i < 6; i++) {
          const tuft = cone(head, .075, .17, [0, .035 + i * .067, .15 - i * .045], "horse-shaggy-mane", m.dark);
          tuft.rotation.x = -.5 + (i % 2) * .17;
          tuft.rotation.z = (i % 2 ? -1 : 1) * .21;
        }
        const muzzle = ball(head, .13, hide, [0, .14, -.239], "horse-muzzle");
        muzzle.scale.set(.85, .65, 1.05);
        for (const x of [-1, 1]) {
          box(head, [.03, .21, .025], rope, [x * .13, .2, -.15], "horse-rawhide-bridle").rotation.x = -.3;
          ball(head, .018, m.dark, [x * .13, .26, -.23], "horse-eye");
          cone(head, .023, .105, [x * .13, .16, -.21], "horse-bone-bridle").rotation.z = Math.PI;
          box(model, [.045, .25, .35], hide, [x * .24, .74, .08], "horse-hide-saddle-flap");
          cone(model, .028, .1, [x * .25, .61, -.04], "horse-saddle-trophy").rotation.z = Math.PI;
        }
        box(model, [.39, .1, .31], hide, [0, .9, .08], "horse-hide-saddle").rotation.x = -.1;
        const tail = cone(model, .065, .24, [0, .59, .37], "horse-tail", m.dark);
        tail.rotation.x = -.55;
        animate(tail, "z", .15);
        mantle(combat.joints.rider.node, .78, .2, "horse-rider-fur");
        flagParent = combat.joints.lance.node;
        flagAt.set(0, .48, .02);
        break;
      }
      case "elephant": {
        const head = combat.joints.head.node;
        for (const x of [-1, 1]) {
          const ear = ball(head, .205, hide, [x * .27, -.025, -.075], "elephant-hide-ear");
          ear.scale.set(.43, 1, .65);
          ear.rotation.z = x * -.24;
          animate(ear, "z", .05 * x);
          const tusk = cone(head, .06, .29, [x * .16, -.17, -.32], "elephant-tusk");
          tusk.rotation.x = -Math.PI / 2.5;
          box(model, [.055, .26, .49], hide, [x * .35, .69, .05], "elephant-hide-drape");
          for (const z of [-.12, .04, .2]) cone(model, .025, .1, [x * .36, .54, z], "elephant-hide-trophies").rotation.z = Math.PI;
          cone(head, .032, .12, [x * .12, -.07, -.38], "elephant-brow-bone").rotation.z = Math.PI;
        }
        box(head, [.27, .08, .025], rope, [0, .09, -.365], "elephant-rawhide-headband");
        box(head, [.13, .2, .025], hide, [0, -.045, -.375], "elephant-hide-brow");
        flagAt.set(.16, .79, .19);
        break;
      }
      case "chariot": {
        const chassis = combat.joints.chassis.node;
        for (const x of [-1, 1]) {
          const rail = part(chassis, new THREE.CylinderGeometry(.045, .035, .59, 6), hide, x * .28, .37, .015, "chariot-raw-log-rail");
          rail.rotation.x = Math.PI / 2;
          for (const z of [-.23, .23]) {
            box(chassis, [.065, .25, .065], hide, [x * .28, .3, z], "chariot-timber-post").rotation.z = x * .07;
            part(chassis, new THREE.TorusGeometry(.048, .015, 4, 7), rope, x * .28, .37, z, "chariot-rope-lashing");
          }
          const roof = box(chassis, [.29, .035, .45], hide, [x * .14, .6, .015], "chariot-hide-canopy");
          roof.rotation.z = x * -.43;
        }
        box(chassis, [.53, .22, .045], hide, [0, .17, -.37], "chariot-hide-front");
        teeth(chassis, .23, -.405, .36, "chariot-front-trophies");
        for (const x of [-.19, .19]) box(chassis, [.025, .22, .025], rope, [x, .17, -.41], "chariot-front-binding");
        flagParent = chassis;
        flagAt.set(.23, .52, .16);
        break;
      }
      case "cannon": {
        const barrel = combat.joints.barrel.node;
        for (const z of [-.47, -.28, .15]) part(barrel, new THREE.TorusGeometry(z === .15 ? .125 : .165, .025, 5, 10), iron, 0, 0, z, "cannon-forged-hoop");
        for (const z of [-.2, .06]) part(barrel, new THREE.TorusGeometry(.15, .018, 5, 9), rope, 0, 0, z, "cannon-rope-binding");
        const bore = part(barrel, new THREE.CircleGeometry(.135, 16), m.dark, 0, 0, -.586, "cannon-dark-bore");
        bore.rotation.y = Math.PI;
        for (const x of [-1, 1]) {
          box(model, [.09, .26, .4], hide, [x * .21, .51, -.02], "cannon-rough-timber-cheek").rotation.z = x * .065;
          ball(combat.joints.trunnion.node, .07, iron, [x * .21, 0, 0], "cannon-forged-trunnion");
          cone(model, .035, .15, [x * .26, .53, .14], "cannon-bone-trophy").rotation.z = Math.PI;
        }
        flagAt.set(.27, .56, .2);
        break;
      }
    }
  }

  const spec = (side === "red" ? standards : tribalStandards)[kind];
  const standard = new THREE.Group();
  standard.name = `${kind}-standard-${side}`;
  standard.position.copy(flagAt);
  flagParent.add(standard);
  part(standard, new THREE.CylinderGeometry(.013, .016, spec.pole, 6), m.wood, 0, spec.pole / 2, 0, "standard-pole");
  part(standard, new THREE.OctahedronGeometry(.032), m.gold, 0, spec.pole, 0, "standard-finial");
  const clothMaterial = new THREE.MeshStandardMaterial({ color: factionColors[side].cloth, side: THREE.DoubleSide, roughness: .88, metalness: 0 });
  const cloth = part(standard, clothGeometry(spec), clothMaterial, 0, spec.pole - .035, 0, `${kind}-cloth`);
  if (m.mark) {
    part(cloth, cloth.geometry, new THREE.MeshStandardMaterial({ map: m.mark, transparent: true, alphaTest: .1, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 0, 0, 0, "standard-mark");
  } else {
    part(standard, new THREE.OctahedronGeometry(spec.height * .12), m.gold, -spec.width * .28, spec.pole - .035 - spec.height * .4, .014, "standard-mark").scale.z = .2;
  }
  return { kind, side, standard, cloth, restVertices: (cloth.geometry.getAttribute("position").array as Float32Array).slice(), extras };
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
  const width = (rig.side === "red" ? standards : tribalStandards)[rig.kind].width;
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
