import * as T from "three";
import { boardPosition, BASE, GROUND } from "./board";
import type { Position, PieceKind } from "../game/xiangqi";
export type Surface =
  | "dirt"
  | "mud"
  | "mountain"
  | "imperial"
  | "courtyard"
  | "bridge"
  | "boardwalk"
  | "ferry";
export type Route = {
  from: string;
  to: string;
  points: T.Vector3[];
  surface: Surface;
  width: number;
  length: number;
  crossing?: number;
};
export const WATER = -1.05,
  EXTENT = { x: 36, z: 38 };
export const riverCentre = (x: number) => Math.sin(x * 0.19) * 0.35;
export const riverWidth = (x: number) =>
  x < 0
    ? 1.45 + T.MathUtils.smoothstep(-x, 13, 35) * 2.8
    : 1.45 * (1 - T.MathUtils.smoothstep(x, 3.5, 7.4));
export const crossings = [
  {
    id: "western-ferry",
    x: -9.6,
    z: riverCentre(-9.6),
    width: 2.5,
    length: 5.2,
  },
  { id: "central-gate-bridge", x: 0, z: 0, width: 2.6, length: 5.2 },
  {
    id: "eastern-cliff-walk",
    x: 9.6,
    z: riverCentre(9.6),
    width: 2.3,
    length: 5.2,
  },
];
export const crossingSpine = (i: number) => {
  const c = crossings[i];
  return (
    i === 2
      ? [
          [0, -2.6],
          [0.85, -1.4],
          [1.25, -0.3],
          [0.9, 1.3],
          [0, 2.6],
        ]
      : [
          [0, -2.6],
          [0, 2.6],
        ]
  ).map(([x, z]) => new T.Vector3(c.x + x, BASE, c.z + z));
};
export const ridges = [
  [-17, -10, 5, 8, 8],
  [-18, 0, 5, 7, 9],
  [-17, 10, 5, 8, 7],
  [17, -10, 5, 7, 9],
  [18, 0, 6, 7, 10],
  [17, 11, 5, 8, 8],
  [-10, -23, 7, 5, 7],
  [9, -23, 8, 5, 8],
  [-10, 23, 6, 4, 5],
  [10, 23, 7, 4, 6],
  [7.4, -0.2, 2.4, 1.8, 6.8],
  [13, 0.5, 2.8, 3.2, 5.7],
];
export const lakes = [
  {
    x: -7.8,
    z: -4.8,
    outline: [
      [-1.6, -0.3],
      [-1.2, -1.1],
      [-0.2, -1.25],
      [0.5, -0.7],
      [1.5, -0.8],
      [1.7, 0.2],
      [0.65, 0.6],
      [0.1, 1.1],
      [-0.8, 0.8],
      [-1.5, 1.2],
    ],
  },
  {
    x: 7.5,
    z: 5.1,
    outline: [
      [-0.7, -1.7],
      [0.1, -1.8],
      [0.8, -0.9],
      [0.55, -0.25],
      [1.1, 0.45],
      [0.45, 1.5],
      [-0.2, 1.8],
      [-0.85, 0.85],
      [-0.65, 0],
      [-1, -0.6],
    ],
  },
];
export const falls = [
  new T.Vector3(7.4, 7, -0.2),
  new T.Vector3(6.8, 6.9, -0.35),
  new T.Vector3(6.2, 3.9, -0.2),
  new T.Vector3(5, 3.8, -0.15),
  new T.Vector3(4.35, 0.2, 0),
  new T.Vector3(3.4, WATER + 0.02, riverCentre(3.4)),
];
export const creeks = [
  [
    new T.Vector3(-7.8, -0.94, -4.8),
    new T.Vector3(-6.5, -0.96, -3.7),
    new T.Vector3(-6.4, -1, -2.3),
    new T.Vector3(-5.7, WATER + 0.01, riverCentre(-5.7)),
  ],
  [
    new T.Vector3(7.5, -0.94, 5.1),
    new T.Vector3(5.7, -0.97, 4),
    new T.Vector3(5, -1, 2.4),
    new T.Vector3(4, WATER + 0.02, riverCentre(4)),
  ],
];
export const key = (p: Position) => `${p.x},${p.y}`;
export const nodes = new Map<string, T.Vector3>();
export const routes: Route[] = [];
function curve(a: T.Vector3, b: T.Vector3, bend: number) {
  const n = new T.Vector3(-(b.z - a.z), 0, b.x - a.x).normalize();
  return new T.QuadraticBezierCurve3(
    a,
    a.clone().lerp(b, 0.5).addScaledVector(n, bend),
    b,
  ).getPoints(24);
}
const raw: {
  from: string;
  to: string;
  points: T.Vector3[];
  surface: Surface;
  stops: { id: string; d: number }[];
}[] = [];
const node = (id: string, x: number, z: number) => {
  nodes.set(id, new T.Vector3(x, BASE, z));
  return id;
};
const trunk = (from: string, to: string, surface: Surface, bend = 0) =>
  raw.push({
    from,
    to,
    surface,
    points: curve(nodes.get(from)!, nodes.get(to)!, bend),
    stops: [],
  });
