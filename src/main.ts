import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import "./styles.css";
import {
  boardPosition,
  nearestPosition,
  frameCamera,
  GROUND,
  BASE,
  PIECE_SCALE,
  BOARD_BOUNDS,
} from "./scene/board";
import { createBattlefield } from "./scene/battlefield";
import { getMarchPath, surfaceSpeed, type Surface } from "./scene/landscape-layout";
import { createTacticalBoard } from "./ui/tactical-board";
import { createBattleBanner } from "./ui/battle-banner";
import { createCameraPan } from "./ui/camera-pan";
import { BattleDrums } from "./game/battle-drums";
import { playMetalClash } from "./game/metal-impact";
import { attackProfiles, applyCombatPose, createTroopRig, restoreCombatRig, sampleCombat, sampleMarchPose, type TroopRig } from "./scene/combat";
import { createTroopDetails, updateTroopDetails, restoreTroopDetails, type TroopDetailsRig } from "./scene/troop-details";
import { addJointedLeg, applyLocomotion, createLocomotionRig, poseLeg, restoreLocomotion, type LegChain, type LocomotionRig, type WheelJoint } from "./scene/locomotion";
import {
  applyMove,
  initialState,
  isInCheck,
  legalMoves,
  pieceAt,
  pieceLabels,
  type GameState,
  type Piece,
  type PieceKind,
  type Position,
  type Side,
} from "./game/xiangqi";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas")!;
const turnPill = document.querySelector<HTMLDivElement>("#turn-pill")!;
const turnText = turnPill.querySelector("strong")!;
const statusTitle =
  document.querySelector<HTMLHeadingElement>("#status-title")!;
const statusDetail =
  document.querySelector<HTMLParagraphElement>("#status-detail")!;
const speedSelect = document.querySelector<HTMLSelectElement>("#speed-select")!;
const paceSelect = document.querySelector<HTMLSelectElement>("#pace-select");
const soundButton = document.querySelector<HTMLButtonElement>("#sound-button")!;
const resetButton = document.querySelector<HTMLButtonElement>("#reset-button")!;
const viewButton = document.querySelector<HTMLButtonElement>("#view-button")!;
const battleToast = document.querySelector<HTMLDivElement>("#battle-toast")!;
const viewportWrap = document.querySelector<HTMLDivElement>(".viewport-wrap")!;
const battleBanner = createBattleBanner(document.querySelector<HTMLElement>("#battle-banner")!);
const ambienceButton = document.querySelector<HTMLButtonElement>("#ambience-button")!;

const drums = new BattleDrums();

let state: GameState = initialState();
let selectedId: string | null = null;
let availableMoves: Position[] = [];
let interactionLocked = false;
let soundEnabled = true;
let ambienceEnabled = true;
let audioContext: AudioContext | null = null;

function getAudioContext() {
  if (!soundEnabled) return null;
  audioContext ??= new AudioContext();
  if (audioContext.state === "suspended") void audioContext.resume();
  return audioContext;
}

function playTone(
  startFrequency: number,
  endFrequency: number,
  duration: number,
  type: OscillatorType,
  volume: number,
  delay = 0,
) {
  const context = getAudioContext();
  if (!context) return;
  const started = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(startFrequency, started);
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(20, endFrequency),
    started + duration,
  );
  gain.gain.setValueAtTime(0.001, started);
  gain.gain.exponentialRampToValueAtTime(volume, started + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.001, started + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(started);
  oscillator.stop(started + duration + 0.02);
}

function playNoise(
  duration: number,
  volume: number,
  cutoff: number,
  delay = 0,
) {
  const context = getAudioContext();
  if (!context) return;
  const buffer = context.createBuffer(
    1,
    Math.ceil(context.sampleRate * duration),
    context.sampleRate,
  );
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    const decay = 1 - index / data.length;
    data[index] = (Math.random() * 2 - 1) * decay;
  }
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = buffer;
  filter.type = "lowpass";
  filter.frequency.value = cutoff;
  gain.gain.value = volume;
  source.connect(filter).connect(gain).connect(context.destination);
  source.start(context.currentTime + delay);
}

function playSelectSound() {
  playTone(420, 610, 0.11, "sine", 0.085);
  playTone(760, 910, 0.08, "triangle", 0.04, 0.035);
}

function playStepSound(kind: PieceKind, step: number) {
  switch (kind) {
    case "horse":
      playTone(step % 2 ? 190 : 235, 88, 0.09, "triangle", 0.09);
      playNoise(0.07, 0.055, 820);
      break;
    case "chariot":
      playTone(step % 2 ? 105 : 86, 48, 0.12, "sawtooth", 0.07);
      playNoise(0.08, 0.04, 520);
      break;
    case "cannon":
      playTone(step % 2 ? 84 : 102, 56, 0.1, "square", 0.055);
      playNoise(0.06, 0.035, 460);
      break;
    case "elephant":
      playTone(82, 35, 0.16, "sine", 0.13);
      playNoise(0.12, 0.06, 320);
      break;
    case "general":
      playTone(180, 108, 0.08, "triangle", 0.06);
      playTone(520, 380, 0.07, "sine", 0.035, 0.02);
      break;
    case "advisor":
      playTone(560, 720, 0.09, "sine", 0.052);
      break;
    default:
      playTone(step % 2 ? 245 : 285, 128, 0.06, "triangle", 0.065);
      playNoise(0.04, 0.025, 1100);
  }
}

function playCannonSound() {
  playTone(118, 30, 0.52, "sine", 0.3);
  playTone(230, 48, 0.28, "sawtooth", 0.13);
  playNoise(0.46, 0.25, 720);
}

function playImpactSound(attacker: PieceKind, defender: PieceKind) {
  const context = getAudioContext();
  if (context && attacker !== "advisor" && attacker !== "elephant") playMetalClash(context);
  const armorCutoff =
    defender === "chariot" || defender === "cannon" ? 1900 : 1100;
  switch (attacker) {
    case "soldier":
      playTone(920, 280, 0.16, "square", 0.105);
      playNoise(0.16, 0.12, armorCutoff);
      playTone(260, 150, 0.12, "triangle", 0.07, 0.035);
      break;
    case "horse":
      playTone(470, 145, 0.26, "sawtooth", 0.13);
      playTone(125, 48, 0.28, "sine", 0.17, 0.025);
      playNoise(0.2, 0.13, 1250);
      break;
    case "chariot":
      playTone(112, 28, 0.44, "sawtooth", 0.23);
      playNoise(0.34, 0.22, 780);
      playTone(680, 120, 0.19, "square", 0.08, 0.025);
      break;
    case "cannon":
      playTone(96, 24, 0.62, "sine", 0.3);
      playNoise(0.48, 0.28, 960);
      playTone(320, 52, 0.32, "sawtooth", 0.15, 0.018);
      break;
    case "elephant":
      playTone(74, 24, 0.55, "sine", 0.28);
      playNoise(0.36, 0.2, 410);
      playTone(150, 42, 0.28, "triangle", 0.1, 0.03);
      break;
    case "general":
      playTone(1120, 220, 0.24, "square", 0.12);
      playTone(210, 72, 0.4, "sine", 0.2, 0.035);
      playNoise(0.18, 0.12, 2100);
      break;
    case "advisor":
      playTone(760, 1480, 0.3, "sine", 0.11);
      playTone(1140, 570, 0.34, "triangle", 0.09, 0.06);
      playNoise(0.14, 0.07, 2400);
  }
}

function playAlertSound(victory = false) {
  playTone(victory ? 220 : 175, victory ? 440 : 125, 0.42, "triangle", 0.09);
  playTone(victory ? 330 : 260, victory ? 660 : 190, 0.5, "sine", 0.055, 0.11);
}

const scene = new THREE.Scene();
scene.fog = new THREE.Fog("#b9d0c4", 65, 110);

const camera = new THREE.PerspectiveCamera(41, 1, 0.8, 220);
camera.position.set(8.6, 11.4, 12.5);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 7.2;
controls.maxDistance = 150;
controls.maxPolarAngle = Math.PI * 0.47;
controls.target.set(0, 0.5, 0);
const cameraPan = createCameraPan(camera, controls.target, canvas);

