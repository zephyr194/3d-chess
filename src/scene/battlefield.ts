import * as T from "three";
import { GROUND, boardPosition } from "./board";
import {
  terrainHeight,
  roadDistance,
  roadInfo,
  stationDistance,
  riverCentre,
  riverWidth,
  crossings,
  crossingSpine,
  routes,
  ridges,
  lakes,
  falls,
  creeks,
  EXTENT,
  inCity,
  surfaceSpeed,
  type MarchPath,
  type Surface,
  type Route,
} from "./landscape-layout";
import type { PieceKind } from "../game/xiangqi";

export type MarchFrame =
  | { readonly status: "cancelled" }
  | {
      readonly status: "active";
      readonly distance: number;
      readonly surface: Surface;
      readonly motion: "walking" | "riding" | "waiting";
      readonly done: boolean;
    };
export interface MarchPlayback {
  readonly durationSeconds: number;
  advance(deltaSeconds: number): MarchFrame;
}
type ScoreInterval = {
  readonly startsAt: number;
  readonly endsAt: number;
  readonly actorFrom: number;
  readonly actorTo: number;
  readonly boatFrom: number;
  readonly boatTo: number;
  readonly surface: Surface;
  readonly motion: "walking" | "riding" | "waiting";
};

export function createBattlefield(parent: T.Group) {
  const root = new T.Group();
  root.name = "battlefield-decor";
  parent.add(root);
  const cloths: T.Mesh[] = [];
  const materials = new Map<string, T.MeshStandardMaterial>();
  const mat = (color: string) => {
    if (!materials.has(color))
      materials.set(
        color,
        new T.MeshStandardMaterial({
          color,
          roughness: 0.94,
          flatShading: true,
        }),
      );
    return materials.get(color)!;
  };
  const mesh = (
    g: T.BufferGeometry,
    color: string,
    name: string,
    owner: T.Group = root,
  ) => {
    const m = new T.Mesh(g, mat(color));
    m.name = name;
    m.castShadow = m.receiveShadow = true;
    owner.add(m);
    return m;
  };
  const boxG = new T.BoxGeometry(1, 1, 1),
    cylG = new T.CylinderGeometry(1, 1, 1, 10),
    coneG = new T.ConeGeometry(1, 1, 7),
    rockG = new T.DodecahedronGeometry(1);
  const batch = new Map<
      string,
      {
        g: T.BufferGeometry;
        owner: T.Group;
        color: string;
        ms: T.Matrix4[];
        name: string;
      }
    >(),
    dummy = new T.Object3D();
  const instance = (
    g: T.BufferGeometry,
    color: string,
    name: string,
    at: number[],
    size: number[],
    rot = 0,
    owner = root,
  ) => {
    const k = `${owner.id}/${name}/${color}`;
    if (!batch.has(k)) batch.set(k, { g, owner, color, ms: [], name });
    dummy.position.set(at[0], at[1], at[2]);
    dummy.scale.set(size[0], size[1], size[2]);
    dummy.rotation.set(0, rot, 0);
    dummy.updateMatrix();
    batch.get(k)!.ms.push(dummy.matrix.clone());
  };
  const box = (
    color: string,
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    rot = 0,
    owner = root,
  ) => instance(boxG, color, name, [x, y, z], [w, h, d], rot, owner);
  const cyl = (
    color: string,
    name: string,
    x: number,
    y: number,
    z: number,
    r: number,
    h: number,
    owner = root,
  ) => instance(cylG, color, name, [x, y, z], [r, h, r], 0, owner);
  const ribbon = (
    points: T.Vector3[],
    width: number,
    color: string,
    name: string,
    owner = root,
  ) => {
    const vs: number[] = [],
      ix: number[] = [];
    points.forEach((p, i) => {
      const d = points[Math.min(i + 1, points.length - 1)]
          .clone()
          .sub(points[Math.max(0, i - 1)]),
        n = new T.Vector3(-d.z, 0, d.x).normalize().multiplyScalar(width / 2);
      vs.push(p.x + n.x, p.y, p.z + n.z, p.x - n.x, p.y, p.z - n.z);
      if (i < points.length - 1) {
        const a = i * 2;
        ix.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    });
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(vs, 3));
    g.setIndex(ix);
    g.computeVertexNormals();
    const m = mesh(g, color, name, owner);
    m.material.side = T.DoubleSide;
    m.castShadow = false;
    return m;
  };
  const poly = (
    outline: number[][],
    y: number,
    color: string,
    name: string,
  ) => {
    const shape = new T.Shape(outline.map(([x, z]) => new T.Vector2(x, -z))),
      g = new T.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    g.translate(0, y, 0);
    const m = mesh(g, color, name);
    m.castShadow = false;
    return m;
  };
  const nx = 180,
    nz = 190,
    vs: number[] = [],
    cs: number[] = [],
    ix: number[] = [];
  const grass = new T.Color("#789563"),
    meadow = new T.Color("#a1ad74"),
    rock = new T.Color("#879a86"),
    peak = new T.Color("#afbfac");
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      const x = -EXTENT.x + (i * EXTENT.x * 2) / nx,
        z = -EXTENT.z + (j * EXTENT.z * 2) / nz,
        y = terrainHeight(x, z);
      vs.push(x, y, z);
      const c = grass
        .clone()
        .lerp(meadow, 0.3 + 0.22 * Math.sin(x * 0.39 + z * 0.25));
      if (y > 1.1) c.lerp(rock, T.MathUtils.smoothstep(y, 1.1, 4));
      if (y > 5) c.lerp(peak, T.MathUtils.smoothstep(y, 5, 9));
      if (y < 0) c.lerp(new T.Color("#718f7c"), 0.4);
      const road = roadInfo(x, z);
      const shoulder = road.width / 2 + 0.44 +
        Math.sin(x * 2.1 + z * 1.7) * 0.09;
      if (road.distance < shoulder) {
        const rc = new T.Color(
          road.surface === "mud" ? "#736447"
            : road.surface === "imperial" ? "#b3a17b"
            : road.surface === "courtyard" ? "#a09b7e"
            : road.surface === "mountain" ? "#9b8e6c"
            : "#a48459",
        );
        const wear = 0.95 + 0.05 * Math.sin(x * 4.1 - z * 3.2);
        rc.multiplyScalar(wear);
        c.lerp(rc, 1 - T.MathUtils.smoothstep(road.distance,
          road.width / 2 - 0.22, shoulder));
      }
      cs.push(c.r, c.g, c.b);
      if (i < nx && j < nz) {
        const a = j * (nx + 1) + i;
        ix.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
      }
    }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(vs, 3));
  geo.setAttribute("color", new T.Float32BufferAttribute(cs, 3));
  geo.setIndex(ix);
  geo.computeVertexNormals();
  const terrain = new T.Mesh(
    geo,
    new T.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      flatShading: true,
    }),
  );
  terrain.name = "continuous-valley-terrain";
  terrain.userData.grid = { nx, nz, extent: EXTENT };
  terrain.receiveShadow = true;
  terrain.material.polygonOffset = true;
  terrain.material.polygonOffsetFactor = 1;
  terrain.material.polygonOffsetUnits = 4;
  root.add(terrain);
  const water = Array.from({ length: 180 }, (_, i) => {
    const x = -38 + (i * 42) / 179;
    return new T.Vector3(x, -1.05, riverCentre(x));
  });
  // Variable-width river, tapering into the headwater valley.
  for (let i = 1; i < water.length; i++) {
    const a = water[i - 1],
      b = water[i];
    poly(
      [
        [a.x, a.z - riverWidth(a.x)],
        [b.x, b.z - riverWidth(b.x)],
        [b.x, b.z + riverWidth(b.x)],
        [a.x, a.z + riverWidth(a.x)],
      ],
      -1.05,
      "#63aaa4",
      "chu-han-river",
    );
  }
  lakes.forEach((l, i) =>
    poly(
      l.outline.map(([x, z]) => [x + l.x, z + l.z]),
      -0.94,
      "#6db3aa",
      `lake-${i}`,
    ),
  );
  creeks.forEach((p, i) => ribbon(p, 0.36, "#7abcb2", `creek-${i}`));
  ribbon(falls, 1.35, "#9bd7ca", "headwater-cascade");
  for (const dx of [-0.35, -0.1, 0.15, 0.4])
    ribbon(
      falls.map((p) => p.clone().add(new T.Vector3(dx, 0.015, 0.01))),
      0.035,
      "#e1f3e8",
      "cascade-whitewater",
    );
  const waterMotion: {
    mesh: T.Mesh<T.BufferGeometry, T.MeshBasicMaterial>;
    origin: T.Vector3;
    phase: number;
    kind: "flow" | "spray";
  }[] = [];
  for (let i = 0; i < 34; i++) {
    const x = -27 + (i * 29) / 33,
      z = riverCentre(x) + Math.sin(i * 2.4) * riverWidth(x) * 0.63;
    const m = new T.Mesh(new T.PlaneGeometry(0.4 + (i % 3) * 0.2, 0.035),
      new T.MeshBasicMaterial({ color: i % 4 ? "#b7ddd0" : "#edf7dc",
        transparent: true, opacity: 0.48, depthWrite: false }));
    m.name = "river-flow-glint";
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.sin(i) * 0.18;
    m.position.set(x, -1.025, z);
    root.add(m);
    waterMotion.push({ mesh: m, origin: m.position.clone(), phase: i * 0.73, kind: "flow" });
  }
  for (let i = 0; i < 12; i++) {
    const m = new T.Mesh(new T.IcosahedronGeometry(1, 0),
      new T.MeshBasicMaterial({ color: "#d7eee0", transparent: true,
        opacity: 0.32, depthWrite: false }));
    m.name = i < 5 ? "cascade-outlet-foam" : "cascade-spray";
    m.position.set(3.5 + Math.sin(i * 2.4) * 0.6,
      i < 5 ? -1 : -0.65 + (i % 4) * 0.24,
      riverCentre(3.5) + Math.cos(i * 1.8) * 0.55);
    m.scale.set(i < 5 ? 0.34 : 0.13, i < 5 ? 0.035 : 0.17,
      i < 5 ? 0.22 : 0.11);
    root.add(m);
    waterMotion.push({ mesh: m, origin: m.position.clone(), phase: i * 1.21, kind: "spray" });
  }
  const roadGroup = new T.Group();
  roadGroup.name = "walkable-roadbeds";
  root.add(roadGroup);
  const roadColors = {
    dirt: "#9eaa82",
    mud: "#929f7b",
    mountain: "#a7b194",
    imperial: "#b2b694",
    courtyard: "#aeb89d",
    bridge: "#b9c3a4",
    boardwalk: "#a68b62",
    ferry: "#a68b62",
  };
  function solidRoad(r: Route, owner: T.Group, name: string) {
    const ps = r.points,
      v: number[] = [],
      top: number[] = [],
      sides: number[] = [];
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i],
        d = ps[Math.min(ps.length - 1, i + 1)]
          .clone()
          .sub(ps[Math.max(0, i - 1)]),
        n = new T.Vector3(-d.z, 0, d.x).normalize().multiplyScalar(r.width / 2);
      v.push(
        p.x + n.x,
        r.crossing === undefined ? GROUND : 0.539,
        p.z + n.z,
        p.x - n.x,
        r.crossing === undefined ? GROUND : 0.539,
        p.z - n.z,
        p.x + n.x,
        r.crossing === undefined ? -1.9 : GROUND - 0.16,
        p.z + n.z,
        p.x - n.x,
        r.crossing === undefined ? -1.9 : GROUND - 0.16,
        p.z - n.z,
      );
      if (i) {
        const a = (i - 1) * 4,
          b = i * 4;
        top.push(a, b, a + 1, a + 1, b, b + 1);
        if (
          terrainHeight(ps[i].x, ps[i].z) < GROUND - 0.25 ||
          r.crossing !== undefined
        )
          sides.push(
            a,
            a + 2,
            b,
            a + 2,
            b + 2,
            b,
            a + 1,
            b + 1,
            a + 3,
            a + 3,
            b + 1,
            b + 3,
          );
        sides.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);
      }
    }
    const n = (ps.length - 1) * 4;
    if (terrainHeight(ps[0].x, ps[0].z) < GROUND - 0.25)
      sides.push(0, 1, 2, 1, 3, 2);
    if (terrainHeight(ps.at(-1)!.x, ps.at(-1)!.z) < GROUND - 0.25)
      sides.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(v, 3));
    g.setIndex([...top, ...sides]);
    g.addGroup(0, top.length, 0);
    g.addGroup(top.length, sides.length, 1);
    g.computeVertexNormals();
    const cap = mat(roadColors[r.surface]);
    cap.polygonOffset = true;
    cap.polygonOffsetFactor = -2;
    cap.polygonOffsetUnits = -3;
    const wall = cap.clone();
    wall.polygonOffsetFactor = 2;
    wall.polygonOffsetUnits = 4;
    const m = new T.Mesh(g, [cap, wall]);
    m.name = name;
    m.receiveShadow = true;
    m.userData.route = r;
    owner.add(m);
    return m;
  }
  // Land roads are carved into and colored on the actual heightfield. This avoids
  // coplanar overlays while preserving exactly the same route graph and level footing.
  for (const r of routes) {
    if (r.surface !== "imperial" && r.surface !== "courtyard") continue;
    const path = new T.CurvePath<T.Vector3>();
    for (let i = 1; i < r.points.length; i++)
      path.add(new T.LineCurve3(r.points[i - 1], r.points[i]));
    const steps = Math.ceil(r.length / 0.78);
    for (let i = 0; i < steps; i++) {
      const u = (i + 0.5) / steps, p = path.getPoint(u),
        d = path.getTangent(u), yaw = Math.atan2(d.x, d.z);
      if (stationDistance(p.x, p.z) < 0.65) continue;
      for (const side of [-1, 1]) {
        const n = new T.Vector3(-d.z, 0, d.x).normalize(),
          offset = side * Math.min(0.28, r.width * 0.2);
        box(i % 3 ? "#b7ad8e" : "#9f9d85", "inset-road-masonry",
          p.x + n.x * offset, GROUND - 0.045, p.z + n.z * offset,
          Math.min(0.46, r.width * 0.35), 0.09, 0.43 + (i % 2) * 0.12,
          yaw + Math.sin(i * 7.1) * 0.055, roadGroup);
      }
    }
  }
  const ferryBerthOffset = 1.7;
  let marchGeneration = 0;
  let boat: T.Group;
  const decks: T.Group[] = [];
  function beam(
    a: T.Vector3,
    b: T.Vector3,
    color: string,
    name: string,
    owner: T.Group,
  ) {
    const d = b.clone().sub(a),
      m = mesh(
        new T.CylinderGeometry(0.055, 0.055, d.length(), 6),
        color,
        name,
        owner,
      );
    m.position.copy(a).lerp(b, 0.5);
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
  }
  function gate(x: number, z: number, red: boolean, name: string) {
    const g = new T.Group();
    g.name = name;
    g.position.set(x, GROUND, z);
    root.add(g);
    const sh = new T.Shape();
    sh.moveTo(-2.05, 0);
    sh.lineTo(-2.05, 3);
    sh.lineTo(2.05, 3);
    sh.lineTo(2.05, 0);
    sh.lineTo(1.12, 0);
    sh.lineTo(1.12, 1.9);
    sh.quadraticCurveTo(0, 3.05, -1.12, 1.9);
    sh.lineTo(-1.12, 0);
    sh.closePath();
    const geom = new T.ExtrudeGeometry(sh, {
      depth: 0.65,
      bevelEnabled: false,
    });
    geom.translate(0, 0, -0.325);
    mesh(geom, "#a3ad93", "gate-arch", g);
    for (const s of [-1, 1]) {
      box("#95a38b", "gate-pier", s * 1.7, 1.25, 0, 0.7, 2.5, 1.1, 0, g);
      for (const dx of [-0.25, 0.25])
        box(
          "#bdc4a7",
          "gate-crenel",
          s * 1.7 + dx,
          3.08,
          0,
          0.2,
          0.45,
          0.95,
          0,
          g,
        );
    }
    box("#c3c9ad", "gate-coping", 0, 3, 0, 4.3, 0.2, 0.9, 0, g);
    g.userData.openingWidth = 2.24;
    g.userData.openingHeight = 2.5;
    flag(x - 2.5, GROUND, z, red);
    return g;
  }
  crossings.forEach((c, i) => {
    const g = new T.Group();
    g.name = c.id;
    root.add(g);
    decks.push(g);
    if (i === 0) {
      for (const end of [-1, 1]) {
        box(
          "#a58d65",
          "ferry-landing",
          c.x,
          0.43,
          c.z + end * 2.6,
          2.8,
          0.22,
          1.1,
          0,
          g,
        );
        for (const s of [-1, 1])
          cyl(
            "#79684d",
            "dock-pile",
            c.x + s * 1.5,
            -0.1,
            c.z + end * 2.6,
            0.11,
            2.6,
            g,
          );
      }
      boat = new T.Group();
      boat.name = "working-ferry";
      boat.position.set(c.x, 0, c.z + ferryBerthOffset);
      g.add(boat);
      box("#76664c", "ferry-hull", 0, -0.35, 0, 2.2, 1.7, 2.5, 0, boat);
      box(
        "#ac956d",
        "continuous-ferry-deck",
        0,
        0.459,
        0,
        2.2,
        0.16,
        2.5,
        0,
        boat,
      );
      for (let p = 0; p < 13; p++)
        box(
          p % 3 ? "#af986f" : "#bca67e",
          "ferry-plank",
          0,
          0.5275,
          (p - 6) * 0.19,
          2.18,
          0.025,
          0.18,
          0,
          boat,
        );
      for (const s of [-1, 1])
        box(
          "#8c7554",
          "ferry-gunwale",
          s * 1.12,
          0.7,
          0,
          0.09,
          0.3,
          2.5,
          0,
          boat,
        );
      beam(
        new T.Vector3(c.x - 1.65, 1.4, c.z - 2.6),
        new T.Vector3(c.x - 1.65, 1.4, c.z + 2.6),
        "#b9ab86",
        "tow-rope",
        g,
      );
      return;
    }
    const r = routes.find((r) => r.crossing === i)!;
    solidRoad(r, g, i === 1 ? "bridge-deck" : "continuous-cliff-deck");
    if (i === 1) {
      const deck = g.getObjectByName("bridge-deck") as T.Mesh;
      deck.material = [mat("#bdc5a8"), mat("#8e9b84")];
      for (let j = 0; j < 18; j++)
        box(
          j % 2 ? "#bdc6a7" : "#cbd0b2",
          "bridge-paving",
          0,
          0.53,
          ((j - 8.5) * c.length) / 18,
          c.width - 0.1,
          0.02,
          c.length / 18 - 0.018,
          0,
          g,
        );
      for (const s of [-1, 1]) {
        box(
          "#9daa91",
          "bridge-parapet",
          s * 1.34,
          0.87,
          0,
          0.16,
          0.65,
          c.length,
          0,
          g,
        );
        for (const end of [-1, 1])
          box(
            "#8d9c84",
            "stone-abutment",
            s * 1.15,
            -0.45,
            end * 2.4,
            0.5,
            2,
            0.6,
            0,
            g,
          );
      }
      for (const side of [-1, 1]) {
        const shape = new T.Shape();
        shape.moveTo(-2.6, -1.9);
        shape.lineTo(-2.6, 0.45);
        shape.lineTo(2.6, 0.45);
        shape.lineTo(2.6, -1.9);
        shape.lineTo(1.8, -1.9);
        shape.quadraticCurveTo(0, 2.5, -1.8, -1.9);
        shape.closePath();
        const vault = new T.ExtrudeGeometry(shape, {
          depth: 0.22,
          bevelEnabled: false,
        });
        vault.translate(0, 0, -0.11);
        vault.rotateY(Math.PI / 2);
        const arch = mesh(vault, "#8e9d84", "bridge-arch-vault", g);
        arch.position.x = side * 1.13;
      }
      for (const end of [-1, 1])
        for (const side of [-1, 1]) {
          box("#9da58b", "bridge-bank-wing", c.x + side * 1.95,
            -0.18, c.z + end * 2.8, 0.8, 1.45, 1.5, end * side * 0.2, g);
          for (let k = 0; k < 3; k++)
            instance(rockG, "#82917c", "bridge-bank-rubble",
              [c.x + side * (2.1 + k * 0.24), -0.5, c.z + end * (3.1 + k * 0.38)],
              [0.38, 0.5, 0.45], k, g);
        }
      gate(0, -2.65, false, "river-pass-gate");
    } else {
      const sp = crossingSpine(i);
      for (let j = 1; j < sp.length; j++) {
        const a = sp[j - 1],
          b = sp[j],
          d = b.clone().sub(a),
          n = new T.Vector3(-d.z, 0, d.x).normalize(),
          steps = Math.ceil(d.length() / 0.24);
        for (let k = 0; k < steps; k++) {
          const p = a.clone().lerp(b, (k + 0.5) / steps);
          box(
            k % 3 ? "#ab9268" : "#b59d73",
            "cliff-plank",
            p.x,
            0.5275,
            p.z,
            c.width,
            0.025,
            d.length() / steps - 0.01,
            Math.atan2(d.x, d.z),
            g,
          );
        }
        for (const s of [-1, 1]) {
          const aa = a.clone().addScaledVector(n, s * (c.width / 2 + 0.06)),
            bb = b.clone().addScaledVector(n, s * (c.width / 2 + 0.06));
          beam(
            aa.clone().setY(1.45),
            bb.clone().setY(1.45),
            "#9d865e",
            "cliff-handrail",
            g,
          );
          for (const t of [0, 0.5, 1]) {
            const p = aa.clone().lerp(bb, t);
            box(
              "#8c7856",
              "cliff-trestle",
              p.x,
              -0.25,
              p.z,
              0.12,
              3.4,
              0.12,
              0,
              g,
            );
            const anchor = p.clone().addScaledVector(n, s * 0.6).setY(-1.6);
            beam(anchor, p.clone().setY(0.37), "#77684d", "cliff-diagonal-brace", g);
            instance(rockG, "#7c8d79", "cliff-rock-anchor",
              [anchor.x, -1.7, anchor.z], [0.5, 0.6, 0.55], t, g);
          }
        }
      }
    }
  });
  // The river banks are military frontiers, with actual gaps at crossing approaches.
  for (const sign of [-1, 1])
    for (let x = -14; x < 4; x += 0.55) {
      if (crossings.slice(0, 2).some((c) => Math.abs(x - c.x) < 1.9)) continue;
      const z = riverCentre(x) + sign * (riverWidth(x) + 0.8);
      if (sign < 0) {
        cyl("#9a8960", "water-stockade", x, 1.1, z, 0.09, 1.15);
        box("#a89d75", "stockade-beam", x, 1.14, z, 0.6, 0.12, 0.12);
      } else {
        box("#98a68d", "river-curtain", x, 0.93, z, 0.58, 0.8, 0.35);
        if (Math.round(x / 0.55) % 2 === 0)
          box("#bac3a5", "river-crenel", x, 1.4, z, 0.27, 0.2, 0.4);
      }
    }
  function wallRun(
    axis: "x" | "z",
    coordinate: number,
    lo: number,
    hi: number,
    front = false,
  ) {
    const cuts: number[][] = front ? [[-1.3, 1.3]] : [];
    for (const r of routes)
      for (let i = 1; i < r.points.length; i++) {
        const a = r.points[i - 1],
          b = r.points[i],
          da = axis === "x" ? a.x : a.z,
          db = axis === "x" ? b.x : b.z;
        if (
          Math.abs(db - da) < 1e-8 ||
          coordinate < Math.min(da, db) ||
          coordinate > Math.max(da, db)
        )
          continue;
        const t = (coordinate - da) / (db - da),
          v = T.MathUtils.lerp(
            axis === "x" ? a.z : a.x,
            axis === "x" ? b.z : b.x,
            t,
          );
        cuts.push([v - 1.3, v + 1.3]);
      }
    cuts.sort((a, b) => a[0] - b[0]);
    let cursor = lo;
    const run = (a: number, b: number) => {
      if (b - a < 0.1) return;
      const mid = (a + b) / 2;
      if (axis === "x")
        box("#a4af95", "city-wall", coordinate, 1.05, mid, 0.4, 1.02, b - a);
      else box("#a4af95", "city-wall", mid, 1.05, coordinate, b - a, 1.02, 0.4);
    };
    for (const [a, b] of cuts) {
      if (b < lo || a > hi) continue;
      run(cursor, Math.min(hi, a));
      cursor = Math.max(cursor, b);
    }
    run(cursor, hi);
  }
  for (const s of [-1, 1]) {
    wallRun("z", s * 8.55, -5, 5, true);
    wallRun("z", s * 17.8, -5, 5);
    for (const x of [-5, 5]) {
      wallRun(
        "x",
        x,
        Math.min(s * 8.55, s * 17.8),
        Math.max(s * 8.55, s * 17.8),
      );
      for (const z of [s * 8.55, s * 17.8]) {
        box("#94a48c", "corner-tower", x, 1.37, z, 1.2, 1.65, 1.2);
        instance(
          coneG,
          s > 0 ? "#c28146" : "#708f82",
          "watchtower-roof",
          [x, 2.55, z],
          [1, 0.8, 1],
          Math.PI / 4,
        );
      }
    }
    gate(0, s * 8.55, s > 0, s > 0 ? "red-city-gate" : "black-city-gate");
  }
  function flag(x: number, y: number, z: number, red: boolean) {
    cyl("#806d4c", "flag-pole", x, y + 1, z, 0.04, 2);
    const m = mesh(
      new T.PlaneGeometry(0.7, 0.4, 5, 1),
      red ? "#c44d36" : "#4b6b62",
      "battle-flag",
    );
    m.material.side = T.DoubleSide;
    m.position.set(x + 0.34, y + 1.65, z);
    cloths.push(m);
  }
  let seed = 194;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const trees = (
    x: number,
    y: number,
    z: number,
    size: number,
    broad = false,
  ) => {
    cyl(
      "#7b6a4f",
      "forest-trunks",
      x,
      y + size * 0.25,
      z,
      0.07 * size,
      size * 0.5,
    );
    if (broad) {
      for (let k = 0; k < 3; k++)
        instance(
          rockG,
          k === 1 ? "#789763" : "#527e58",
          "broadleaf-canopy",
          [
            x + Math.sin(k * 2.3) * size * 0.18,
            y + size * (0.7 + k * 0.07),
            z + Math.cos(k * 2.3) * size * 0.18,
          ],
          [size * 0.4, size * 0.36, size * 0.38],
          k,
        );
    } else
      for (let k = 0; k < 3; k++)
        instance(
          coneG,
          k === 2 ? "#799e6d" : "#3e795e",
          "pine-canopy",
          [x, y + size * (0.43 + k * 0.2), z],
          [size * (0.36 - k * 0.07), size * 0.56, size * (0.36 - k * 0.07)],
          x,
        );
  };
  for (let i = 0; i < 1400; i++) {
    const x = (random() - 0.5) * 54,
      z = (random() - 0.5) * 58,
      y = terrainHeight(x, z);
    if (
      y < 0.15 ||
      y > 7.6 ||
      inCity(x, z) ||
      roadDistance(x, z) < 1.55 ||
      stationDistance(x, z) < 2.35 ||
      (Math.abs(z - riverCentre(x)) < riverWidth(x) + 0.6 && x < 5) ||
      crossings.some((c) => Math.abs(x - c.x) < 2.2 && Math.abs(z - c.z) < 4)
    )
      continue;
    if (x > 3 && x < 9 && Math.abs(z) < 1.6) continue;
    if (Math.abs(x) < 15 && z > 13 && z < 21) continue;
    if (random() > 0.65) continue;
    trees(x, y - 0.1, z, 1.7 + random() * 1.2, random() > 0.55);
  }
  for (let i = 0; i < 180; i++) {
    const x = (random() - 0.5) * 46,
      z = (random() - 0.5) * 50,
      y = terrainHeight(x, z);
    if (y < 1.2 || roadDistance(x, z) < 1.5 || stationDistance(x, z) < 1.5)
      continue;
    instance(
      rockG,
      "#92a18a",
      "outcrop",
      [x, y + 0.2, z],
      [0.4 + random() * 0.5, 0.3 + random() * 0.4, 0.5],
      x,
    );
  }
  for (let i = 0; i < 450; i++) {
    const x = (random() - 0.5) * 30,
      z = (random() - 0.5) * 34,
      y = terrainHeight(x, z);
    if (
      y < 0.05 ||
      y > 1.4 ||
      roadDistance(x, z) < 1.1 ||
      stationDistance(x, z) < 0.8
    )
      continue;
    for (let j = 0; j < 3; j++)
      instance(
        coneG,
        "#8a9d70",
        "meadow-reeds",
        [x + j * 0.07, y + 0.12, z + Math.sin(j) * 0.07],
        [0.04, 0.26, 0.04],
        j,
      );
  }
  for (const [x, z, red] of [
    [-20, 15, true],
    [20, -15, false],
  ] as [number, number, boolean][]) {
    const y = terrainHeight(x, z);
    instance(
      coneG,
      red ? "#b68c5e" : "#788c78",
      "camp-tents",
      [x, y + 0.7, z],
      [1.5, 1.4, 1.5],
      Math.PI / 4,
    );
    flag(x + 1.8, y, z, red);
    for (let i = 0; i < 4; i++)
      box(
        "#a78c60",
        "camp-supplies",
        x - 1 + i * 0.35,
        y + 0.2,
        z + 1.5,
        0.3,
        0.4,
        0.3,
      );
  }
  const mist: T.Mesh<T.IcosahedronGeometry, T.MeshBasicMaterial>[] = [];
  for (let i = 0; i < 9; i++) {
    const angle = Math.PI * (1.12 + (i / 8) * 0.76),
      m = new T.Mesh(
        new T.IcosahedronGeometry(1, 1),
        new T.MeshBasicMaterial({
          color: "#c3d6c9",
          transparent: true,
          opacity: 0.13,
          depthWrite: false,
        }),
      );
    m.name = "distant-mist";
    m.position.set(
      Math.cos(angle) * 32,
      3 + (i % 3) * 0.6,
      Math.sin(angle) * 35,
    );
    m.scale.set(6, 0.65, 3.5);
    root.add(m);
    mist.push(m);
  }
  const pins = new T.InstancedMesh(
    new T.BoxGeometry(0.18, 0.035, 0.18),
    mat("#c7cbae"),
    90,
  );
  pins.name = "station-stone-pins";
  for (let i = 0; i < 90; i++) {
    dummy.position.copy(boardPosition({ x: i % 9, y: Math.floor(i / 9) }));
    dummy.position.y = GROUND + 0.018;
    dummy.scale.setScalar(1);
    dummy.rotation.set(0, Math.PI / 4, 0);
    dummy.updateMatrix();
    pins.setMatrixAt(i, dummy.matrix);
  }
  root.add(pins);
  // Serialize repeated forest, masonry, and plank parts into instanced batches.
  for (const b of batch.values()) {
    const m = new T.InstancedMesh(b.g, mat(b.color), b.ms.length);
    m.name = b.name;
    b.ms.forEach((v, i) => m.setMatrixAt(i, v));
    m.castShadow = b.name !== "junction-support";
    m.receiveShadow = true;
    m.computeBoundingSphere();
    b.owner.add(m);
  }
  root.userData.routes = routes;
  root.userData.ridges = ridges.length;
  root.updateMatrixWorld(true);
  return {
    root,
    decks,
    roadGroup,
    terrain,
    startMarch(path: MarchPath, kind: PieceKind): MarchPlayback {
      const generation = ++marchGeneration;
      const score: ScoreInterval[] = [];
      let endsAt = 0, boatZ = boat.position.z;
      const append = (
        actorFrom: number, actorTo: number, boatTo: number,
        surface: Surface, motion: "walking" | "riding" | "waiting",
        seconds: number,
      ) => {
        if (seconds <= 1e-12) return;
        score.push(Object.freeze({ startsAt: endsAt, endsAt: endsAt + seconds,
          actorFrom, actorTo, boatFrom: boatZ, boatTo, surface, motion }));
        endsAt += seconds;
        boatZ = boatTo;
      };
      const length = path.getLength();
      for (const section of path.sections) {
        if (section.surface !== "ferry") {
          append(section.start, section.end, boatZ, section.surface, "walking",
            (section.end - section.start) / surfaceSpeed(kind, section.surface));
          continue;
        }
        const from = path.getPointAt(section.start / length),
          to = path.getPointAt(section.end / length),
          direction = Math.sign(to.z - from.z),
          entryZ = crossings[0].z - direction * ferryBerthOffset,
          exitZ = crossings[0].z + direction * ferryBerthOffset,
          boarded = section.start + Math.abs(entryZ - from.z),
          disembark = section.end - Math.abs(to.z - exitZ);
        append(section.start, section.start, entryZ, "boardwalk", "waiting",
          Math.abs(boatZ - entryZ) / surfaceSpeed(kind, "ferry"));
        append(section.start, boarded, entryZ, "boardwalk", "walking",
          (boarded - section.start) / surfaceSpeed(kind, "boardwalk"));
        append(boarded, disembark, exitZ, "ferry", "riding",
          Math.abs(exitZ - entryZ) / surfaceSpeed(kind, "ferry"));
        append(disembark, section.end, exitZ, "boardwalk", "walking",
          (section.end - disembark) / surfaceSpeed(kind, "boardwalk"));
      }
      const intervals = Object.freeze(score);
      let elapsed = 0;
      return {
        durationSeconds: endsAt,
        advance(deltaSeconds: number): MarchFrame {
          if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0)
            throw new RangeError("March time must be finite and nonnegative");
          if (generation !== marchGeneration) return { status: "cancelled" };
          elapsed = Math.min(endsAt, elapsed + deltaSeconds);
          const interval = intervals.find((s) => elapsed < s.endsAt) ?? intervals.at(-1);
          if (!interval) return { status: "active", distance: length,
            surface: path.surfaceAt(1), motion: "walking", done: true };
          const t = T.MathUtils.clamp((elapsed - interval.startsAt) /
            (interval.endsAt - interval.startsAt), 0, 1);
          boat.position.z = T.MathUtils.lerp(interval.boatFrom, interval.boatTo, t);
          return { status: "active",
            distance: T.MathUtils.lerp(interval.actorFrom, interval.actorTo, t),
            surface: interval.surface, motion: interval.motion, done: elapsed >= endsAt };
        },
      };
    },
    reset() {
      marchGeneration++;
      boat.position.z = crossings[0].z + ferryBerthOffset;
    },
    update(time: number, reduced: boolean) {
      if (reduced) return;
      cloths.forEach((f, i) => {
        f.rotation.y = Math.sin(time * 0.0015 + i) * 0.09;
      });
      mist.forEach((m, i) => {
        m.material.opacity = 0.12 + Math.sin(time * 0.0001 + i) * 0.03;
        const angle = Math.PI * (1.12 + (i / 8) * 0.76);
        m.position.x = Math.cos(angle) * 32 + Math.sin(time * 0.000035 + i) * 1.4;
      });
      waterMotion.forEach(({ mesh: m, origin, phase, kind }) => {
        m.position.copy(origin);
        if (kind === "flow") {
          m.position.x += Math.sin(time * 0.0005 + phase) * 0.24;
          m.material.opacity = 0.32 + Math.sin(time * 0.0012 + phase) * 0.13;
        } else {
          m.position.y += Math.sin(time * 0.0015 + phase) * 0.06;
          m.material.opacity = 0.24 + Math.sin(time * 0.001 + phase) * 0.08;
        }
      });
    },
  };
}