for (const s of [-1, 1]) {
  const h = (name: string, x: number, z: number) =>
    node(`${s}:${name}`, x, z * s);
  const wb = h("wb", -11.1, 15.5),
    wm = h("wm", -10.5, 11),
    wf = h("wf", s < 0 ? -12 : -9.5, 6.5),
    wi = h("wi", -5, 5.5);
  const cb = h("cb", 1.2, 15.6),
    cm = h("cm", 1.1, 11.3),
    cg = h("cg", 0, 8.55),
    cf = h("cf", 0, 5.2);
  const eb = h("eb", 11.4, 15.2),
    em = h("em", 10.4, 11.2),
    ef = h("ef", 11.5, 5.8);
  const ends = crossings.map((_, i) => {
    const sp = crossingSpine(i),
      p = s < 0 ? sp[0] : sp.at(-1)!;
    return node(`${s}:cross${i}`, p.x, p.z);
  });
  trunk(wb, wm, "dirt", 0.7 * s);
  trunk(wm, wf, "mud", -s);
  trunk(wf, ends[0], "mud", 0.8 * s);
  trunk(cb, cm, "courtyard");
  trunk(cm, cg, "courtyard");
  trunk(cg, cf, "imperial", 2.4);
  trunk(cf, ends[1], "imperial");
  trunk(eb, em, "dirt", -s);
  trunk(em, ef, "mountain", 1.4 * s);
  trunk(ef, ends[2], "mountain", -0.5 * s);
  trunk(wm, cm, "dirt", 0.8 * s);
  trunk(cm, em, "dirt", -0.8 * s);
  trunk(wf, wi, "mud", -0.8);
  trunk(wi, cf, "dirt", 0.6 * s);
  trunk(cf, ef, "mountain", -s);
}
function cumulative(points: T.Vector3[]) {
  const ds = [0];
  for (let i = 1; i < points.length; i++)
    ds.push(ds[i - 1] + points[i].distanceTo(points[i - 1]));
  return ds;
}
function sample(points: T.Vector3[], ds: number[], d: number) {
  const i = Math.max(
    0,
    Math.min(points.length - 2, ds.findIndex((v) => v >= d) - 1),
  );
  return points[i]
    .clone()
    .lerp(
      points[i + 1],
      T.MathUtils.clamp((d - ds[i]) / (ds[i + 1] - ds[i] || 1), 0, 1),
    );
}
function add(
  from: string,
  to: string,
  points: T.Vector3[],
  surface: Surface,
  width: number,
  crossing?: number,
) {
  const ds = cumulative(points),
    length = ds.at(-1)!;
  if (length > 1e-7)
    routes.push({ from, to, points, surface, width, crossing, length });
}
for (let y = 0; y < 10; y++)
  for (let x = 0; x < 9; x++) {
    const p = boardPosition({ x, y }),
      id = key({ x, y });
    nodes.set(id, p);
    let best = Infinity,
      chosen: (typeof raw)[number] | null = null,
      at = p,
      along = 0;
    for (const r of raw) {
      if (!r.from.startsWith(y < 5 ? "-1:" : "1:")) continue;
      const ds = cumulative(r.points);
      for (let j = 0; j < r.points.length - 1; j++) {
        const a = r.points[j],
          b = r.points[j + 1],
          delta = b.clone().sub(a);
        const t = T.MathUtils.clamp(
            p.clone().sub(a).dot(delta) / delta.lengthSq(),
            0,
            1,
          ),
          v = a.clone().addScaledVector(delta, t),
          d = p.distanceTo(v) + (inCity(p.x, p.z) !== inCity(v.x, v.z) ? 8 : 0);
        if (d < best) {
          best = d;
          chosen = r;
          at = v;
          along = ds[j] + t * delta.length();
        }
      }
    }
    const r = chosen!,
      total = cumulative(r.points).at(-1)!;
    let stop =
      along < 1e-5 ? r.from : total - along < 1e-5 ? r.to : `access:${id}`;
    const existing = r.stops.find((v) => Math.abs(v.d - along) < 1e-5);
    if (existing) stop = existing.id;
    if (!nodes.has(stop)) {
      nodes.set(stop, at);
      r.stops.push({ id: stop, d: along });
    }
    if (p.distanceTo(at) < 1e-5) {
      at = at.clone().add(new T.Vector3(0.015, 0, 0));
      nodes.set(stop, at);
    }
    add(
      id,
      stop,
      curve(p, nodes.get(stop)!, Math.sin(x * 2 + y) * 0.2),
      inCity(p.x, p.z)
        ? "courtyard"
        : p.x > 4
          ? "mountain"
          : p.x < -4 && Math.abs(p.z) < 9
            ? "mud"
            : "dirt",
      1.35,
    );
  }