scene.add(new THREE.HemisphereLight("#f1f4dc", "#234b42", 1.9));
const sun = new THREE.DirectionalLight("#ffe2af", 3.1);
sun.position.set(-9, 17, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -25;
sun.shadow.camera.right = 25;
sun.shadow.camera.top = 27;
sun.shadow.camera.bottom = -27;
sun.shadow.camera.far = 100;
sun.shadow.normalBias = 0.035;
sun.shadow.bias = -0.0003;
scene.add(sun);

const world = new THREE.Group();
const pieceLayer = new THREE.Group();
const markerLayer = new THREE.Group();
const effectLayer = new THREE.Group();
scene.add(world);
world.add(pieceLayer, markerLayer, effectLayer);

const pieceGroups = new Map<string, THREE.Group>();
const pickables: THREE.Object3D[] = [];

function terrainHeightAtWorld(_x: number, _z: number) {
  return GROUND;
}
function gridToWorld(p: Position) {
  return boardPosition(p);
}
function worldToGrid(p: THREE.Vector3) {
  return nearestPosition(p);
}
function addBoard() {
  const hit = new THREE.Mesh(
    new THREE.PlaneGeometry(BOARD_BOUNDS.halfWidth * 2 + 3, BOARD_BOUNDS.halfDepth * 2 + 3),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hit.rotation.x = -Math.PI / 2;
  hit.position.y = GROUND;
  hit.name = "board-hit-plane";
  world.add(hit);
  pickables.push(hit);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: "#a4ba9c", roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2;
  world.add(floor);
}

function textTexture(
  text: string,
  color: string,
  font: string,
  width = 128,
  height = 128,
) {
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = width;
  labelCanvas.height = height;
  const context = labelCanvas.getContext("2d")!;
  context.clearRect(0, 0, width, height);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = font;
  context.fillStyle = color;
  context.fillText(text, width / 2, height / 2 + 2);
  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

const redTroopMaterial = new THREE.MeshStandardMaterial({
  color: "#db3d31",
  roughness: 0.58,
  flatShading: true,
});
const blackTroopMaterial = new THREE.MeshStandardMaterial({
  color: "#243a40",
  roughness: 0.58,
  flatShading: true,
});
const creamMaterial = new THREE.MeshStandardMaterial({
  color: "#f7ddb0",
  roughness: 0.72,
  flatShading: true,
});
const goldMaterial = new THREE.MeshStandardMaterial({
  color: "#f4b94f",
  roughness: 0.46,
  metalness: 0.12,
  flatShading: true,
});
const woodMaterial = new THREE.MeshStandardMaterial({
  color: "#78462f",
  roughness: 0.8,
  flatShading: true,
});
const steelMaterial = new THREE.MeshStandardMaterial({
  color: "#607278",
  roughness: 0.46,
  metalness: 0.35,
  flatShading: true,
});

function troopMaterial(side: Side) {
  return side === "red" ? redTroopMaterial : blackTroopMaterial;
}

function modelMesh(geometry: THREE.BufferGeometry, material: THREE.Material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addHumanoid(group: THREE.Group, side: Side, legs: LegChain[], height = 1, seated = false) {
  const torso = modelMesh(
    new THREE.CylinderGeometry(0.22, 0.32, 0.55 * height, 8),
    troopMaterial(side),
  );
  torso.position.y = 0.64;
  const head = modelMesh(new THREE.SphereGeometry(0.19, 10, 7), creamMaterial);
  head.position.y = 0.99 + (height - 1) * 0.25;
  const belt = modelMesh(
    new THREE.TorusGeometry(0.255, 0.045, 6, 16),
    goldMaterial,
  );
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.52;
  group.add(torso, head, belt);
  for (const side of [-1, 1]) {
    const leg = addJointedLeg(group, {
      role: side < 0 ? "left" : "right",
      at: new THREE.Vector3(side * (seated ? .33 : .13), .43, 0),
      upper: .23, lower: .23, width: .067, ankleHeight: .07,
      upperMaterial: steelMaterial, lowerMaterial: woodMaterial, footMaterial: blackTroopMaterial,
    });
    leg.hip.name = `human-leg-${side}`;
    if (seated) {
      poseLeg(leg, -.08, .04);
      leg.hip.rotation.z = side * .8;
    } else legs.push(leg);
    const arm = modelMesh(
      new THREE.CylinderGeometry(0.05, 0.06, 0.32, 6),
      steelMaterial,
    );
    arm.position.set(side * 0.26, 0.72, 0);
    arm.name = `human-arm-${side}`;
    group.add(arm);
  }
}

function addSpokedWheel(parent: THREE.Group, radius: number, width: number, at: THREE.Vector3): WheelJoint {
  const wheel = new THREE.Group();
  wheel.name = "spoked-wheel";
  wheel.position.copy(at);
  wheel.rotation.z = Math.PI / 2;
  const rim = modelMesh(new THREE.TorusGeometry(radius - .025, .025, 6, 16), woodMaterial);
  rim.rotation.x = Math.PI / 2;
  rim.scale.z = width / .05;
  const hub = modelMesh(new THREE.CylinderGeometry(.055, .055, width * 1.25, 8), goldMaterial);
  wheel.add(rim, hub);
  for (let index = 0; index < 6; index++) {
    const spoke = modelMesh(new THREE.BoxGeometry(.026, width * .6, radius * 1.65), steelMaterial);
    spoke.rotation.y = index * Math.PI / 6;
    wheel.add(spoke);
  }
  parent.add(wheel);
  return { node: wheel, radius, rest: wheel.quaternion.clone() };
}

function createTroopModel(kind: PieceKind, side: Side) {
  const model = new THREE.Group();
  const wheels: WheelJoint[] = [];
  const legs: LegChain[] = [];
  let rig: TroopRig;
  const pivot = (name: string, at: THREE.Vector3, ...parts: THREE.Object3D[]) => {
    const joint = new THREE.Group();
    joint.name = name;
    joint.position.copy(at);
    for (const part of parts) {
      part.position.sub(at);
      joint.add(part);
    }
    model.add(joint);
    return joint;
  };

  if (kind === "general") {
    addHumanoid(model, side, legs, 1.2);
    [-1, 1].forEach((direction) => {
      const shoulder = modelMesh(
        new THREE.SphereGeometry(0.15, 8, 6),
        goldMaterial,
      );
      shoulder.position.set(direction * 0.31, 0.86, 0);
      model.add(shoulder);
    });

    const weaponShaft = modelMesh(new THREE.CylinderGeometry(0.035, 0.035, 0.8, 6), woodMaterial);
    weaponShaft.position.set(0.31, 0.9, -0.08);
    const blade = modelMesh(new THREE.BoxGeometry(0.1, 0.4, 0.055), steelMaterial);
    blade.position.set(0.31, 1.49, -0.08);
    const guard = modelMesh(new THREE.BoxGeometry(0.25, 0.055, 0.1), goldMaterial);
    guard.position.set(0.31, 1.25, -0.08);
    const weaponArm = model.getObjectByName("human-arm-1")!;
    const torso = pivot("general-torso", new THREE.Vector3(0, 0.5, 0), ...model.children.filter((o) => !o.name.startsWith("human-leg") && o !== weaponArm));
    const weapon = pivot("general-weapon", new THREE.Vector3(0.28, 0.78, 0), weaponArm, weaponShaft, blade, guard);
    rig = createTroopRig(kind, { torso, weapon });
  }

  if (kind === "advisor") {
    addHumanoid(model, side, legs, 1.08);
    const hat = modelMesh(
      new THREE.CylinderGeometry(0.28, 0.18, 0.18, 6),
      blackTroopMaterial,
    );
    hat.position.y = 1.23;
    const tablet = modelMesh(
      new THREE.BoxGeometry(0.28, 0.5, 0.08),
      goldMaterial,
    );
    tablet.position.set(0, 0.7, -0.29);
    tablet.rotation.x = -0.18;
    const gem = modelMesh(new THREE.OctahedronGeometry(0.13), creamMaterial);
    gem.position.set(0, 1.37, 0);
    model.add(hat, tablet, gem);
    const tabletArm = pivot("advisor-tablet-arm", new THREE.Vector3(0.2, 0.85, 0), tablet, model.getObjectByName("human-arm-1")!);
    rig = createTroopRig(kind, { tabletArm });
  }

  if (kind === "elephant") {
    const body = modelMesh(
      new THREE.SphereGeometry(0.43, 12, 8),
      troopMaterial(side),
    );
    body.scale.set(1.05, 0.72, 1.22);
    body.position.y = 0.68;
    const head = modelMesh(
      new THREE.SphereGeometry(0.28, 10, 7),
      creamMaterial,
    );
    head.position.set(0, 0.78, -0.43);
    const trunk = modelMesh(
      new THREE.CylinderGeometry(0.075, 0.11, 0.5, 7),
      creamMaterial,
    );
    trunk.rotation.x = Math.PI / 2.65;
    trunk.position.set(0, 0.59, -0.67);
    model.add(body, head, trunk);
    const headJoint = pivot("elephant-head", new THREE.Vector3(0, 0.85, -0.3), head, ...model.children.filter((o) => o instanceof THREE.Mesh && o.geometry instanceof THREE.SphereGeometry && o !== body && o !== head));
    const trunkJoint = pivot("elephant-trunk", new THREE.Vector3(0, 0.79, -0.55), trunk);
    const foot = new THREE.Group();
    foot.name = "elephant-strike-foot";
    foot.position.set(.24, .55, -.21);
    model.add(foot);
    for (const [index, role] of (["frontLeft", "frontRight", "rearLeft", "rearRight"] as const).entries()) {
      const front = index < 2, right = index % 2 === 1;
      const parent = role === "frontRight" ? foot : model;
      legs.push(addJointedLeg(parent, {
        role, at: parent === foot ? new THREE.Vector3() : new THREE.Vector3(right ? .24 : -.24, .55, front ? -.21 : .24),
        upper: .3, lower: .27, width: .105, ankleHeight: .08,
        groundY: parent === foot ? -.55 : 0, bend: front ? 1 : -1,
        upperMaterial: troopMaterial(side), lowerMaterial: creamMaterial, footMaterial: blackTroopMaterial,
      }));
    }
    rig = createTroopRig(kind, { head: headJoint, trunk: trunkJoint, foot });
  }

  if (kind === "horse") {
    const body = modelMesh(
      new THREE.SphereGeometry(0.36, 10, 7),
      troopMaterial(side),
    );
    body.scale.set(0.72, 0.72, 1.24);
    body.position.y = 0.66;
    const neck = modelMesh(
      new THREE.CylinderGeometry(0.14, 0.22, 0.54, 7),
      troopMaterial(side),
    );
    neck.rotation.x = -0.55;
    neck.position.set(0, 0.88, -0.31);
    const head = modelMesh(new THREE.SphereGeometry(0.2, 9, 6), creamMaterial);
    head.scale.set(0.78, 0.86, 1.2);
    head.position.set(0, 1.12, -0.49);
    model.add(body, neck, head);
    const rider = new THREE.Group();
    addHumanoid(rider, side, [], 0.7, true);
    rider.scale.setScalar(0.62);
    rider.position.set(0, 0.72, 0.08);
    model.add(rider);
    const lance = modelMesh(
      new THREE.CylinderGeometry(0.02, 0.02, 1.4, 6),
      woodMaterial,
    );
    lance.position.set(0.28, 1.16, -0.02);
    const tip = modelMesh(new THREE.ConeGeometry(0.065, 0.2, 5), steelMaterial);
    tip.position.set(0.28, 1.96, -0.02);
    model.add(lance, tip);
    const lanceJoint = pivot("horse-lance", new THREE.Vector3(0.28, 1.1, 0), lance, tip);
    const headJoint = pivot("horse-head", new THREE.Vector3(0, 0.9, -0.35), head, neck);
    rig = createTroopRig(kind, { rider, lance: lanceJoint, head: headJoint });
    for (const [index, role] of (["frontLeft", "frontRight", "rearLeft", "rearRight"] as const).entries()) {
      const front = index < 2, right = index % 2 === 1;
      legs.push(addJointedLeg(model, {
        role, at: new THREE.Vector3(right ? .19 : -.19, .55, front ? -.24 : .24),
        upper: .31, lower: .3, width: .062, ankleHeight: .06, bend: front ? 1 : -1,
        upperMaterial: woodMaterial, lowerMaterial: creamMaterial, footMaterial: blackTroopMaterial,
      }));
    }
    for (const direction of [-1, 1]) {
      const ear = modelMesh(new THREE.ConeGeometry(.055, .2, 5), woodMaterial);
      ear.position.set(direction * .08, 1.34, -.49);
      ear.position.sub(headJoint.position);
      headJoint.add(ear);
    }
  }

  if (kind === "chariot") {
    const carriage = modelMesh(
      new THREE.BoxGeometry(0.68, 0.38, 0.72),
      troopMaterial(side),
    );
    carriage.position.y = 0.62;
    const roof = modelMesh(new THREE.ConeGeometry(0.48, 0.3, 4), goldMaterial);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 0.99;
    model.add(carriage, roof);
    const chassis = pivot("chariot-chassis", new THREE.Vector3(0, 0.45, 0), carriage, roof);
    const ramBeam = modelMesh(new THREE.CylinderGeometry(0.1, 0.1, 0.65, 8), woodMaterial);
    ramBeam.rotation.x = Math.PI / 2;
    ramBeam.position.set(0, 0.54, -0.49);
    const ramTip = modelMesh(new THREE.ConeGeometry(0.14, 0.24, 6), steelMaterial);
    ramTip.rotation.x = -Math.PI / 2;
    ramTip.position.set(0, 0.54, -0.93);
    const ram = pivot("chariot-ram", new THREE.Vector3(0, 0.54, -0.15), ramBeam, ramTip);
    rig = createTroopRig(kind, { chassis, ram });
    [-1, 1].forEach((x) =>
      [-1, 1].forEach((z) => {
        wheels.push(addSpokedWheel(model, .18, .11, new THREE.Vector3(x * .4, .36, z * .24)));
      }),
    );

  }

  if (kind === "cannon") {
    const cradle = modelMesh(
      new THREE.BoxGeometry(0.65, 0.18, 0.58),
      troopMaterial(side),
    );
    cradle.position.y = 0.43;
    const barrel = modelMesh(
      new THREE.CylinderGeometry(0.11, 0.18, 0.92, 12),
      steelMaterial,
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.67, -0.12);
    const muzzle = modelMesh(
      new THREE.TorusGeometry(0.18, 0.04, 8, 14),
      goldMaterial,
    );
    muzzle.position.set(0, 0.67, -0.58);
    model.add(cradle, barrel, muzzle);
    const barrelSlide = pivot("cannon-recoil-slide", new THREE.Vector3(0, 0.67, 0), barrel, muzzle);
    const trunnion = pivot("cannon-trunnion", new THREE.Vector3(0, 0.67, 0), barrelSlide);
    rig = createTroopRig(kind, { trunnion, barrel: barrelSlide });
    [-1, 1].forEach((direction) => {
      wheels.push(addSpokedWheel(model, .23, .12, new THREE.Vector3(direction * .39, .36, .03)));
    });
  }

  if (kind === "soldier") {
    addHumanoid(model, side, legs, 0.88);
    const helmet = modelMesh(
      new THREE.SphereGeometry(0.23, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      goldMaterial,
    );
    helmet.position.y = 1.12;
    const spear = modelMesh(
      new THREE.CylinderGeometry(0.025, 0.025, 1.2, 6),
      woodMaterial,
    );
    spear.position.set(0.3, 0.9, -0.02);
    const spearTip = modelMesh(
      new THREE.ConeGeometry(0.075, 0.22, 5),
      steelMaterial,
    );
    spearTip.position.set(0.3, 1.58, -0.02);
    model.add(helmet, spear, spearTip);
    const spearJoint = pivot("soldier-spear", new THREE.Vector3(0.3, 0.78, 0), spear, spearTip, model.getObjectByName("human-arm-1")!);
    const shieldJoint = pivot("soldier-shield", new THREE.Vector3(-0.25, 0.78, 0), model.getObjectByName("human-arm--1")!);
    rig = createTroopRig(kind, { spear: spearJoint, shield: shieldJoint });
  }

  const label = pieceLabels[side][kind];
  const badge = new THREE.Mesh(
    new THREE.PlaneGeometry(0.32, 0.36),
    new THREE.MeshStandardMaterial({
      map: textTexture(label, "#f9e5b7", "900 100px serif"),
      transparent: true,
      alphaTest: 0.1,
      roughness: 0.8,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  badge.name = "identity-mark";
  const combat = rig!;
  const bodyMarkOwner = combat.kind === "general" ? combat.joints.torso.node
    : combat.kind === "chariot" ? combat.joints.chassis.node : model;
  const attachMark = (mark: THREE.Object3D, owner = bodyMarkOwner) => {
    if (owner !== model) mark.position.sub(owner.position);
    owner.add(mark);
  };
  badge.position.set(
    0,
    kind === "horse" ? 0.76 : kind === "elephant" ? 0.77 : 0.66,
    kind === "horse"
      ? -0.08
      : kind === "elephant"
        ? 0.43
        : kind === "cannon"
          ? 0.32
          : -0.333,
  );
  if (kind === "elephant" || kind === "cannon") badge.rotation.y = Math.PI;
  if (kind === "horse" || kind === "elephant" || kind === "chariot") {
    badge.position.set(kind === "horse" ? 0.285 : kind === "chariot" ? .355 : 0.46, kind === "chariot" ? .62 : .75, 0.04);
    badge.rotation.y = Math.PI / 2;
    const other = badge.clone();
    other.position.x = -badge.position.x;
    other.rotation.y = -Math.PI / 2;
    attachMark(other);
  } else if (kind === "cannon") {
    badge.scale.y = 0.5;
    badge.position.y = 0.43;
    badge.position.z = 0.304;
    badge.rotation.y = 0;
  } else {
    const back = badge.clone();
    back.position.z = 0.333;
    attachMark(back);
    badge.rotation.y = Math.PI;
  }
  if (combat.kind === "advisor") {
    badge.position.z = -.37;
    attachMark(badge, combat.joints.tabletArm.node);
  } else attachMark(badge);
  model.userData.detailsRig = createTroopDetails(kind, side, { model, combat: rig! }, {
    faction: troopMaterial(side), cream: creamMaterial, gold: goldMaterial,
    wood: woodMaterial, steel: steelMaterial, dark: blackTroopMaterial,
    mark: textTexture(label, "#f9e5b7", "900 100px serif"),
  });
  if (side === "black") model.rotation.y = Math.PI;
  model.userData.locomotionRig = createLocomotionRig(kind, legs, wheels);
  model.userData.combatRig = rig!;
  return model;
}

function createPiece(piece: Piece) {
  const group = new THREE.Group();
  group.userData.pieceId = piece.id;
  group.userData.kind = piece.kind;
  group.userData.side = piece.side;

  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.7, 32),
    new THREE.MeshBasicMaterial({ color: "#79e6a4", side: THREE.DoubleSide }),
  );
  halo.name = "selection-halo";
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.025;
  halo.visible = false;

  const troop = createTroopModel(piece.kind, piece.side);
  troop.position.y = -new THREE.Box3().setFromObject(troop).min.y;
  group.userData.troop = troop;
  group.userData.restY = troop.position.y;
  group.userData.locomotionRig = troop.userData.locomotionRig;
  group.userData.combatRig = troop.userData.combatRig;
  group.userData.detailsRig = troop.userData.detailsRig;
  group.userData.pace = "walk";
  group.userData.combatPhase = "idle";
  group.userData.combatProgress = 0;
  group.userData.modelBaseYaw = piece.side === "black" ? Math.PI : 0;

  group.add(halo, troop);
  group.position.copy(gridToWorld(piece));
  group.scale.setScalar(PIECE_SCALE);
  group.traverse((child) => {
    child.userData.pieceId = piece.id;
  });
  pickables.push(group);
  pieceGroups.set(piece.id, group);
  pieceLayer.add(group);
  return group;
}

function renderPieces() {
  const active = new Set(state.pieces.map((p) => p.id));
  pieceGroups.forEach((g, id) => {
    if (!active.has(id)) {
      pieceLayer.remove(g);
      g.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of ms)
            if (
              ![
                redTroopMaterial,
                blackTroopMaterial,
                creamMaterial,
                goldMaterial,
                woodMaterial,
                steelMaterial,
              ].includes(m as THREE.MeshStandardMaterial)
            )
              m.dispose();
        }
      });
      pieceGroups.delete(id);
    }
  });
  pickables.splice(1);
  for (const p of state.pieces) {
    const g = pieceGroups.get(p.id);
    if (!g) createPiece(p);
    else {
      restoreCombatRig(g.userData.combatRig as TroopRig);
      restoreTroopDetails(g.userData.detailsRig as TroopDetailsRig);
      const troop = g.userData.troop as THREE.Group;
      troop.position.y = Number(g.userData.restY);
      troop.rotation.y = Number(g.userData.modelBaseYaw);
      troop.rotation.x = troop.rotation.z = 0;
      restoreLocomotion(g.userData.locomotionRig as LocomotionRig, true);
      g.visible = true;
      g.userData.combatPhase = "idle";
      g.userData.combatProgress = 0;
      g.userData.marchMotion = "idle";
      g.position.copy(gridToWorld(p));
      g.scale.setScalar(PIECE_SCALE);
      g.rotation.set(0, 0, 0);
      g.getObjectByName("selection-halo")!.visible = false;
      pickables.push(g);
    }
  }
}

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let animationEpoch = 0,
  overview = false,
  lastMove: { from: Position; to: Position } | null = null;
const routePreviewLayer = new THREE.Group();
routePreviewLayer.name = "march-route-preview";
world.add(routePreviewLayer);
let previewKey = "";
const routeCaption = document.querySelector<HTMLElement>("#route-caption")!;
const tactical = createTacticalBoard(
  () => ({
    state,
    selectedId,
    moves: availableMoves,
    locked: interactionLocked,
    last: lastMove,
  }),
  (at) => {
    if (interactionLocked) return;
    getAudioContext();
    drums.unlock();
    document.querySelector("#music-status")!.textContent = "战鼓随战况渐强";
    const p = pieceAt(state, at);
    if (p?.side === state.turn) selectPiece(p);
    else if (selectedId) void tryMove(at);
  },
  previewRoute,
);
function clearPreview() {
  previewKey = "";
  routeCaption.hidden = true;
  for (const m of routePreviewLayer.children)
    if (m instanceof THREE.Mesh) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  routePreviewLayer.clear();
}
function previewRoute(to: Position | null) {
  if (
    !to ||
    interactionLocked ||
    !selectedId ||
    !availableMoves.some((p) => p.x === to.x && p.y === to.y)
  ) {
    clearPreview();
    return;
  }
  const k = `${selectedId}:${to.x},${to.y}`;
  if (k === previewKey) return;
  clearPreview();
  previewKey = k;
  const p = state.pieces.find((p) => p.id === selectedId)!,
    path = getMarchPath(p, to, state.pieces, p.kind);
  const line = new THREE.Mesh(
    new THREE.TubeGeometry(
      path,
      Math.ceil(path.getLength() * 5),
      0.026,
      4,
      false,
    ),
    new THREE.MeshBasicMaterial({ color: "#a3e98a", toneMapped: false }),
  );
  line.name = "physical-route-trail";
  line.position.y = 0.075;
  routePreviewLayer.add(line);
  const n = Math.ceil(path.getLength() / 0.36) + 1,
    dots = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.065, 6, 4),
      new THREE.MeshBasicMaterial({ color: "#d9f4a5", toneMapped: false }),
      n,
    ),
    dummy = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    dummy.position.copy(path.getPointAt(i / (n - 1)));
    dummy.position.y = GROUND + 0.075;
    dummy.updateMatrix();
    dots.setMatrixAt(i, dummy.matrix);
  }
  dots.name = "physical-route-dots";
  dots.computeBoundingSphere();
  routePreviewLayer.add(dots);
  const names: Record<Surface, string> = {
    dirt: "土路",
    mud: "湿地路",
    mountain: "山路",
    imperial: "驰道",
    courtyard: "城内道路",
    bridge: "石桥",
    boardwalk: "栈道",
    ferry: "渡船",
  };
  routeCaption.textContent =
    "行军预览 · " +
    path.sections
      .map((s) => s.surface)
      .filter((s, i, a) => i === 0 || s !== a[i - 1])
      .map((s) => names[s])
      .join(" → ");
  routeCaption.hidden = false;
}

