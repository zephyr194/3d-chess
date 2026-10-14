import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './styles.css';
import {
  applyMove,
  initialState,
  legalMoves,
  pieceAt,
  pieceLabels,
  type GameState,
  type Piece,
  type PieceKind,
  type Position,
  type Side,
} from './game/xiangqi';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')!;
const turnPill = document.querySelector<HTMLDivElement>('#turn-pill')!;
const turnText = turnPill.querySelector('strong')!;
const statusTitle = document.querySelector<HTMLHeadingElement>('#status-title')!;
const statusDetail = document.querySelector<HTMLParagraphElement>('#status-detail')!;
const speedSelect = document.querySelector<HTMLSelectElement>('#speed-select')!;
const soundButton = document.querySelector<HTMLButtonElement>('#sound-button')!;
const resetButton = document.querySelector<HTMLButtonElement>('#reset-button')!;
const viewButton = document.querySelector<HTMLButtonElement>('#view-button')!;
const battleToast = document.querySelector<HTMLDivElement>('#battle-toast')!;
const viewportWrap = document.querySelector<HTMLDivElement>('.viewport-wrap')!;

const SPACING = 1.34;
const TERRAIN_BASE_Y = 0.54;
const PIECE_GROUND_OFFSET = 0.035;
const RED = new THREE.Color('#d83b2f');
const BLACK = new THREE.Color('#24343b');
const textureLoader = new THREE.TextureLoader();
const boardTexture = textureLoader.load('/assets/cartoon-chu-han-landscape-board-v2.png');
boardTexture.colorSpace = THREE.SRGBColorSpace;
boardTexture.wrapS = THREE.ClampToEdgeWrapping;
boardTexture.wrapT = THREE.ClampToEdgeWrapping;

let state: GameState = initialState();
let selectedId: string | null = null;
let availableMoves: Position[] = [];
let interactionLocked = false;
let soundEnabled = true;
let audioContext: AudioContext | null = null;

function getAudioContext() {
  if (!soundEnabled) return null;
  audioContext ??= new AudioContext();
  if (audioContext.state === 'suspended') void audioContext.resume();
  return audioContext;
}

function playTone(startFrequency: number, endFrequency: number, duration: number, type: OscillatorType, volume: number, delay = 0) {
  const context = getAudioContext();
  if (!context) return;
  const started = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(startFrequency, started);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), started + duration);
  gain.gain.setValueAtTime(.001, started);
  gain.gain.exponentialRampToValueAtTime(volume, started + .012);
  gain.gain.exponentialRampToValueAtTime(.001, started + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(started);
  oscillator.stop(started + duration + .02);
}

function playNoise(duration: number, volume: number, cutoff: number, delay = 0) {
  const context = getAudioContext();
  if (!context) return;
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    const decay = 1 - index / data.length;
    data[index] = (Math.random() * 2 - 1) * decay;
  }
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = buffer;
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  gain.gain.value = volume;
  source.connect(filter).connect(gain).connect(context.destination);
  source.start(context.currentTime + delay);
}

function playSelectSound() {
  playTone(420, 610, .11, 'sine', .085);
  playTone(760, 910, .08, 'triangle', .04, .035);
}

function playStepSound(kind: PieceKind, step: number) {
  switch (kind) {
    case 'horse':
      playTone(step % 2 ? 190 : 235, 88, .09, 'triangle', .09);
      playNoise(.07, .055, 820);
      break;
    case 'chariot':
      playTone(step % 2 ? 105 : 86, 48, .12, 'sawtooth', .07);
      playNoise(.08, .04, 520);
      break;
    case 'cannon':
      playTone(step % 2 ? 84 : 102, 56, .1, 'square', .055);
      playNoise(.06, .035, 460);
      break;
    case 'elephant':
      playTone(82, 35, .16, 'sine', .13);
      playNoise(.12, .06, 320);
      break;
    case 'general':
      playTone(180, 108, .08, 'triangle', .06);
      playTone(520, 380, .07, 'sine', .035, .02);
      break;
    case 'advisor':
      playTone(560, 720, .09, 'sine', .052);
      break;
    default:
      playTone(step % 2 ? 245 : 285, 128, .06, 'triangle', .065);
      playNoise(.04, .025, 1100);
  }
}

function playCannonSound() {
  playTone(118, 30, .52, 'sine', .3);
  playTone(230, 48, .28, 'sawtooth', .13);
  playNoise(.46, .25, 720);
}

function playImpactSound(attacker: PieceKind, defender: PieceKind) {
  const armorCutoff = defender === 'chariot' || defender === 'cannon' ? 1900 : 1100;
  switch (attacker) {
    case 'soldier':
      playTone(920, 280, .16, 'square', .105);
      playNoise(.16, .12, armorCutoff);
      playTone(260, 150, .12, 'triangle', .07, .035);
      break;
    case 'horse':
      playTone(470, 145, .26, 'sawtooth', .13);
      playTone(125, 48, .28, 'sine', .17, .025);
      playNoise(.2, .13, 1250);
      break;
    case 'chariot':
      playTone(112, 28, .44, 'sawtooth', .23);
      playNoise(.34, .22, 780);
      playTone(680, 120, .19, 'square', .08, .025);
      break;
    case 'cannon':
      playTone(96, 24, .62, 'sine', .3);
      playNoise(.48, .28, 960);
      playTone(320, 52, .32, 'sawtooth', .15, .018);
      break;
    case 'elephant':
      playTone(74, 24, .55, 'sine', .28);
      playNoise(.36, .2, 410);
      playTone(150, 42, .28, 'triangle', .1, .03);
      break;
    case 'general':
      playTone(1120, 220, .24, 'square', .12);
      playTone(210, 72, .4, 'sine', .2, .035);
      playNoise(.18, .12, 2100);
      break;
    case 'advisor':
      playTone(760, 1480, .3, 'sine', .11);
      playTone(1140, 570, .34, 'triangle', .09, .06);
      playNoise(.14, .07, 2400);
  }
}