for (const r of raw) {
  const ds = cumulative(r.points),
    total = ds.at(-1)!,
    stops = [
      { id: r.from, d: 0 },
      ...r.stops.sort((a, b) => a.d - b.d),
      { id: r.to, d: total },
    ];
  for (let j = 0; j < stops.length - 1; j++) {
    const a = stops[j],
      b = stops[j + 1],
      n = Math.max(2, Math.ceil((b.d - a.d) / 0.3));
    const ps = Array.from({ length: n + 1 }, (_, i) =>
      sample(r.points, ds, a.d + ((b.d - a.d) * i) / n),
    );
    ps[0] = nodes.get(a.id)!.clone();
    ps[n] = nodes.get(b.id)!.clone();
    add(a.id, b.id, ps, r.surface, 1.95);
  }
}
crossings.forEach((c, i) =>
  add(
    `-1:cross${i}`,
    `1:cross${i}`,
    crossingSpine(i),
    (["ferry", "bridge", "boardwalk"] as Surface[])[i],
    c.width,
    i,
  ),
);
export function inCity(x: number, z: number) {
  return Math.abs(x) < 5 && Math.abs(z) > 8.3 && Math.abs(z) < 18;
}
export function segmentDistance(
  x: number,
  z: number,
  a: T.Vector3,
  b: T.Vector3,
) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    t = T.MathUtils.clamp(
      ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1),
      0,
      1,
    );
  return Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
}
const buckets = new Map<string, { a: T.Vector3; b: T.Vector3; r: Route }[]>();
for (const r of routes) {
  if (r.crossing !== undefined) continue;
  for (let i = 1; i < r.points.length; i++) {
    const a = r.points[i - 1],
      b = r.points[i];
    for (
      let x = Math.floor((Math.min(a.x, b.x) - 1.8) / 2);
      x <= Math.floor((Math.max(a.x, b.x) + 1.8) / 2);
      x++
    )
      for (
        let z = Math.floor((Math.min(a.z, b.z) - 1.8) / 2);
        z <= Math.floor((Math.max(a.z, b.z) + 1.8) / 2);
        z++
      ) {
        const k = `${x},${z}`;
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k)!.push({ a, b, r });
      }
  }
}
export function roadInfo(x: number, z: number) {
  let distance = Infinity,
    surface: Surface = "dirt",
    width = 1.35;
  for (const { a, b, r } of buckets.get(
    `${Math.floor(x / 2)},${Math.floor(z / 2)}`,
  ) ?? []) {
    const d = segmentDistance(x, z, a, b);
    if (d < distance) {
      distance = d;
      surface = r.surface;
      width = r.width;
    }
  }
  return { distance, surface, width };
}
export function roadDistance(x: number, z: number) {
  return roadInfo(x, z).distance;
}
export const stations = Array.from({ length: 90 }, (_, i) =>
  boardPosition({ x: i % 9, y: Math.floor(i / 9) }),
);
export function stationDistance(x: number, z: number) {
  let d = Infinity;
  for (const p of stations) d = Math.min(d, Math.hypot(x - p.x, z - p.z));
  return d;
}
export function lakeDistance(
  x: number,
  z: number,
  lake: (typeof lakes)[number],
) {
  const px = x - lake.x,
    pz = z - lake.z;
  let inside = false,
    d = Infinity;
  for (
    let i = 0, j = lake.outline.length - 1;
    i < lake.outline.length;
    j = i++
  ) {
    const a = lake.outline[j],
      b = lake.outline[i];
    if (
      a[1] > pz !== b[1] > pz &&
      px < ((b[0] - a[0]) * (pz - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
    d = Math.min(
      d,
      segmentDistance(
        px,
        pz,
        new T.Vector3(a[0], 0, a[1]),
        new T.Vector3(b[0], 0, b[1]),
      ),
    );
  }
  return inside ? -d : d;
}
export function terrainHeight(x: number, z: number) {
  let max = 0,
    sum = 0;
  for (const [px, pz, rx, rz, h] of ridges) {
    const g =
      Math.exp(-1.35 * (((x - px) / rx) ** 2 + ((z - pz) / rz) ** 2)) * h;
    max = Math.max(max, g);
    sum += g;
  }
  let h =
    0.38 + 0.09 * Math.sin(x * 0.4) * Math.cos(z * 0.3) + max + sum * 0.08;
  if (inCity(x, z)) h = 0.5;
  const wet = Math.abs(z - riverCentre(x));
  if (x < 4)
    h = T.MathUtils.lerp(
      -1.9,
      h,
      T.MathUtils.smoothstep(wet, riverWidth(x) - 0.1, riverWidth(x) + 1),
    );
  for (const l of lakes) {
    const d = lakeDistance(x, z, l);
    if (d < 0.6)
      h = Math.min(
        h,
        T.MathUtils.lerp(-1.4, h, T.MathUtils.smoothstep(d, -0.05, 0.6)),
      );
  }
  for (const stream of [...creeks, falls]) {
    let nearest = Infinity,
      bed = 0;
    for (let i = 1; i < stream.length; i++) {
      const a = stream[i - 1],
        b = stream[i],
        dx = b.x - a.x,
        dz = b.z - a.z,
        t = T.MathUtils.clamp(
          ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1),
          0,
          1,
        ),
        d = segmentDistance(x, z, a, b);
      if (d < nearest) {
        nearest = d;
        bed = T.MathUtils.lerp(a.y, b.y, t) - 0.18;
      }
    }
    const isFall = stream === falls;
    if (nearest < (isFall ? 1.15 : 0.55))
      h = Math.min(
        h,
        T.MathUtils.lerp(
          bed,
          h,
          T.MathUtils.smoothstep(
            nearest,
            isFall ? 0.65 : 0.18,
            isFall ? 1.15 : 0.55,
          ),
        ),
      );
  }
  if (Math.abs(x - 10.5) < 2 && Math.abs(z - crossings[2].z) < 2.2)
    h = Math.min(h, -1.7 + Math.abs(x - 10.5) * 0.4);
  const rd = roadDistance(x, z);
  if (rd < 1.5)
    h = T.MathUtils.lerp(GROUND, h, T.MathUtils.smoothstep(rd, 1.1, 1.5));
  const sd = stationDistance(x, z);
  if (sd < 1.35)
    h = T.MathUtils.lerp(GROUND, h, T.MathUtils.smoothstep(sd, 0.98, 1.35));
  return h;
}
export function surfaceSpeed(kind: PieceKind, surface: Surface) {
  const base =
    kind === "horse"
      ? 4.4
      : kind === "chariot"
        ? 3.8
        : kind === "elephant"
          ? 2.3
          : kind === "general" || kind === "advisor"
            ? 2.6
            : 3;
  return surface === "ferry"
    ? 2.6
    : base *
        {
          dirt: 1,
          mud: 0.72,
          mountain: 0.7,
          imperial: 1.2,
          courtyard: 0.9,
          bridge: 0.84,
          boardwalk: 0.62,
          ferry: 1,
        }[surface];
}
export class MarchPath extends T.CurvePath<T.Vector3> {
  sections: { start: number; end: number; surface: Surface }[] = [];
  travelSeconds(kind: PieceKind) {
    return this.sections.reduce(
      (s, r) => s + (r.end - r.start) / surfaceSpeed(kind, r.surface),
      0,
    );
  }
  progressAtTime(t: number, kind: PieceKind) {
    let time = t * this.travelSeconds(kind);
    for (const r of this.sections) {
      const speed = surfaceSpeed(kind, r.surface),
        dt = (r.end - r.start) / speed;
      if (time <= dt) return (r.start + time * speed) / this.getLength();
      time -= dt;
    }
    return 1;
  }
  surfaceAt(t: number) {
    return (
      (
        this.sections.find((s) => t * this.getLength() <= s.end + 1e-6) ??
        this.sections.at(-1)
      )?.surface ?? "dirt"
    );
  }
  override getPointAt(t: number) {
    return this.getPoint(T.MathUtils.clamp(t, 0, 1));
  }
  override getTangentAt(t: number) {
    return this.getPointAt(Math.min(1, t + 0.0001))
      .sub(this.getPointAt(Math.max(0, t - 0.0001)))
      .normalize();
  }
}
export function getMarchPath(
  from: Position,
  to: Position,
  occupied: Position[] = [],
  kind: PieceKind = "soldier",
) {
  const blocked = new Set(occupied.map(key));
  blocked.delete(key(from));
  blocked.delete(key(to));
  const costs = new Map([[key(from), 0]]),
    open = new Set([key(from)]),
    prev = new Map<string, { parent: string; r: Route; reverse: boolean }>();
  while (open.size) {
    const here = [...open].reduce((a, b) =>
      costs.get(a)! < costs.get(b)! ? a : b,
    );
    open.delete(here);
    if (here === key(to)) {
      const steps: { r: Route; reverse: boolean }[] = [];
      let c = here;
      while (c !== key(from)) {
        const p = prev.get(c)!;
        steps.unshift(p);
        c = p.parent;
      }
      const path = new MarchPath();
      for (const { r, reverse } of steps) {
        const pts = reverse ? r.points.slice().reverse() : r.points,
          start = path.curves.length ? path.getLength() : 0;
        for (let i = 1; i < pts.length; i++)
          if (pts[i - 1].distanceToSquared(pts[i]) > 1e-12)
            path.add(new T.LineCurve3(pts[i - 1], pts[i]));
        path.updateArcLengths();
        path.sections.push({
          start,
          end: path.getLength(),
          surface: r.surface,
        });
      }
      return path;
    }
    for (const r of routes) {
      const reverse = r.to === here,
        next = reverse ? r.from : r.from === here ? r.to : null;
      if (!next || blocked.has(next)) continue;
      const weight =
          r.surface === "ferry"
            ? 1.2
            : r.surface === "mountain" || r.surface === "boardwalk"
              ? 1.3
              : kind === "horse"
                ? 0.75
                : 1,
        cost = costs.get(here)! + r.length * weight;
      if (cost < (costs.get(next) ?? Infinity)) {
        costs.set(next, cost);
        prev.set(next, { parent: here, r, reverse });
        open.add(next);
      }
    }
  }
  throw Error(`No physical route: ${key(from)} -> ${key(to)}`);
}