function renderMarkers() {
  clearPreview();
  for (const m of markerLayer.children)
    if (m instanceof THREE.Mesh) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  markerLayer.clear();
  availableMoves.forEach((move) => {
    const occupied = pieceAt(state, move);
    const marker = new THREE.Mesh(
      new THREE.TorusGeometry(occupied ? 0.5 : 0.34, occupied ? 0.065 : 0.055, 8, 32),
      new THREE.MeshBasicMaterial({
        color: occupied ? "#ffcf66" : "#57e59b",
        depthTest: false,
        depthWrite: false,
        transparent: true,
        opacity: 0.95,
        toneMapped: false,
      }),
    );
    marker.position.copy(gridToWorld(move));
    marker.position.y += 0.1;
    marker.rotation.x = Math.PI / 2;
    marker.renderOrder = 20;
    marker.userData.move = move;
    markerLayer.add(marker);
  });
}

function updateUI(title?: string, detail?: string) {
  tactical.render();
  const sideName = state.turn === "red" ? "红方" : "黑方";
  turnPill.classList.toggle("black", state.turn === "black");
  turnText.textContent = state.winner
    ? `${state.winner === "red" ? "红方" : "黑方"}获胜`
    : `${sideName}行军`;
  if (state.winner) {
    statusTitle.textContent = `${state.winner === "red" ? "红方" : "黑方"}凯旋`;
    statusDetail.textContent = "主帅已经取得胜利。可以重新布阵再战一局。";
    return;
  }
  if (title) statusTitle.textContent = title;
  else
    statusTitle.textContent = selectedId ? "选择落点" : `${sideName}整军待发`;
  if (detail) statusDetail.textContent = detail;
  else
    statusDetail.textContent = selectedId
      ? "发光标记表示当前棋子的合法移动位置。"
      : `选择一枚${sideName}棋子开始行军。`;
}