function playAlertSound(victory = false) {
  playTone(victory ? 220 : 175, victory ? 440 : 125, .42, 'triangle', .09);
  playTone(victory ? 330 : 260, victory ? 660 : 190, .5, 'sine', .055, .11);
}

const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#a7d7d7', 19, 39);

const camera = new THREE.PerspectiveCamera(41, 1, 0.1, 100);
camera.position.set(8.6, 11.4, 12.5);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 7.2;
controls.maxDistance = 25;
controls.maxPolarAngle = Math.PI * 0.47;
controls.target.set(0, 0.5, 0);

scene.add(new THREE.HemisphereLight('#fff6dd', '#173c3b', 2.3));
const sun = new THREE.DirectionalLight('#fff0c5', 4.4);
sun.position.set(-9, 17, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -12;
sun.shadow.camera.right = 12;
sun.shadow.camera.top = 14;
sun.shadow.camera.bottom = -14;
scene.add(sun);

const world = new THREE.Group();
const pieceLayer = new THREE.Group();
const markerLayer = new THREE.Group();
const effectLayer = new THREE.Group();
scene.add(world);
world.add(pieceLayer, markerLayer, effectLayer);

const pieceGroups = new Map<string, THREE.Group>();
const pickables: THREE.Object3D[] = [];

function terrainHeightAtWorld(x: number, z: number) {
  const riverBed = -.24 * Math.exp(-(z * z) / .72);
  const rollingGround = Math.sin(x * .65 + z * .21) * .085 + Math.cos(z * .52 - x * .18) * .06;
  const northSouthRidges = Math.pow(Math.min(1, Math.abs(z) / 6.15), 3.2) * .46;
  const sideRidges = Math.pow(Math.min(1, Math.abs(x) / 5.45), 4.8) * .2;
  return TERRAIN_BASE_Y + riverBed + rollingGround + northSouthRidges + sideRidges;
}

function gridToWorld(position: Position) {
  const x = (position.x - 4) * SPACING;
  const z = (position.y - 4.5) * SPACING;
  return new THREE.Vector3(x, terrainHeightAtWorld(x, z) + PIECE_GROUND_OFFSET, z);
}

function worldToGrid(point: THREE.Vector3): Position | null {
  const x = Math.round(point.x / SPACING + 4);
  const y = Math.round(point.z / SPACING + 4.5);
  if (x < 0 || x > 8 || y < 0 || y > 9) return null;
  return { x, y };
}

function roundedBox(width: number, height: number, depth: number, radius: number, color: string) {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -depth / 2;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + depth - radius);
  shape.quadraticCurveTo(x + width, y + depth, x + width - radius, y + depth);
  shape.lineTo(x + radius, y + depth);
  shape.quadraticCurveTo(x, y + depth, x, y + depth - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: true, bevelSize: .06, bevelThickness: .06, bevelSegments: 2 });
  geometry.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .72, metalness: .02 }));
  mesh.position.y = height / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addBoard() {
  const board = roundedBox(12.6, .48, 14.1, .42, '#e3ad64');
  board.position.y = -.02;
  world.add(board);

  const terrainGeometry = new THREE.PlaneGeometry(12.18, 13.68, 72, 82);
  terrainGeometry.rotateX(-Math.PI / 2);
  const terrainPositions = terrainGeometry.attributes.position;
  for (let index = 0; index < terrainPositions.count; index += 1) {
    const x = terrainPositions.getX(index);
    const z = terrainPositions.getZ(index);
    terrainPositions.setY(index, terrainHeightAtWorld(x, z));
  }
  terrainPositions.needsUpdate = true;
  terrainGeometry.computeVertexNormals();
  const texturedSurface = new THREE.Mesh(
    terrainGeometry,
    new THREE.MeshStandardMaterial({ map: boardTexture, color: '#fff8e5', roughness: .84, metalness: 0 }),
  );
  texturedSurface.name = 'board-hit-plane';
  texturedSurface.receiveShadow = true;
  world.add(texturedSurface);
  pickables.push(texturedSurface);

  const underBoard = roundedBox(13.35, .36, 14.85, .55, '#855238');
  underBoard.position.y = -.3;
  world.add(underBoard);

  const lineMaterial = new THREE.LineBasicMaterial({ color: '#704125', transparent: true, opacity: .88 });
  const line = (a: Position, b: Position) => {
    const ga = gridToWorld(a);
    const gb = gridToWorld(b);
    const samples = Array.from({ length: 25 }, (_, index) => {
      const point = ga.clone().lerp(gb, index / 24);
      point.y = terrainHeightAtWorld(point.x, point.z) + .045;
      return point;
    });
    const geometry = new THREE.BufferGeometry().setFromPoints(samples);
    world.add(new THREE.Line(geometry, lineMaterial));
  };

  for (let y = 0; y <= 9; y += 1) line({ x: 0, y }, { x: 8, y });
  for (let x = 0; x <= 8; x += 1) {
    if (x === 0 || x === 8) line({ x, y: 0 }, { x, y: 9 });
    else {
      line({ x, y: 0 }, { x, y: 4 });
      line({ x, y: 5 }, { x, y: 9 });
    }
  }
  line({ x: 3, y: 0 }, { x: 5, y: 2 });
  line({ x: 5, y: 0 }, { x: 3, y: 2 });
  line({ x: 3, y: 7 }, { x: 5, y: 9 });
  line({ x: 5, y: 7 }, { x: 3, y: 9 });

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(26, 64),
    new THREE.MeshStandardMaterial({ color: '#66a87b', roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -.55;
  ground.receiveShadow = true;
  world.add(ground);

  for (let i = 0; i < 22; i += 1) {
    const stone = new THREE.Mesh(
      new THREE.DodecahedronGeometry(.22 + Math.random() * .34, 0),
      new THREE.MeshStandardMaterial({ color: i % 3 === 0 ? '#487863' : '#5d8c66', roughness: 1, flatShading: true }),
    );
    const angle = (i / 22) * Math.PI * 2;
    const radius = 9 + Math.random() * 7;
    stone.position.set(Math.cos(angle) * radius, -.35, Math.sin(angle) * radius);
    stone.scale.y = 1.5 + Math.random();
    stone.rotation.set(Math.random(), Math.random(), Math.random());
    stone.castShadow = true;
    world.add(stone);
  }

}

function textTexture(text: string, color: string, font: string, width = 128, height = 128) {
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = width;
  labelCanvas.height = height;
  const context = labelCanvas.getContext('2d')!;
  context.clearRect(0, 0, width, height);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = font;
  context.fillStyle = color;
  context.fillText(text, width / 2, height / 2 + 2);
  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

const redTroopMaterial = new THREE.MeshStandardMaterial({ color: '#db3d31', roughness: .58, flatShading: true });
const blackTroopMaterial = new THREE.MeshStandardMaterial({ color: '#243a40', roughness: .58, flatShading: true });
const creamMaterial = new THREE.MeshStandardMaterial({ color: '#f7ddb0', roughness: .72, flatShading: true });
const goldMaterial = new THREE.MeshStandardMaterial({ color: '#f4b94f', roughness: .46, metalness: .12, flatShading: true });
const woodMaterial = new THREE.MeshStandardMaterial({ color: '#78462f', roughness: .8, flatShading: true });
const steelMaterial = new THREE.MeshStandardMaterial({ color: '#607278', roughness: .46, metalness: .35, flatShading: true });

function troopMaterial(side: Side) { return side === 'red' ? redTroopMaterial : blackTroopMaterial; }

function modelMesh(geometry: THREE.BufferGeometry, material: THREE.Material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addHumanoid(group: THREE.Group, side: Side, height = 1) {
  const torso = modelMesh(new THREE.CylinderGeometry(.22, .32, .55 * height, 8), troopMaterial(side));
  torso.position.y = .64;
  const head = modelMesh(new THREE.SphereGeometry(.19, 10, 7), creamMaterial);
  head.position.y = .99 + (height - 1) * .25;
  const belt = modelMesh(new THREE.TorusGeometry(.255, .045, 6, 16), goldMaterial);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = .52;
  group.add(torso, head, belt);
}

function addFlag(group: THREE.Group, side: Side, x = .31, tall = false) {
  const pole = modelMesh(new THREE.CylinderGeometry(.025, .025, tall ? 1.35 : 1.05, 6), woodMaterial);
  pole.position.set(x, tall ? .98 : .83, .03);
  const cloth = modelMesh(new THREE.BoxGeometry(.34, .25, .035), troopMaterial(side));
  cloth.position.set(x - .16, tall ? 1.46 : 1.18, .03);
  const tip = modelMesh(new THREE.ConeGeometry(.07, .17, 5), goldMaterial);
  tip.position.set(x, tall ? 1.73 : 1.45, .03);
  group.add(pole, cloth, tip);
}

function createTroopModel(kind: PieceKind, side: Side) {
  const model = new THREE.Group();
  const wheels: THREE.Mesh[] = [];

  if (kind === 'general') {
    addHumanoid(model, side, 1.2);
    [-1, 1].forEach((direction) => {
      const shoulder = modelMesh(new THREE.SphereGeometry(.15, 8, 6), goldMaterial);
      shoulder.position.set(direction * .31, .86, 0);
      model.add(shoulder);
    });
    const crown = modelMesh(new THREE.ConeGeometry(.25, .34, 5), goldMaterial);
    crown.position.y = 1.36;
    model.add(crown);
    addFlag(model, side, .39, true);
  }

  if (kind === 'advisor') {
    addHumanoid(model, side, 1.08);
    const hat = modelMesh(new THREE.CylinderGeometry(.28, .18, .18, 6), blackTroopMaterial);
    hat.position.y = 1.23;
    const tablet = modelMesh(new THREE.BoxGeometry(.28, .5, .08), goldMaterial);
    tablet.position.set(0, .7, -.29);
    tablet.rotation.x = -.18;
    const gem = modelMesh(new THREE.OctahedronGeometry(.13), creamMaterial);
    gem.position.set(0, 1.37, 0);
    model.add(hat, tablet, gem);
  }

  if (kind === 'elephant') {
    const body = modelMesh(new THREE.SphereGeometry(.43, 12, 8), troopMaterial(side));
    body.scale.set(1.05, .72, 1.22);
    body.position.y = .68;
    const head = modelMesh(new THREE.SphereGeometry(.28, 10, 7), creamMaterial);
    head.position.set(0, .78, -.43);
    [-1, 1].forEach((direction) => {
      const ear = modelMesh(new THREE.SphereGeometry(.21, 9, 6), goldMaterial);
      ear.scale.set(.35, 1, .8);
      ear.position.set(direction * .25, .82, -.39);
      const leg = modelMesh(new THREE.CylinderGeometry(.09, .11, .38, 7), troopMaterial(side));
      leg.position.set(direction * .24, .35, -.18);
      model.add(ear, leg);
    });
    const trunk = modelMesh(new THREE.CylinderGeometry(.075, .11, .5, 7), creamMaterial);
    trunk.rotation.x = Math.PI / 2.65;
    trunk.position.set(0, .59, -.67);
    model.add(body, head, trunk);
  }

  if (kind === 'horse') {
    const body = modelMesh(new THREE.SphereGeometry(.36, 10, 7), troopMaterial(side));
    body.scale.set(.72, .72, 1.24);
    body.position.y = .66;
    const neck = modelMesh(new THREE.CylinderGeometry(.14, .22, .54, 7), troopMaterial(side));
    neck.rotation.x = -.55;
    neck.position.set(0, .88, -.31);
    const head = modelMesh(new THREE.SphereGeometry(.2, 9, 6), creamMaterial);
    head.scale.set(.78, .86, 1.2);
    head.position.set(0, 1.12, -.49);
    model.add(body, neck, head);
    [-1, 1].forEach((direction) => {
      const leg = modelMesh(new THREE.CylinderGeometry(.055, .075, .47, 6), woodMaterial);
      leg.position.set(direction * .19, .34, direction > 0 ? .2 : -.2);
      const ear = modelMesh(new THREE.ConeGeometry(.055, .2, 5), woodMaterial);
      ear.position.set(direction * .08, 1.34, -.49);
      model.add(leg, ear);
    });
  }

  if (kind === 'chariot') {
    const carriage = modelMesh(new THREE.BoxGeometry(.68, .38, .72), troopMaterial(side));
    carriage.position.y = .62;
    const roof = modelMesh(new THREE.ConeGeometry(.48, .3, 4), goldMaterial);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = .99;
    model.add(carriage, roof);
    [-1, 1].forEach((x) => [-1, 1].forEach((z) => {
      const wheel = modelMesh(new THREE.CylinderGeometry(.18, .18, .11, 12), woodMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x * .4, .36, z * .24);
      wheels.push(wheel);
      model.add(wheel);
    }));
    addFlag(model, side, .22, false);
  }

  if (kind === 'cannon') {
    const cradle = modelMesh(new THREE.BoxGeometry(.65, .18, .58), troopMaterial(side));
    cradle.position.y = .43;
    const barrel = modelMesh(new THREE.CylinderGeometry(.11, .18, .92, 12), steelMaterial);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, .67, -.12);
    const muzzle = modelMesh(new THREE.TorusGeometry(.18, .04, 8, 14), goldMaterial);
    muzzle.position.set(0, .67, -.58);
    model.add(cradle, barrel, muzzle);
    [-1, 1].forEach((direction) => {
      const wheel = modelMesh(new THREE.CylinderGeometry(.23, .23, .12, 12), woodMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(direction * .39, .36, .03);
      wheels.push(wheel);
      model.add(wheel);
    });
  }

  if (kind === 'soldier') {
    addHumanoid(model, side, .88);
    const helmet = modelMesh(new THREE.SphereGeometry(.23, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), goldMaterial);
    helmet.position.y = 1.12;
    const spear = modelMesh(new THREE.CylinderGeometry(.025, .025, 1.2, 6), woodMaterial);
    spear.position.set(.3, .9, -.02);
    const spearTip = modelMesh(new THREE.ConeGeometry(.075, .22, 5), steelMaterial);
    spearTip.position.set(.3, 1.58, -.02);
    model.add(helmet, spear, spearTip);
  }

  if (side === 'black') model.rotation.y = Math.PI;
  model.userData.wheels = wheels;
  return model;
}

function createPiece(piece: Piece) {
  const group = new THREE.Group();
  group.userData.pieceId = piece.id;
  group.userData.kind = piece.kind;
  group.userData.side = piece.side;

  const sideColor = piece.side === 'red' ? RED : BLACK;
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(.51, .58, .2, 18),
    new THREE.MeshStandardMaterial({ color: sideColor, roughness: .52, metalness: .04, flatShading: true }),
  );
  base.position.y = .1;
  base.castShadow = true;
  base.receiveShadow = true;

  const label = new THREE.Mesh(
    new THREE.CircleGeometry(.24, 32),
    new THREE.MeshBasicMaterial({ map: textTexture(pieceLabels[piece.side][piece.kind], piece.side === 'red' ? '#a92321' : '#1f3034', '900 72px serif') }),
  );
  label.rotation.x = -Math.PI / 2;
  label.position.y = .205;

  const rim = modelMesh(new THREE.TorusGeometry(.48, .035, 8, 24), goldMaterial);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = .21;

  const troop = createTroopModel(piece.kind, piece.side);
  troop.position.y = .17;
  group.userData.wheels = troop.userData.wheels;
  group.userData.modelBaseYaw = piece.side === 'black' ? Math.PI : 0;

  group.add(base, label, rim, troop);
  group.position.copy(gridToWorld(piece));
  group.scale.setScalar(.82);
  group.traverse((child) => { child.userData.pieceId = piece.id; });
  pickables.push(...group.children);
  pieceGroups.set(piece.id, group);
  pieceLayer.add(group);
  return group;
}

function renderPieces() {
  while (pieceLayer.children.length) pieceLayer.remove(pieceLayer.children[0]);
  pieceGroups.clear();
  pickables.splice(1);
  state.pieces.forEach(createPiece);
}

function renderMarkers() {
  markerLayer.clear();
  availableMoves.forEach((move) => {
    const occupied = pieceAt(state, move);
    const marker = new THREE.Mesh(
      occupied ? new THREE.TorusGeometry(.32, .075, 12, 32) : new THREE.CylinderGeometry(.14, .2, .07, 16),
      new THREE.MeshStandardMaterial({ color: occupied ? '#ffcf66' : '#57e59b', emissive: occupied ? '#6f3d00' : '#0a6c40', emissiveIntensity: 1.4 }),
    );
    marker.position.copy(gridToWorld(move));
    marker.position.y += .1;
    if (occupied) marker.rotation.x = Math.PI / 2;
    marker.userData.move = move;
    markerLayer.add(marker);
    pickables.push(marker);
  });
}

function updateUI(title?: string, detail?: string) {
  const sideName = state.turn === 'red' ? '红方' : '黑方';
  turnPill.classList.toggle('black', state.turn === 'black');
  turnText.textContent = state.winner ? `${state.winner === 'red' ? '红方' : '黑方'}获胜` : `${sideName}行军`;
  if (state.winner) {
    statusTitle.textContent = `${state.winner === 'red' ? '红方' : '黑方'}凯旋`;
    statusDetail.textContent = '主帅已经取得胜利。可以重新布阵再战一局。';
    return;
  }
  if (title) statusTitle.textContent = title;
  else statusTitle.textContent = selectedId ? '选择落点' : `${sideName}整军待发`;
  if (detail) statusDetail.textContent = detail;
  else statusDetail.textContent = selectedId ? '发光标记表示当前棋子的合法移动位置。' : `选择一枚${sideName}棋子开始行军。`;
}

function showToast(message: string) {
  battleToast.textContent = message;
  battleToast.classList.add('show');
  window.setTimeout(() => battleToast.classList.remove('show'), 1200);
}

function selectPiece(piece: Piece) {
  playSelectSound();
  selectedId = piece.id;
  availableMoves = legalMoves(state, piece);
  pieceGroups.forEach((group, id) => group.scale.setScalar(id === piece.id ? .98 : .82));
  renderMarkers();
  updateUI(`${pieceLabels[piece.side][piece.kind]}已列阵`, `共有 ${availableMoves.length} 个合法落点。`);
}

function clearSelection() {
  selectedId = null;
  availableMoves = [];
  pieceGroups.forEach((group) => group.scale.setScalar(.82));
  renderMarkers();
  updateUI();
}

function easeInOut(value: number) { return value < .5 ? 2 * value * value : 1 - Math.pow(-2 * value + 2, 2) / 2; }

function createDustPuff(position: THREE.Vector3, strength = 1) {
  const material = new THREE.MeshStandardMaterial({ color: '#d7b77c', transparent: true, opacity: .5, roughness: 1 });
  const puff = modelMesh(new THREE.SphereGeometry(.13 * strength, 7, 5), material);
  puff.position.copy(position);
  puff.position.y = terrainHeightAtWorld(position.x, position.z) + .08;
  puff.scale.set(1.4, .45, 1);
  effectLayer.add(puff);
  const started = performance.now();
  const tick = (time: number) => {
    const progress = Math.min(1, (time - started) / 420);
    puff.position.y += .0025;
    puff.scale.multiplyScalar(1.018);
    material.opacity = .5 * (1 - progress);
    if (progress < 1) requestAnimationFrame(tick);
    else effectLayer.remove(puff);
  };
  requestAnimationFrame(tick);
}

function createAttackSignature(position: THREE.Vector3, attacker: PieceKind) {
  const root = new THREE.Group();
  const baseY = terrainHeightAtWorld(position.x, position.z) + .2;
  root.position.set(position.x, baseY, position.z);
  const animatedMaterials: THREE.MeshBasicMaterial[] = [];
  const effectMaterial = (color: string, opacity = .92) => {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
    animatedMaterials.push(material);
    return material;
  };
  let duration = 620;
  let rise = .3;
  let spin = .08;

  if (attacker === 'soldier') {
    const slashMaterial = effectMaterial('#f7f1c6');
    [-1, 1].forEach((direction) => {
      const slash = new THREE.Mesh(new THREE.BoxGeometry(.075, .055, 1.75), slashMaterial);
      slash.position.y = .48;
      slash.rotation.set(direction * .58, direction * .72, direction * .45);
      root.add(slash);
    });
    const spearTip = new THREE.Mesh(new THREE.ConeGeometry(.16, .6, 5), effectMaterial('#ffd25d'));
    spearTip.rotation.x = Math.PI / 2;
    spearTip.position.set(0, .48, -.46);
    root.add(spearTip);
    spin = .02;
  } else if (attacker === 'horse') {
    for (let index = 0; index < 5; index += 1) {
      const streak = new THREE.Mesh(new THREE.ConeGeometry(.08, 1.4 + index * .12, 5), effectMaterial(index % 2 ? '#fff1b0' : '#e68b3e'));
      streak.rotation.x = Math.PI / 2;
      streak.position.set((index - 2) * .18, .32 + Math.abs(index - 2) * .08, .22);
      root.add(streak);
    }
    duration = 700;
    spin = .018;
  } else if (attacker === 'chariot') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.42, .11, 8, 28), effectMaterial('#ffd062'));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = .14;
    root.add(ring);
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      const ram = new THREE.Mesh(new THREE.BoxGeometry(.18, .18, .72), effectMaterial(index % 2 ? '#a65d37' : '#f3bd51'));
      ram.position.set(Math.cos(angle) * .42, .35, Math.sin(angle) * .42);
      ram.rotation.y = -angle;
      root.add(ram);
    }
    duration = 760;
    rise = .12;
    spin = .11;
  } else if (attacker === 'cannon') {
    for (let index = 0; index < 13; index += 1) {
      const isSmoke = index > 6;
      const fireball = new THREE.Mesh(
        new THREE.IcosahedronGeometry(isSmoke ? .22 : .18, 1),
        effectMaterial(isSmoke ? '#465158' : index % 2 ? '#ffdb57' : '#ff5a20', isSmoke ? .72 : .98),
      );
      const angle = index * 2.399;
      const radius = .18 + (index % 4) * .13;
      fireball.position.set(Math.cos(angle) * radius, .28 + (index % 5) * .15, Math.sin(angle) * radius);
      root.add(fireball);
    }
    duration = 900;
    rise = .65;
    spin = .04;
  } else if (attacker === 'elephant') {
    [0, 1, 2].forEach((index) => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(.24 + index * .18, .32 + index * .2, 24), effectMaterial(index === 0 ? '#fff0a0' : '#b17842'));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = .035 + index * .035;
      root.add(ring);
    });
    for (let index = 0; index < 7; index += 1) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(.1 + (index % 3) * .035, 0), effectMaterial('#745338'));
      const angle = (index / 7) * Math.PI * 2;
      rock.position.set(Math.cos(angle) * .52, .22 + (index % 2) * .18, Math.sin(angle) * .52);
      root.add(rock);
    }
    duration = 820;
    rise = .22;
    spin = .035;
  } else if (attacker === 'general') {
    [-1, 1].forEach((direction) => {
      const arc = new THREE.Mesh(new THREE.RingGeometry(.46, .58, 28, 1, 0, Math.PI * 1.25), effectMaterial(direction > 0 ? '#ffe788' : '#ff8a46'));
      arc.rotation.set(0, direction * .75, direction * .68);
      arc.position.y = .48;
      root.add(arc);
    });
    const crown = new THREE.Mesh(new THREE.OctahedronGeometry(.25), effectMaterial('#fff3b0'));
    crown.position.y = .72;
    root.add(crown);
    duration = 720;
    spin = .12;
  } else {
    const seal = new THREE.Mesh(new THREE.OctahedronGeometry(.48), effectMaterial('#87f1dc'));
    seal.position.y = .45;
    root.add(seal);
    for (let index = 0; index < 6; index += 1) {
      const rune = new THREE.Mesh(new THREE.TorusGeometry(.12, .035, 6, 16), effectMaterial('#d8fff2'));
      const angle = (index / 6) * Math.PI * 2;
      rune.position.set(Math.cos(angle) * .68, .38, Math.sin(angle) * .68);
      rune.rotation.x = Math.PI / 2;
      root.add(rune);
    }
    duration = 860;
    rise = .55;
    spin = .16;
  }

  effectLayer.add(root);
  const started = performance.now();
  const initialScales = root.children.map((child) => child.scale.clone());
  const tick = (time: number) => {
    const progress = Math.min(1, (time - started) / duration);
    const burst = Math.sin(Math.min(1, progress * 1.65) * Math.PI * .5);
    root.rotation.y += spin;
    root.position.y = baseY + progress * rise;
    root.children.forEach((child, index) => {
      const scale = initialScales[index];
      child.scale.copy(scale).multiplyScalar(.5 + burst * (attacker === 'cannon' ? 2.4 : 1.65));
      child.rotation.z += spin * .42;
    });
    animatedMaterials.forEach((material) => { material.opacity *= .91 + (1 - progress) * .09; });
    if (progress < 1) requestAnimationFrame(tick);
    else effectLayer.remove(root);
  };
  requestAnimationFrame(tick);
}

