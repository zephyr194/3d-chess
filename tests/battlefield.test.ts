import * as T from "three";
import { describe, it, expect } from "vitest";
import { boardPosition, GROUND, BASE, PIECE_SCALE } from "../src/scene/board";
import {
  routes,
  nodes,
  getMarchPath,
  crossings,
  crossingSpine,
  terrainHeight,
  MarchPath,
  lakes,
  watercourses,
  waterAt,
  WATER,
} from "../src/scene/landscape-layout";
import { createBattlefield } from "../src/scene/battlefield";
import { initialState, legalMoves, applyMove } from "../src/game/xiangqi";
const map = createBattlefield(new T.Group());
map.root.updateMatrixWorld(true);
const support: { o: T.Object3D; box: T.Box3 }[] = [];
map.roadGroup.traverse((o) => {
  if (o instanceof T.Mesh)
    support.push({ o, box: new T.Box3().setFromObject(o) });
});
function ferryPath(direction: number) {
  const points = crossingSpine(0);
  if (direction < 0) points.reverse();
  const path = new MarchPath();
  path.add(new T.LineCurve3(points[0], points[1]));
  path.sections.push({ start: 0, end: path.getLength(), surface: "ferry" });
  return path;
}
function unsupportedFootprint(at: T.Vector3) {
  map.root.updateMatrixWorld(true);
  const failures: unknown[] = [];
  for (let k = 0; k < 9; k++) {
    const radius = k === 8 ? 0 : 0.44,
      p = at.clone().add(new T.Vector3(Math.cos(k * Math.PI / 4) * radius, 0,
        Math.sin(k * Math.PI / 4) * radius)),
      ray = new T.Raycaster(new T.Vector3(p.x, GROUND + 0.025, p.z), new T.Vector3(0, -1, 0), 0, 0.08);
    const candidates = support.filter((b) => p.x >= b.box.min.x && p.x <= b.box.max.x &&
      p.z >= b.box.min.z && p.z <= b.box.max.z).map((b) => b.o);
    let hit = ray.intersectObjects([...candidates, ...map.decks], true)[0];
    if (!hit) {
      const { nx, nz, extent } = map.terrain.userData.grid,
        gx = Math.max(0, Math.min(nx - 1, Math.floor((p.x + extent.x) / (2 * extent.x) * nx))),
        gz = Math.max(0, Math.min(nz - 1, Math.floor((p.z + extent.z) / (2 * extent.z) * nz)));
      for (const dz of [0, -1, 1])
        for (const dx of [0, -1, 1]) {
          if (hit) break;
          const xx = gx + dx, zz = gz + dz;
          if (xx >= 0 && xx < nx && zz >= 0 && zz < nz) {
            map.terrain.geometry.setDrawRange((zz * nx + xx) * 6, 6);
            hit = ray.intersectObject(map.terrain)[0];
          }
        }
      map.terrain.geometry.setDrawRange(0, Infinity);
    }
    if (!hit || Math.abs(hit.point.y - GROUND) > 0.005)
      failures.push({ at: p.toArray(), height: hit?.point.y });
  }
  return failures;
}
describe("restored continuous battlefield", () => {
  it("keeps all 90 logical stations aligned and physically level, with small troops", () => {
    expect(PIECE_SCALE).toBe(0.68);
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < 9; x++) {
        const p = boardPosition({ x, y });
        expect(p.y).toBe(BASE);
        expect(p.x).toBeCloseTo(boardPosition({ x, y: 0 }).x);
        expect(p.z).toBeCloseTo(boardPosition({ x: 0, y }).z);
        expect(terrainHeight(p.x, p.z)).toBeCloseTo(GROUND, 8);
        const ray = new T.Raycaster(
          new T.Vector3(p.x, 15, p.z),
          new T.Vector3(0, -1, 0),
        );
        expect(ray.intersectObject(map.terrain)[0]?.point.y).toBeCloseTo(
          GROUND,
          5,
        );
      }
  });
  it("has one terrain mesh, three real crossing models and physical station pins", () => {
    expect(map.terrain.geometry.attributes.position.count).toBeGreaterThan(
      30000,
    );
    for (const c of crossings)
      expect(map.root.getObjectByName(c.id)).toBeTruthy();
    expect(
      (map.root.getObjectByName("station-stone-pins") as T.InstancedMesh).count,
    ).toBe(90);
    expect(map.root.getObjectByName("headwater-cascade")).toBeTruthy();
  });
  it("retains interior mountains and connected groves between the travel corridors", () => {
    let interiorTrees = 0;
    const at = new T.Matrix4(), position = new T.Vector3();
    map.root.traverse((object) => {
      if (!(object instanceof T.InstancedMesh) || object.name !== "forest-trunks") return;
      for (let i = 0; i < object.count; i++) {
        object.getMatrixAt(i, at); position.setFromMatrixPosition(at);
        if (Math.abs(position.x) < 12.8 && Math.abs(position.z) < 15.74) interiorTrees++;
      }
    });
    expect(interiorTrees).toBeGreaterThanOrEqual(25);
    const heights: number[] = [];
    const positionAttribute = map.terrain.geometry.getAttribute("position");
    for (let i = 0; i < positionAttribute.count; i++) {
      if (Math.abs(positionAttribute.getX(i)) < 12.8 && Math.abs(positionAttribute.getZ(i)) < 15.74)
        heights.push(positionAttribute.getY(i));
    }
    expect(Math.max(...heights)).toBeGreaterThan(2.4);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(3.2);
  });
  it("renders the same connected watershed into exposed lake and tributary surfaces", () => {
    const downstream = new Map([
      ...lakes.map((lake) => [lake.id, lake.outflow] as const),
      ...watercourses.map((course) => [course.id, course.joins] as const),
    ]);
    for (const start of downstream.keys()) {
      let next = start;
      const seen = new Set<string>();
      while (next !== "main-river") {
        expect(seen.has(next)).toBe(false);
        seen.add(next);
        expect(downstream.has(next)).toBe(true);
        next = downstream.get(next)!;
      }
    }
    for (const lake of lakes) {
      const outlet = watercourses.find((course) => course.id === lake.outflow)!;
      expect(outlet.points[0].distanceTo(new T.Vector3(lake.x, lake.surfaceY, lake.z))).toBeLessThan(1e-9);
    }
    for (const [index, lake] of lakes.entries()) {
      const surface = map.root.getObjectByName(`lake-${index}`)!;
      const ray = new T.Raycaster(new T.Vector3(lake.x, 15, lake.z), new T.Vector3(0, -1, 0));
      const actualWater = ray.intersectObject(surface)[0], actualBed = ray.intersectObject(map.terrain)[0];
      expect(actualWater?.point.y).toBeCloseTo(lake.surfaceY, 5);
      expect(actualBed.point.y).toBeLessThan(lake.surfaceY - .15);
    }
    for (const course of watercourses) {
      const surface = map.root.getObjectByName(course.id)!;
      expect(surface).toBeInstanceOf(T.Mesh);
      let visibleSamples = 0;
      for (let i = 1; i < course.points.length; i++) {
        const point = course.points[i - 1].clone().lerp(course.points[i], .5);
        if (!waterAt(point.x, point.z)) continue;
        const ray = new T.Raycaster(new T.Vector3(point.x, 15, point.z), new T.Vector3(0, -1, 0));
        const actualWater = ray.intersectObject(surface)[0], actualBed = ray.intersectObject(map.terrain)[0];
        if (actualWater && actualBed.point.y < actualWater.point.y - .04) visibleSamples++;
      }
      expect(visibleSamples, course.id).toBeGreaterThan(0);
    }
    const crossings: T.Mesh[] = [];
    map.roadGroup.traverse((object) => {
      if (object instanceof T.Mesh && object.name === "stream-crossing-deck") crossings.push(object);
    });
    expect(crossings.length).toBeGreaterThan(4);
    for (const bridge of crossings) {
      const bounds = new T.Box3().setFromObject(bridge);
      expect(bounds.min.y).toBeGreaterThan(WATER + .3);
      expect(bounds.max.y).toBeCloseTo(GROUND, 2);
    }
  });
  it("uses a pointed displacement hull with open water between the vessel and opposite landing", () => {
    map.reset();
    const hull = map.root.getObjectByName("ferry-hull") as T.Mesh;
    const positions = hull.geometry.getAttribute("position"), bounds = new T.Box3().setFromBufferAttribute(positions as T.BufferAttribute);
    expect(bounds.max.z - bounds.min.z).toBeLessThan(3.4);
    expect(bounds.min.y).toBeLessThan(WATER);
    expect(bounds.max.y).toBeGreaterThan(WATER);
    let bowHalfWidth = 0, middleHalfWidth = 0;
    for (let i = 0; i < positions.count; i++) {
      const z = positions.getZ(i), x = Math.abs(positions.getX(i));
      if (Math.abs(z) > 1.4) bowHalfWidth = Math.max(bowHalfWidth, x);
      if (Math.abs(z) < 1.3) middleHalfWidth = Math.max(middleHalfWidth, x);
    }
    expect(bowHalfWidth).toBeLessThan(middleHalfWidth * .15);
    expect(map.root.getObjectByName("ferry-steering-oar")).toBeTruthy();
    expect(map.root.getObjectByName("ferry-side-rib")).toBeTruthy();
    const boat = map.root.getObjectByName("working-ferry")!;
    const passengerDeck = map.root.getObjectByName("continuous-ferry-deck")!;
    const deckBounds = new T.Box3().setFromObject(passengerDeck);
    expect(deckBounds.max.z - deckBounds.min.z).toBeGreaterThan(.88);
    expect(deckBounds.max.x - deckBounds.min.x).toBeGreaterThan(.88);
    expect(Math.abs(boat.position.z - crossings[0].z)).toBe(1.7);
    const acrossWater = new T.Vector3(crossings[0].x, 3, crossings[0].z - 1.15);
    const ray = new T.Raycaster(acrossWater, new T.Vector3(0, -1, 0));
    expect(ray.intersectObjects(map.decks, true)).toEqual([]);
  });
  it("moves actual foliage and water while keeping terrain, trunks and transport fixed", () => {
    map.reset(); map.update(0, true);
    const canopy = map.root.getObjectByName("pine-canopy") as T.InstancedMesh,
      trunks = map.root.getObjectByName("forest-trunks") as T.InstancedMesh,
      river = map.root.getObjectByName("river-flow-glint")!,
      current = map.root.getObjectByName("tributary-current")!,
      ripple = map.root.getObjectByName("lake-ripple")!,
      leaf = map.root.getObjectByName("windborne-leaf")!,
      boat = map.root.getObjectByName("working-ferry")!,
      rest = Array.from(canopy.instanceMatrix.array),
      staticTrunks = Array.from(trunks.instanceMatrix.array),
      staticTerrain = Array.from(map.terrain.geometry.getAttribute("position").array),
      boatPosition = boat.position.clone(),
      riverPosition = river.position.clone(), currentPosition = current.position.clone();
    map.update(2000, false);
    expect(Array.from(canopy.instanceMatrix.array)).not.toEqual(rest);
    expect(river.position.distanceTo(riverPosition)).toBeGreaterThan(.01);
    expect(current.position.distanceTo(currentPosition)).toBeGreaterThan(.01);
    expect(ripple.scale.x).not.toBe(1);
    expect(leaf.visible).toBe(true);
    expect(Array.from(trunks.instanceMatrix.array)).toEqual(staticTrunks);
    expect(Array.from(map.terrain.geometry.getAttribute("position").array)).toEqual(staticTerrain);
    expect(boat.position.equals(boatPosition)).toBe(true);
    map.update(2500, true);
    expect(Array.from(canopy.instanceMatrix.array)).toEqual(rest);
    expect(river.position.equals(riverPosition)).toBe(true);
    expect(current.position.equals(currentPosition)).toBe(true);
    expect(ripple.scale.toArray()).toEqual([1, 1, 1]);
    expect(leaf.visible).toBe(false);
    map.update(9000, true);
    expect(Array.from(canopy.instanceMatrix.array)).toEqual(rest);
    expect(river.position.equals(riverPosition)).toBe(true);
    map.update(9000, false);
    expect(Array.from(canopy.instanceMatrix.array)).not.toEqual(rest);
    map.update(9000, true);
  });
  it("connects every station through independent roads, without logical grid edges", () => {
    const reached = new Set(["0,0"]),
      queue = ["0,0"];
    for (let i = 0; i < queue.length; i++)
      for (const r of routes) {
        const next =
          r.from === queue[i] ? r.to : r.to === queue[i] ? r.from : null;
        if (next && !reached.has(next)) {
          reached.add(next);
          queue.push(next);
        }
      }
    expect(reached.size).toBe(nodes.size);
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < 9; x++) expect(reached.has(`${x},${y}`)).toBe(true);
    expect(
      routes.some((r) => /^\d,\d$/.test(r.from) && /^\d,\d$/.test(r.to)),
    ).toBe(false);
  });
  it("supports complete actor footprints along every static road, deck and bank connection", () => {
    const failures: unknown[] = [];
    for (const r of routes) {
      if (r.surface === "ferry") continue;
      const path = new T.CurvePath<T.Vector3>();
      for (let i = 1; i < r.points.length; i++)
        path.add(new T.LineCurve3(r.points[i - 1], r.points[i]));
      const steps = Math.ceil(r.length / 0.45);
      for (let i = 0; i <= steps; i++)
        failures.push(...unsupportedFootprint(path.getPoint(i / steps)));
    }
    expect(failures.slice(0, 12), `${failures.length} unsupported samples`).toEqual([]);
  }, 30000);
  it("keeps every legal endpoint routable across 10 real turns without changing chess rules", () => {
    let state = initialState();
    for (let turn = 0; turn < 10; turn++) {
      const moves = state.pieces
        .filter((p) => p.side === state.turn)
        .flatMap((p) => legalMoves(state, p).map((to) => ({ p, to })));
      expect(moves.length).toBeGreaterThan(0);
      for (const { p, to } of moves) {
        const path = getMarchPath(p, to, state.pieces, p.kind);
        expect(path.getPointAt(0).distanceTo(boardPosition(p))).toBeLessThan(
          1e-8,
        );
        expect(path.getPointAt(1).distanceTo(boardPosition(to))).toBeLessThan(
          1e-8,
        );
        expect(
          path.getSpacedPoints(10).every((p) => Math.abs(p.y - BASE) < 1e-9),
        ).toBe(true);
        expect(path.travelSeconds(p.kind)).toBeGreaterThan(0);
      }
      const m = moves[(turn * 17 + 3) % moves.length];
      state = applyMove(state, m.p.id, m.to)!.state;
    }
  });
  it("waits for the opposite-bank ferry and supports walking aboard, riding and exiting in both directions", () => {
    map.reset();
    const boat = map.root.getObjectByName("working-ferry")!;
    for (const direction of [1, -1, -1, 1]) {
      const expectsWait = Math.abs(boat.position.z - (crossings[0].z - direction * 1.7)) > 1e-8;
      const path = ferryPath(direction), march = map.startMarch(path, "cannon");
      const observed = new Set<string>();
      let previousBoat = boat.position.z, previousDistance = 0;
      const failures: unknown[] = [];
      for (let elapsed = 0; elapsed <= march.durationSeconds + 1 / 60; elapsed += 1 / 60) {
        const frame = march.advance(1 / 60);
        expect(frame.status).toBe("active");
        if (frame.status !== "active") throw new Error("Unexpected cancellation");
        expect(Math.abs(boat.position.z - previousBoat)).toBeLessThanOrEqual(2.6 / 60 + 1e-9);
        expect(frame.distance).toBeGreaterThanOrEqual(previousDistance);
        observed.add(frame.motion);
        const at = path.getPointAt(frame.distance / path.getLength());
        failures.push(...unsupportedFootprint(at));
        expect(at.y).toBe(BASE);
        if (frame.motion === "waiting") {
          expect(frame.distance).toBe(0);
          const berth = crossings[0].z - direction * 1.7;
          expect(Math.abs(boat.position.z - berth)).toBeLessThanOrEqual(Math.abs(previousBoat - berth));
        }
        if (frame.motion === "riding") expect(at.z).toBeCloseTo(boat.position.z, 8);
        if (frame.motion === "walking") expect(Math.abs(boat.position.z - crossings[0].z)).toBeCloseTo(1.7, 8);
        previousBoat = boat.position.z;
        previousDistance = frame.distance;
        if (frame.done) {
          expect(frame.distance).toBeCloseTo(path.getLength(), 8);
          expect(march.advance(10)).toEqual(frame);
          expect(march.advance(0)).toEqual(frame);
          break;
        }
      }
      expect(observed.has("walking")).toBe(true);
      expect(observed.has("riding")).toBe(true);
      expect(observed.has("waiting")).toBe(expectsWait);
      expect(failures.slice(0, 12), `${failures.length} unsupported samples`).toEqual([]);
    }
    map.reset();
    expect(boat.position.z).toBeCloseTo(crossings[0].z + 1.7);
  }, 30000);
  it("supports every exact ferry phase boundary and conserves elapsed time across partitions", () => {
    const path = ferryPath(1);
    const wait = 3.4 / 2.6, board = 0.9 / (3 * 0.62), ride = 3.4 / 2.6;
    const times = [0, wait, wait + board, wait + board + ride, wait + 2 * board + ride];
    for (const boundary of times)
      for (const offset of [-1e-8, 0, 1e-8]) {
        map.reset();
        const march = map.startMarch(path, "cannon"), time = Math.max(0, boundary + offset);
        const frame = march.advance(time);
        if (frame.status !== "active") throw new Error("Unexpected cancellation");
        expect(unsupportedFootprint(path.getPointAt(frame.distance / path.getLength()))).toEqual([]);
        const boatZ = map.root.getObjectByName("working-ferry")!.position.z;
        map.reset();
        const split = map.startMarch(path, "cannon");
        for (let i = 0; i < 20; i++) split.advance(time / 20);
        const partitioned = split.advance(0);
        if (partitioned.status !== "active") throw new Error("Unexpected cancellation");
        expect(partitioned.distance).toBeCloseTo(frame.distance, 8);
        expect(map.root.getObjectByName("working-ferry")!.position.z).toBeCloseTo(boatZ, 8);
      }
  });
  it("invalidates stale journeys during every ferry phase and after repeated resets and new trips", () => {
    const path = ferryPath(1), boat = map.root.getObjectByName("working-ferry")!;
    const wait = 3.4 / 2.6, board = 0.9 / (3 * 0.62), ride = 3.4 / 2.6;
    for (const time of [wait / 2, wait + board / 2, wait + board + ride / 2, wait + board + ride + board / 2]) {
      map.reset();
      const stale = map.startMarch(path, "cannon");
      stale.advance(time);
      map.reset(); map.reset();
      const restored = boat.position.clone();
      expect(stale.advance(10)).toEqual({ status: "cancelled" });
      expect(boat.position.equals(restored)).toBe(true);
      const fresh = map.startMarch(path, "horse");
      fresh.advance(0.1);
      const moving = boat.position.clone();
      expect(stale.advance(100)).toEqual({ status: "cancelled" });
      expect(boat.position.equals(moving)).toBe(true);
      expect(fresh.advance(0.1).status).toBe("active");
    }
    const replaced = map.startMarch(path, "cannon");
    replaced.advance(0.2);
    const active = map.startMarch(path, "cannon");
    active.advance(0.1);
    const currentBoat = boat.position.clone();
    expect(replaced.advance(100)).toEqual({ status: "cancelled" });
    expect(boat.position.equals(currentBoat)).toBe(true);
    for (const delta of [-1, NaN, Infinity]) expect(() => active.advance(delta)).toThrow(RangeError);
    map.reset();
  });
  it("plays a rule-authorized cannon trip without unsupported route transitions", () => {
    map.reset();
    const state = initialState(), cannon = state.pieces.find((p) => p.side === "red" && p.x === 1 && p.y === 7)!;
    const to = { x: 1, y: 3 };
    expect(applyMove(state, cannon.id, to)).toBeTruthy();
    const path = getMarchPath(cannon, to, state.pieces, cannon.kind), march = map.startMarch(path, cannon.kind);
    const failures: unknown[] = [];
    for (let time = 0; time < march.durationSeconds + 1 / 60; time += 1 / 60) {
      const frame = march.advance(1 / 60);
      if (frame.status !== "active") throw new Error("Unexpected cancellation");
      failures.push(...unsupportedFootprint(path.getPointAt(frame.distance / path.getLength())));
      if (frame.done) break;
    }
    expect(failures.slice(0, 12), `${failures.length} unsupported samples`).toEqual([]);
    map.reset();
  }, 30000);
});