function showToast(message: string) {
  battleToast.textContent = message;
  battleToast.classList.add("show");
  window.setTimeout(() => battleToast.classList.remove("show"), 1200);
}

function selectPiece(piece: Piece) {
  playSelectSound();
  selectedId = piece.id;
  availableMoves = legalMoves(state, piece);
  pieceGroups.forEach((group, id) => {
    group.scale.setScalar(PIECE_SCALE);
    group.getObjectByName("selection-halo")!.visible = id === piece.id;
  });
  renderMarkers();
  updateUI(
    `${pieceLabels[piece.side][piece.kind]}已列阵`,
    `共有 ${availableMoves.length} 个合法落点。${piece.kind === "soldier" && (piece.side === "red" ? piece.y <= 4 : piece.y >= 5) ? "已过河，可前进或横移。不能使己方主帅受将。" : ""}`,
  );
}

function clearSelection() {
  selectedId = null;
  availableMoves = [];
  pieceGroups.forEach((group) => {
    group.scale.setScalar(PIECE_SCALE);
    group.getObjectByName("selection-halo")!.visible = false;
  });
  renderMarkers();
  updateUI();
}

function createDustPuff(position: THREE.Vector3, strength = 1) {
  const material = new THREE.MeshStandardMaterial({
    color: "#d7b77c",
    transparent: true,
    opacity: 0.5,
    roughness: 1,
  });
  const puff = modelMesh(
    new THREE.SphereGeometry(0.13 * strength, 7, 5),
    material,
  );
  puff.position.copy(position);
  puff.position.y = terrainHeightAtWorld(position.x, position.z) + 0.08;
  puff.scale.set(1.4, 0.45, 1);
  effectLayer.add(puff);
  const started = performance.now();
  const tick = (time: number) => {
    const progress = Math.min(1, (time - started) / 420);
    puff.position.y += 0.0025;
    puff.scale.multiplyScalar(1.018);
    material.opacity = 0.5 * (1 - progress);
    if (progress < 1) requestAnimationFrame(tick);
    else effectLayer.remove(puff);
  };
  requestAnimationFrame(tick);
}