function createImpact(position: THREE.Vector3, attacker: PieceKind, defender: PieceKind) {
  playImpactSound(attacker, defender);
  createAttackSignature(position, attacker);
  viewportWrap.classList.remove('impact');
  void viewportWrap.offsetWidth;
  viewportWrap.classList.add('impact');
  window.setTimeout(() => viewportWrap.classList.remove('impact'), 340);

  const material = new THREE.MeshBasicMaterial({ color: '#ffd36a', transparent: true, opacity: .9, side: THREE.DoubleSide });
  const flash = new THREE.Mesh(new THREE.RingGeometry(.12, .28, 12), material);
  flash.rotation.x = -Math.PI / 2;
  flash.position.copy(position);
  flash.position.y = terrainHeightAtWorld(position.x, position.z) + .22;
  const burst = new THREE.Group();
  burst.add(flash);
  const shards: Array<{ mesh: THREE.Mesh; velocity: THREE.Vector3 }> = [];
  for (let index = 0; index < 10; index += 1) {
    const angle = (index / 10) * Math.PI * 2;
    const shard = modelMesh(new THREE.BoxGeometry(.08, .08, .2), index % 2 ? goldMaterial : steelMaterial);
    shard.position.copy(position);
    shard.position.y = terrainHeightAtWorld(position.x, position.z) + .3;
    burst.add(shard);
    shards.push({
      mesh: shard,
      velocity: new THREE.Vector3(Math.cos(angle) * .018, .018 + Math.random() * .012, Math.sin(angle) * .018),
    });
  }
  effectLayer.add(burst);
  const started = performance.now();
  const tick = (time: number) => {
    const progress = Math.min(1, (time - started) / 320);
    flash.scale.setScalar(1 + progress * 3.5);
    material.opacity = .9 * (1 - progress);
    shards.forEach(({ mesh, velocity }) => {
      mesh.position.add(velocity);
      velocity.y -= .0014;
      mesh.rotation.x += .18;
      mesh.rotation.z += .13;
      mesh.scale.setScalar(1 - progress * .65);
    });
    if (progress < 1) requestAnimationFrame(tick);
    else effectLayer.remove(burst);
  };
  requestAnimationFrame(tick);
}