function createAttackSignature(position: THREE.Vector3, attacker: PieceKind) {
  const root = new THREE.Group();
  const baseY = terrainHeightAtWorld(position.x, position.z) + 0.2;
  root.position.set(position.x, baseY, position.z);
  const animatedMaterials: THREE.MeshBasicMaterial[] = [];
  const effectMaterial = (color: string, opacity = 0.92) => {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    animatedMaterials.push(material);
    return material;
  };
  let duration = 620;
  let rise = 0.3;
  let spin = 0.08;

  if (attacker === "soldier") {
    const slashMaterial = effectMaterial("#f7f1c6");
    [-1, 1].forEach((direction) => {
      const slash = new THREE.Mesh(
        new THREE.BoxGeometry(0.075, 0.055, 1.75),
        slashMaterial,
      );
      slash.position.y = 0.48;
      slash.rotation.set(direction * 0.58, direction * 0.72, direction * 0.45);
      root.add(slash);
    });
    const spearTip = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.6, 5),
      effectMaterial("#ffd25d"),
    );
    spearTip.rotation.x = Math.PI / 2;
    spearTip.position.set(0, 0.48, -0.46);
    root.add(spearTip);
    spin = 0.02;
  } else if (attacker === "horse") {
    for (let index = 0; index < 5; index += 1) {
      const streak = new THREE.Mesh(
        new THREE.ConeGeometry(0.08, 1.4 + index * 0.12, 5),
        effectMaterial(index % 2 ? "#fff1b0" : "#e68b3e"),
      );
      streak.rotation.x = Math.PI / 2;
      streak.position.set(
        (index - 2) * 0.18,
        0.32 + Math.abs(index - 2) * 0.08,
        0.22,
      );
      root.add(streak);
    }
    duration = 700;
    spin = 0.018;
  } else if (attacker === "chariot") {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.11, 8, 28),
      effectMaterial("#ffd062"),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.14;
    root.add(ring);
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      const ram = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.18, 0.72),
        effectMaterial(index % 2 ? "#a65d37" : "#f3bd51"),
      );
      ram.position.set(Math.cos(angle) * 0.42, 0.35, Math.sin(angle) * 0.42);
      ram.rotation.y = -angle;
      root.add(ram);
    }
    duration = 760;
    rise = 0.12;
    spin = 0.11;
  } else if (attacker === "cannon") {
    for (let index = 0; index < 13; index += 1) {
      const isSmoke = index > 6;
      const fireball = new THREE.Mesh(
        new THREE.IcosahedronGeometry(isSmoke ? 0.22 : 0.18, 1),
        effectMaterial(
          isSmoke ? "#465158" : index % 2 ? "#ffdb57" : "#ff5a20",
          isSmoke ? 0.72 : 0.98,
        ),
      );
      const angle = index * 2.399;
      const radius = 0.18 + (index % 4) * 0.13;
      fireball.position.set(
        Math.cos(angle) * radius,
        0.28 + (index % 5) * 0.15,
        Math.sin(angle) * radius,
      );
      root.add(fireball);
    }
    duration = 900;
    rise = 0.65;
    spin = 0.04;
  } else if (attacker === "elephant") {
    [0, 1, 2].forEach((index) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.24 + index * 0.18, 0.32 + index * 0.2, 24),
        effectMaterial(index === 0 ? "#fff0a0" : "#b17842"),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.035 + index * 0.035;
      root.add(ring);
    });
    for (let index = 0; index < 7; index += 1) {
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.1 + (index % 3) * 0.035, 0),
        effectMaterial("#745338"),
      );
      const angle = (index / 7) * Math.PI * 2;
      rock.position.set(
        Math.cos(angle) * 0.52,
        0.22 + (index % 2) * 0.18,
        Math.sin(angle) * 0.52,
      );
      root.add(rock);
    }
    duration = 820;
    rise = 0.22;
    spin = 0.035;
  } else if (attacker === "general") {
    [-1, 1].forEach((direction) => {
      const arc = new THREE.Mesh(
        new THREE.RingGeometry(0.46, 0.58, 28, 1, 0, Math.PI * 1.25),
        effectMaterial(direction > 0 ? "#ffe788" : "#ff8a46"),
      );
      arc.rotation.set(0, direction * 0.75, direction * 0.68);
      arc.position.y = 0.48;
      root.add(arc);
    });
    const crown = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.25),
      effectMaterial("#fff3b0"),
    );
    crown.position.y = 0.72;
    root.add(crown);
    duration = 720;
    spin = 0.12;
  } else {
    const seal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.48),
      effectMaterial("#87f1dc"),
    );
    seal.position.y = 0.45;
    root.add(seal);
    for (let index = 0; index < 6; index += 1) {
      const rune = new THREE.Mesh(
        new THREE.TorusGeometry(0.12, 0.035, 6, 16),
        effectMaterial("#d8fff2"),
      );
      const angle = (index / 6) * Math.PI * 2;
      rune.position.set(Math.cos(angle) * 0.68, 0.38, Math.sin(angle) * 0.68);
      rune.rotation.x = Math.PI / 2;
      root.add(rune);
    }
    duration = 860;
    rise = 0.55;
    spin = 0.16;
  }

  effectLayer.add(root);
  const started = performance.now();
  const initialScales = root.children.map((child) => child.scale.clone());
  const tick = (time: number) => {
    const progress = Math.min(1, (time - started) / duration);
    const burst = Math.sin(Math.min(1, progress * 1.65) * Math.PI * 0.5);
    root.rotation.y += spin;
    root.position.y = baseY + progress * rise;
    root.children.forEach((child, index) => {
      const scale = initialScales[index];
      child.scale
        .copy(scale)
        .multiplyScalar(0.5 + burst * (attacker === "cannon" ? 2.4 : 1.65));
      child.rotation.z += spin * 0.42;
    });
    animatedMaterials.forEach((material) => {
      material.opacity *= 0.91 + (1 - progress) * 0.09;
    });
    if (progress < 1) requestAnimationFrame(tick);
    else effectLayer.remove(root);
  };
  requestAnimationFrame(tick);
}