function movementBounce(kind: PieceKind, progress: number, steps: number) {
  const cadence = Math.abs(Math.sin(progress * Math.PI * steps));
  if (kind === 'horse') return .08 + cadence * .22;
  if (kind === 'soldier') return .025 + cadence * .13;
  if (kind === 'elephant') return .02 + cadence * .07;
  if (kind === 'general' || kind === 'advisor') return cadence * .045;
  return cadence * .025;
}

function animateCannonShot(from: THREE.Vector3, to: THREE.Vector3, duration: number) {
  return new Promise<void>((resolve) => {
    playCannonSound();
    const projectile = new THREE.Mesh(
      new THREE.SphereGeometry(.15, 10, 8),
      new THREE.MeshStandardMaterial({ color: '#fff09b', emissive: '#ff7100', emissiveIntensity: 3 }),
    );
    projectile.position.copy(from).add(new THREE.Vector3(0, .75, 0));
    scene.add(projectile);
    const start = performance.now();
    const tick = (time: number) => {
      const progress = Math.min(1, (time - start) / duration);
      projectile.position.lerpVectors(from, to, progress);
      projectile.position.y += .8 + Math.sin(progress * Math.PI) * 1.9;
      projectile.scale.setScalar(1 + Math.sin(progress * Math.PI) * 1.2);
      if (progress < 1) requestAnimationFrame(tick);
      else { scene.remove(projectile); resolve(); }
    };
    requestAnimationFrame(tick);
  });
}