function createImpact(
  position: THREE.Vector3,
  attacker: PieceKind,
  defender: PieceKind,
) {
  playImpactSound(attacker, defender);
  createAttackSignature(position, attacker);
  viewportWrap.classList.remove("impact");
  void viewportWrap.offsetWidth;
  viewportWrap.classList.add("impact");
  window.setTimeout(() => viewportWrap.classList.remove("impact"), 340);

  const material = new THREE.MeshBasicMaterial({
    color: "#ffd36a",
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
  });
  const flash = new THREE.Mesh(
    new THREE.RingGeometry(0.12, 0.28, 12),
    material,
  );
  flash.rotation.x = -Math.PI / 2;
  flash.position.copy(position);
  flash.position.y = terrainHeightAtWorld(position.x, position.z) + 0.22;
  const burst = new THREE.Group();
  burst.add(flash);
  const shards: Array<{ mesh: THREE.Mesh; velocity: THREE.Vector3 }> = [];
  for (let index = 0; index < 10; index += 1) {
    const angle = (index / 10) * Math.PI * 2;
    const shard = modelMesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.2),
      index % 2 ? goldMaterial : steelMaterial,
    );
    shard.position.copy(position);
    shard.position.y = terrainHeightAtWorld(position.x, position.z) + 0.3;
    burst.add(shard);
    shards.push({
      mesh: shard,
      velocity: new THREE.Vector3(
        Math.cos(angle) * 0.018,
        0.018 + Math.random() * 0.012,
        Math.sin(angle) * 0.018,
      ),
    });
  }
  effectLayer.add(burst);
  const started = performance.now();
  const tick = (time: number) => {
    const progress = Math.min(1, (time - started) / 320);
    flash.scale.setScalar(1 + progress * 3.5);
    material.opacity = 0.9 * (1 - progress);
    shards.forEach(({ mesh, velocity }) => {
      mesh.position.add(velocity);
      velocity.y -= 0.0014;
      mesh.rotation.x += 0.18;
      mesh.rotation.z += 0.13;
      mesh.scale.setScalar(1 - progress * 0.65);
    });
    if (progress < 1) requestAnimationFrame(tick);
    else effectLayer.remove(burst);
  };
  requestAnimationFrame(tick);
}

function readPace(): "walk" | "run" {
  return paceSelect?.value === "run" ? "run" : "walk";
}

paceSelect?.addEventListener("change", () => {
  const feedback = document.querySelector("#pace-feedback");
  if (feedback) feedback.textContent = readPace() === "run"
    ? "跑步动作 · 播放速度单独调节，窄桥仍谨慎通行"
    : "步行动作 · 播放速度单独调节";
});

function readPresentationRate() {
  return Number(speedSelect.value);
}

speedSelect.addEventListener("change", () => {
  document.querySelector("#speed-feedback")!.textContent = `${speedSelect.value}× · 当前行军、渡船与交锋即时生效`;
});

function stopLocomotion(g: THREE.Group) {
  restoreCombatRig(g.userData.combatRig as TroopRig);
  restoreTroopDetails(g.userData.detailsRig as TroopDetailsRig);
  const troop = g.userData.troop as THREE.Group;
  troop.position.y = Number(g.userData.restY);
  restoreLocomotion(g.userData.locomotionRig as LocomotionRig);
  g.userData.marchMotion = "idle";
}