async function animateMove(piece: Piece, to: Position, captured: Piece | null) {
  const group = pieceGroups.get(piece.id)!;
  const capturedGroup = captured ? pieceGroups.get(captured.id) : null;
  const startPosition = group.position.clone();
  const endPosition = gridToWorld(to);
  const speed = Number(speedSelect.value);
  const gridDistance = Math.max(1, Math.hypot(to.x - piece.x, to.y - piece.y));
  const duration = (520 + gridDistance * 145 + (captured ? 430 : 0)) / speed;
  const steps = Math.max(2, Math.ceil(gridDistance * (piece.kind === 'soldier' ? 3 : 2)));
  const direction = endPosition.clone().sub(startPosition);
  const strikeDirection = direction.clone().normalize();
  const approachPosition = endPosition.clone().addScaledVector(strikeDirection, -.68);
  const recoilPosition = endPosition.clone().addScaledVector(strikeDirection, .48);
  const destinationYaw = Math.atan2(direction.x, direction.z) + Math.PI - Number(group.userData.modelBaseYaw ?? 0);
  const startingYaw = group.rotation.y;
  const previousTarget = controls.target.clone();
  const actionFocus = startPosition.clone().lerp(endPosition, .5);
  actionFocus.y = .25;
  const wheels = (group.userData.wheels ?? []) as THREE.Mesh[];

  if (piece.kind === 'cannon' && captured) {
    showToast('炮火开阵！');
    await animateCannonShot(startPosition, endPosition, 430 / speed);
  }

  await new Promise<void>((resolve) => {
    const start = performance.now();
    let dustStep = -1;
    let impactFired = false;
    const tick = (time: number) => {
      const progress = Math.min(1, (time - start) / duration);
      const preparation = Math.min(1, progress / .14);
      const travel = Math.max(0, Math.min(1, (progress - .1) / .9));
      group.rotation.y = THREE.MathUtils.lerp(startingYaw, destinationYaw, easeInOut(preparation));

      if (captured) {
        if (travel < .67) {
          group.position.lerpVectors(startPosition, approachPosition, easeInOut(travel / .67));
        } else if (travel < .78) {
          const anticipation = easeInOut((travel - .67) / .11);
          group.position.lerpVectors(approachPosition, approachPosition.clone().addScaledVector(strikeDirection, -.16), anticipation);
        } else if (travel < .88) {
          const strike = easeInOut((travel - .78) / .1);
          group.position.lerpVectors(approachPosition.clone().addScaledVector(strikeDirection, -.16), endPosition, strike);
        } else {
          group.position.copy(endPosition);
        }
      } else {
        group.position.lerpVectors(startPosition, endPosition, easeInOut(travel));
      }
      group.position.y = terrainHeightAtWorld(group.position.x, group.position.z) + PIECE_GROUND_OFFSET + movementBounce(piece.kind, travel, steps);
      group.rotation.z = piece.kind === 'soldier' || piece.kind === 'elephant'
        ? Math.sin(travel * Math.PI * steps) * .045
        : 0;
      controls.target.lerp(actionFocus, .055);

      wheels.forEach((wheel) => { wheel.rotation.x -= .19 * speed; });
      const currentDustStep = Math.floor(travel * steps * 1.6);
      if (currentDustStep > dustStep && travel > .08 && travel < .92) {
        dustStep = currentDustStep;
        createDustPuff(group.position, piece.kind === 'chariot' || piece.kind === 'elephant' ? 1.35 : .85);
        playStepSound(piece.kind, currentDustStep);
      }

      if (capturedGroup && captured && travel > .84) {
        const impactProgress = Math.min(1, (travel - .84) / .16);
        const vanish = impactProgress < .34 ? 1 : 1 - (impactProgress - .34) / .66;
        const squash = Math.sin(Math.min(1, impactProgress / .34) * Math.PI);
        capturedGroup.scale.set(.82 * (1 + squash * .3) * vanish, .82 * (1 - squash * .42) * vanish, .82 * (1 + squash * .16) * vanish);
        capturedGroup.position.lerpVectors(endPosition, recoilPosition, easeInOut(impactProgress));
        capturedGroup.position.y = terrainHeightAtWorld(capturedGroup.position.x, capturedGroup.position.z) + PIECE_GROUND_OFFSET + Math.sin(impactProgress * Math.PI) * .48;
        capturedGroup.rotation.z = impactProgress * 1.15;
        if (!impactFired) {
          impactFired = true;
          createImpact(endPosition, piece.kind, captured.kind);
          showToast(`${pieceLabels[piece.side][piece.kind]}破${pieceLabels[captured.side][captured.kind]}！`);
        }
      }
      if (progress < 1) requestAnimationFrame(tick);
      else {
        group.position.copy(endPosition);
        group.rotation.z = 0;
        controls.target.copy(previousTarget);
        resolve();
      }
    };
    requestAnimationFrame(tick);
  });
}

async function tryMove(to: Position) {
  if (!selectedId || interactionLocked) return;
  const piece = state.pieces.find((item) => item.id === selectedId);
  if (!piece) return;
  const result = applyMove(state, selectedId, to);
  if (!result) return;

  interactionLocked = true;
  availableMoves = [];
  renderMarkers();
  await animateMove(piece, to, result.captured);
  state = result.state;
  selectedId = null;
  renderPieces();
  interactionLocked = false;

  if (result.gameOver) {
    showToast('决胜！');
    playAlertSound(true);
  } else if (result.check) {
    showToast('将军！');
    playAlertSound();
  }
  updateUI(result.check ? '主帅告急' : undefined, result.check ? '当前一方正被将军，请立即应对。' : undefined);
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerDown = new THREE.Vector2();

canvas.addEventListener('pointerdown', (event) => pointerDown.set(event.clientX, event.clientY));
canvas.addEventListener('pointerup', (event) => {
  if (interactionLocked || pointerDown.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 6) return;
  const bounds = canvas.getBoundingClientRect();
  pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(pickables, true)[0];
  if (!hit) { clearSelection(); return; }

  let object: THREE.Object3D | null = hit.object;
  let pieceId: string | undefined;
  while (object && !pieceId) { pieceId = object.userData.pieceId as string | undefined; object = object.parent; }
  if (pieceId) {
    const piece = state.pieces.find((item) => item.id === pieceId);
    if (!piece) return;
    if (piece.side === state.turn) { selectPiece(piece); return; }
    if (selectedId) { void tryMove({ x: piece.x, y: piece.y }); return; }
  }

  const markerMove = hit.object.userData.move as Position | undefined;
  if (markerMove) { void tryMove(markerMove); return; }
  if (hit.object.name === 'board-hit-plane' || hit.object.parent?.name === 'board-hit-plane') {
    const grid = worldToGrid(hit.point);
    if (grid && selectedId) void tryMove(grid);
  }
});

function resetGame() {
  state = initialState();
  selectedId = null;
  availableMoves = [];
  interactionLocked = false;
  renderMarkers();
  renderPieces();
  updateUI('红方整军待发', '选择一枚红方棋子开始行军。');
  showToast('重新布阵');
}

function resetView() {
  camera.position.set(8.6, 11.4, 12.5);
  controls.target.set(0, .5, 0);
  controls.update();
}

resetButton.addEventListener('click', resetGame);
viewButton.addEventListener('click', resetView);
soundButton.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  soundButton.textContent = `音效：${soundEnabled ? '开启' : '关闭'}`;
  soundButton.setAttribute('aria-pressed', String(soundEnabled));
  if (soundEnabled) playSelectSound();
});

function resize() {
  const { clientWidth, clientHeight } = canvas;
  renderer.setSize(clientWidth, clientHeight, false);
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
}

const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(canvas);

addBoard();
renderPieces();
updateUI();
resetView();

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