async function animateCombat(attacker: Piece, defender: Piece, epoch: number) {
  battleBanner.show({ kind: "engage", side: attacker.side, actor: attacker.kind, target: defender.kind });
  const g = pieceGroups.get(attacker.id)!, target = pieceGroups.get(defender.id)!,
    troop = g.userData.troop as THREE.Group,
    defenderTroop = target.userData.troop as THREE.Group,
    rig = g.userData.combatRig as TroopRig,
    profile = attackProfiles[attacker.kind],
    restPosition = defenderTroop.position.clone(),
    restRotation = defenderTroop.quaternion.clone(),
    direction = target.position.clone().sub(g.position);
  stopLocomotion(g);
  stopLocomotion(target);
  g.rotation.y = Math.atan2(direction.x, direction.z) + Math.PI - Number(g.userData.modelBaseYaw);
  g.userData.combatPhase = "attacking";
  g.userData.combatProgress = 0;
  g.userData.combatImpacts = 0;
  target.userData.combatPhase = "defending";
  const localRecoil = direction.clone().normalize().applyQuaternion(target.quaternion.clone().invert()).multiplyScalar(0.19);
  let projectile: THREE.Mesh | undefined;
  if (attacker.kind === "cannon") {
    projectile = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: "#ffda78", toneMapped: false }));
    projectile.visible = false;
    world.add(projectile);
  }
  await new Promise<void>((resolve) => {
    let previousTime: number | undefined, elapsed = 0, impacted = false;
    const finish = () => {
      restoreCombatRig(rig);
      troop.position.y = Number(g.userData.restY);
      defenderTroop.position.copy(restPosition);
      defenderTroop.quaternion.copy(restRotation);
      g.userData.combatPhase = "idle";
      target.userData.combatPhase = "idle";
      if (projectile) {
        world.remove(projectile);
        projectile.geometry.dispose();
        (projectile.material as THREE.Material).dispose();
      }
      resolve();
    };
    const tick = (time: number) => {
      if (epoch !== animationEpoch) { finish(); return; }
      const delta = previousTime === undefined ? 0 : (time - previousTime) / 1000;
      previousTime = time;
      elapsed += delta * readPresentationRate() * (reducedMotion.matches ? 1.8 : 1);
      const phase = Math.min(1, elapsed / profile.duration);
      g.userData.combatProgress = phase;
      applyCombatPose(rig, sampleCombat(attacker.kind, phase), reducedMotion.matches ? 0.45 : 1);
      if (projectile) {
        const flight = Math.max(0, Math.min(1, (phase - 0.22) / (profile.impact - 0.22)));
        projectile.visible = phase >= 0.22 && phase < profile.impact;
        projectile.position.lerpVectors(g.position, target.position, flight);
        projectile.position.y += 0.6 + Math.sin(flight * Math.PI) * 0.18;
      }
      if (!impacted && phase >= profile.impact) {
        impacted = true;
        g.userData.combatImpacts = 1;
        battleBanner.impact();
        if (attacker.kind === "cannon") playCannonSound();
        createImpact(target.position, attacker.kind, defender.kind);
      }
      const reaction = phase < profile.impact ? 0 : Math.sin(((phase - profile.impact) / (1 - profile.impact)) * Math.PI);
      defenderTroop.position.copy(restPosition).addScaledVector(localRecoil, reaction);
      defenderTroop.quaternion.copy(restRotation).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.24 * reaction, 0, 0.09 * reaction)));
      if (phase < 1) requestAnimationFrame(tick);
      else { target.visible = false; finish(); }
    };
    requestAnimationFrame(tick);
  });
}

async function animateMove(piece: Piece, to: Position, captured: Piece | null) {
  const epoch = animationEpoch,
    g = pieceGroups.get(piece.id)!,
    troop = g.userData.troop as THREE.Group,
    path = getMarchPath(piece, to, state.pieces, piece.kind),
    length = path.getLength(),
    end = gridToWorld(to),
    march = battlefield.startMarch(path, piece.kind);
  restoreLocomotion(g.userData.locomotionRig as LocomotionRig, true);
  let dust = -1, lastDistance = 0, groundDistance = 0, resumingAfterAttack = false;
  const advanceMarch = (stopDistance: number) => new Promise<void>((resolve) => {
    let previousTime: number | undefined;
    const tick = (time: number) => {
      if (epoch !== animationEpoch) { stopLocomotion(g); resolve(); return; }
      const elapsed = previousTime === undefined ? 0 : (time - previousTime) / 1000;
      previousTime = time;
      const simulationDelta = elapsed * readPresentationRate() * (reducedMotion.matches ? 5 : 1),
        frame = march.advance(simulationDelta);
      if (frame.status === "cancelled") { stopLocomotion(g); resolve(); return; }
      const distance = resumingAfterAttack
          ? Math.min(stopDistance, frame.distance, lastDistance + simulationDelta * surfaceSpeed(piece.kind, path.surfaceAt(lastDistance / length)))
          : Math.min(stopDistance, frame.distance),
        u = distance / length,
        surface = resumingAfterAttack ? path.surfaceAt(u) : frame.surface,
        walking = resumingAfterAttack ? distance > lastDistance : frame.motion === "walking" && !frame.done;
      g.userData.marchMotion = resumingAfterAttack ? (walking ? "walking" : "idle") : frame.motion;
      g.position.copy(path.getPointAt(u)).setY(BASE);
      const d = path.getTangentAt(Math.min(0.9999, u)),
        yaw = Math.atan2(d.x, d.z) + Math.PI - Number(g.userData.modelBaseYaw);
      const turn = Math.atan2(Math.sin(yaw - g.rotation.y), Math.cos(yaw - g.rotation.y));
      g.rotation.y += turn * 0.32;
      if (walking) groundDistance += distance - lastDistance;
      lastDistance = distance;
      troop.position.y = Number(g.userData.restY);
      applyLocomotion(g.userData.locomotionRig as LocomotionRig, {
        distance: groundDistance, surface,
        motion: walking ? "walking" : frame.motion === "riding" ? "riding" : "waiting",
        reduced: reducedMotion.matches,
        pace: readPace(),
      });
      const locomotion = g.userData.locomotionRig as LocomotionRig;
      g.userData.pace = locomotion.pace;
      if (walking && !reducedMotion.matches) {
        applyCombatPose(g.userData.combatRig as TroopRig, sampleMarchPose(piece.kind, locomotion.cycle, locomotion.pace, locomotion.narrow));
      } else restoreCombatRig(g.userData.combatRig as TroopRig);
      const step = Math.floor(groundDistance / 0.9);
      if (step > dust && u > 0.05 && u < 0.95 && walking) {
        dust = step;
        if (!reducedMotion.matches && !["bridge", "boardwalk"].includes(surface)) createDustPuff(g.position, 0.6);
        if (surface === "boardwalk") playTone(step % 2 ? 145 : 180, 80, 0.065, "triangle", 0.05);
        else if (surface === "mud") playNoise(0.06, 0.045, 380);
        else playStepSound(piece.kind, step);
      }
      if (distance < stopDistance - 1e-9) requestAnimationFrame(tick);
      else { stopLocomotion(g); resolve(); }
    };
    requestAnimationFrame(tick);
  });
  await advanceMarch(captured ? Math.max(0, length - 0.8) : length);
  if (epoch !== animationEpoch) return;
  if (captured) {
    await animateCombat(piece, captured, epoch);
    if (epoch !== animationEpoch) return;
    resumingAfterAttack = true;
    await advanceMarch(length);
    if (epoch !== animationEpoch) return;
  }
  g.position.copy(end);
  stopLocomotion(g);
}

async function tryMove(to: Position) {
  if (!selectedId || interactionLocked) return;
  const piece = state.pieces.find((item) => item.id === selectedId);
  if (!piece) return;
  const result = applyMove(state, selectedId, to);
  if (!result) {
    const crossed = piece.kind === "soldier" && (piece.side === "red" ? piece.y <= 4 : piece.y >= 5),
      target = pieceAt(state, to);
    if (crossed && to.y === piece.y && Math.abs(to.x - piece.x) === 1 && target?.side !== piece.side) {
      const next: GameState = { ...state, pieces: state.pieces.filter((p) => p.id === piece.id || p.x !== to.x || p.y !== to.y).map((p) => p.id === piece.id ? { ...p, ...to } : p) };
      if (isInCheck(next, piece.side)) {
        const generals = next.pieces.filter((p) => p.kind === "general");
        const facing = generals.length === 2 && generals[0].x === generals[1].x && !next.pieces.some((p) => p.kind !== "general" && p.x === generals[0].x && p.y > Math.min(generals[0].y, generals[1].y) && p.y < Math.max(generals[0].y, generals[1].y));
        const message = facing ? "兵卒已过河，但此处横移会使将帅照面。请先保护主帅。" : "兵卒已过河，但此处横移会使己方主帅受将。";
        updateUI("这个落点不可行", message);
        showToast(message);
        return;
      }
    }
    showToast("这个落点不符合当前棋子的行棋规则。");
    return;
  }

  const epoch = animationEpoch;
  drums.setState(result.state, result.check, Boolean(result.captured));
  interactionLocked = true;
  availableMoves = [];
  renderMarkers();
  tactical.render();
  await animateMove(piece, to, result.captured);
  if (epoch !== animationEpoch) return;
  lastMove = { from: { x: piece.x, y: piece.y }, to: { ...to } };
  state = result.state;
  selectedId = null;
  renderPieces();
  interactionLocked = false;

  if (result.gameOver) {
    battleBanner.show({ kind: "victory", side: piece.side });
    showToast("决胜！");
    playAlertSound(true);
  } else if (result.check) {
    battleBanner.show({ kind: "check", side: piece.side });
    showToast("将军！");
    playAlertSound();
  } else if (result.captured) {
    battleBanner.show({ kind: "capture", side: piece.side, actor: piece.kind, target: result.captured.kind });
  }
  updateUI(
    result.check ? "主帅告急" : undefined,
    result.check ? "当前一方正被将军，请立即应对。" : undefined,
  );
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerDown = new THREE.Vector2();

canvas.addEventListener("pointerdown", (event) =>
  pointerDown.set(event.clientX, event.clientY),
);
canvas.addEventListener("pointerup", (event) => {
  clearTimeout(holdTimer);
  if (held) {
    held = false;
    return;
  }
  if (
    interactionLocked ||
    pointerDown.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 6
  )
    return;
  const bounds = canvas.getBoundingClientRect();
  pointer.set(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(
    [...pickables, ...markerLayer.children],
    true,
  )[0];
  if (!hit) {
    clearSelection();
    return;
  }

  let object: THREE.Object3D | null = hit.object;
  let pieceId: string | undefined;
  while (object && !pieceId) {
    pieceId = object.userData.pieceId as string | undefined;
    object = object.parent;
  }
  if (pieceId) {
    const piece = state.pieces.find((item) => item.id === pieceId);
    if (!piece) return;
    if (piece.side === state.turn) {
      selectPiece(piece);
      return;
    }
    if (selectedId) {
      void tryMove({ x: piece.x, y: piece.y });
      return;
    }
  }

  const markerMove = hit.object.userData.move as Position | undefined;
  if (markerMove) {
    void tryMove(markerMove);
    return;
  }
  if (
    hit.object.name === "board-hit-plane" ||
    hit.object.parent?.name === "board-hit-plane"
  ) {
    const grid = worldToGrid(hit.point);
    if (grid && selectedId) void tryMove(grid);
  }
});

function pointerStation(event: PointerEvent) {
  const box = canvas.getBoundingClientRect();
  pointer.set(
    ((event.clientX - box.left) / box.width) * 2 - 1,
    (-(event.clientY - box.top) / box.height) * 2 + 1,
  );
  camera.updateMatrixWorld(true);
  scene.updateMatrixWorld(true);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(
    [...pickables, ...markerLayer.children],
    true,
  )[0];
  if (!hit) return null;
  const move = hit.object.userData.move as Position | undefined;
  if (move) return move;
  const piece = state.pieces.find((p) => p.id === hit.object.userData.pieceId);
  return piece ? { x: piece.x, y: piece.y } : worldToGrid(hit.point);
}
let holdTimer = 0,
  held = false;
canvas.addEventListener("pointerdown", (e) => {
  document.querySelector("#music-status")!.textContent = "战鼓随战况渐强";
  drums.unlock();
  held = false;
  if (e.pointerType === "touch")
    holdTimer = window.setTimeout(() => {
      const at = pointerStation(e);
      if (at && availableMoves.some((p) => p.x === at.x && p.y === at.y)) {
        held = true;
        previewRoute(at);
      }
    }, 450);
});
canvas.addEventListener("pointermove", (e) => {
  if (e.buttons) {
    if (pointerDown.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) > 6) {
      clearTimeout(holdTimer);
      clearPreview();
    }
  } else if (e.pointerType === "mouse") previewRoute(pointerStation(e));
});
canvas.addEventListener("pointerleave", () => {
  clearTimeout(holdTimer);
  clearPreview();
});
canvas.addEventListener("pointercancel", () => {
  clearTimeout(holdTimer);
  clearPreview();
});
document.querySelector("#landscape-button")!.addEventListener("click", () => {
  overview = !overview;
  document.querySelector("#landscape-button")!.textContent = overview
    ? "返回棋盘近景"
    : "战场全景";
  resetView();
});

function resetGame() {
  battleBanner.clear();
  effectLayer.clear();
  drums.setState(initialState());
  animationEpoch++;
  battlefield.reset();
  clearPreview();
  lastMove = null;
  state = initialState();
  selectedId = null;
  availableMoves = [];
  interactionLocked = false;
  renderMarkers();
  renderPieces();
  updateUI("红方整军待发", "选择一枚红方棋子开始行军。");
  showToast("重新布阵");
}

function resetView() {
  cameraPan.clear();
  controls.enableDamping = false;
  controls.target.copy(frameCamera(camera, overview));
  controls.update();
  controls.enableDamping = true;
  if (scene.fog instanceof THREE.Fog) {
    scene.fog.near = camera.position.distanceTo(controls.target) + 2;
    scene.fog.far = scene.fog.near + 38;
  }
}

let musicEnabled = true;
document.querySelector("#music-button")!.addEventListener("click", () => {
  musicEnabled = !musicEnabled;
  drums.setEnabled(musicEnabled);
  const b = document.querySelector("#music-button")!;
  b.textContent = `战鼓：${musicEnabled ? "开启" : "关闭"}`;
  b.setAttribute("aria-pressed", String(musicEnabled));
});
document
  .querySelector("#music-volume")!
  .addEventListener("input", (e) =>
    drums.setVolume(Number((e.target as HTMLInputElement).value) / 100),
  );
document.addEventListener("visibilitychange", () => drums.visibility());
window.addEventListener("pagehide", () => drums.dispose());
resetButton.addEventListener("click", resetGame);
viewButton.addEventListener("click", () => {
  overview = false;
  document.querySelector("#landscape-button")!.textContent = "战场全景";
  resetView();
});
soundButton.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  soundButton.textContent = `音效：${soundEnabled ? "开启" : "关闭"}`;
  soundButton.setAttribute("aria-pressed", String(soundEnabled));
  if (soundEnabled) playSelectSound();
});
ambienceButton.addEventListener("click", () => {
  ambienceEnabled = !ambienceEnabled;
  ambienceButton.textContent = `风物：${ambienceEnabled ? "流动" : "静止"}`;
  ambienceButton.setAttribute("aria-pressed", String(ambienceEnabled));
  battlefield.update(performance.now(), reducedMotion.matches || !ambienceEnabled);
});

let framedWindowWidth = 0, framedWindowHeight = 0;
function resize() {
  const { clientWidth, clientHeight } = canvas;
  renderer.setSize(clientWidth, clientHeight, false);
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
  const windowChanged = framedWindowWidth !== window.innerWidth || framedWindowHeight !== window.innerHeight;
  if (!interactionLocked && windowChanged) resetView();
  framedWindowWidth = window.innerWidth;
  framedWindowHeight = window.innerHeight;
}

const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(canvas);

addBoard();
const battlefield = createBattlefield(world);
const fileNames = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
for (const y of [0, 9])
  for (let x = 0; x < 9; x++) {
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.45, 0.45),
      new THREE.MeshBasicMaterial({
        map: textTexture(
          fileNames[y === 9 ? 8 - x : x],
          "#d9d9bb",
          "bold 84px serif",
        ),
        transparent: true,
        depthWrite: false,
      }),
    );
    label.name = "file-index";
    label.rotation.x = -Math.PI / 2;
    label.position.copy(gridToWorld({ x, y }));
    label.position.z += y === 0 ? -0.7 : 0.7;
    label.position.y = GROUND + 0.035;
    world.add(label);
  }

renderPieces();
updateUI();
resetView();

let previousRenderTime: number | undefined;
renderer.setAnimationLoop((time) => {
  cameraPan.update(previousRenderTime === undefined ? 0 : (time - previousRenderTime) / 1000);
  previousRenderTime = time;
  battlefield.update(time, reducedMotion.matches || !ambienceEnabled);
  for (const group of pieceGroups.values()) {
    updateTroopDetails(group.userData.detailsRig as TroopDetailsRig, {
      time: time / 1000,
      moving: group.userData.marchMotion === "walking",
      pace: group.userData.pace === "run" ? "run" : "walk",
      reduced: reducedMotion.matches || !ambienceEnabled,
      attackProgress: group.userData.combatPhase === "attacking" ? Number(group.userData.combatProgress) : 0,
    });
  }
  controls.update();
  renderer.render(scene, camera);
});
