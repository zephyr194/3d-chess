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
  it("supports complete actor footprints along every road, deck and bank connection", () => {
    const failures: unknown[] = [];
    for (const r of routes) {
      const path = new T.CurvePath<T.Vector3>();
      for (let i = 1; i < r.points.length; i++)
        path.add(new T.LineCurve3(r.points[i - 1], r.points[i]));
      const steps = Math.ceil(r.length / 0.45);
      for (let i = 0; i <= steps; i++) {
        const at = path.getPoint(i / steps);
        map.followMarch(at);
        map.root.updateMatrixWorld(true);
        for (let k = 0; k < 9; k++) {
          const radius = k === 8 ? 0 : 0.44,
            p = at
              .clone()
              .add(
                new T.Vector3(
                  Math.cos((k * Math.PI) / 4) * radius,
                  0,
                  Math.sin((k * Math.PI) / 4) * radius,
                ),
              ),
            ray = new T.Raycaster(
              new T.Vector3(p.x, GROUND + 0.025, p.z),
              new T.Vector3(0, -1, 0),
              0,
              0.08,
            );
          const candidates = support
            .filter(
              (b) =>
                p.x >= b.box.min.x &&
                p.x <= b.box.max.x &&
                p.z >= b.box.min.z &&
                p.z <= b.box.max.z,
            )
            .map((b) => b.o);
          let hit = ray.intersectObjects(
            [...candidates, ...map.decks],
            true,
          )[0];
          if (!hit) {
            const { nx, nz, extent } = map.terrain.userData.grid;
            const gx = Math.max(
                0,
                Math.min(
                  nx - 1,
                  Math.floor(((p.x + extent.x) / (2 * extent.x)) * nx),
                ),
              ),
              gz = Math.max(
                0,
                Math.min(
                  nz - 1,
                  Math.floor(((p.z + extent.z) / (2 * extent.z)) * nz),
                ),
              );
            map.terrain.geometry.setDrawRange((gz * nx + gx) * 6, 6);
            hit = ray.intersectObject(map.terrain)[0];
            if (!hit)
              for (const dz of [-1, 0, 1])
                for (const dx of [-1, 0, 1]) {
                  if (hit) break;
                  const xx = gx + dx,
                    zz = gz + dz;
                  if (xx >= 0 && xx < nx && zz >= 0 && zz < nz) {
                    map.terrain.geometry.setDrawRange((zz * nx + xx) * 6, 6);
                    hit = ray.intersectObject(map.terrain)[0];
                  }
                }
            map.terrain.geometry.setDrawRange(0, Infinity);
          }
          if (!hit || Math.abs(hit.point.y - GROUND) > 0.005)
            failures.push({
              from: r.from,
              to: r.to,
              at: p.toArray(),
              height: hit?.point.y,
            });
        }
      }
    }
    expect(
      failures.slice(0, 12),
      `${failures.length} unsupported samples`,
    ).toEqual([]);
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
  it("carries the actor on a moving ferry and resets at the landing", () => {
    const boat = map.root.getObjectByName("working-ferry")!;
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const p = crossingSpine(0)[0].lerp(crossingSpine(0)[1], t);
      map.followMarch(p);
      map.root.updateMatrixWorld(true);
      const ray = new T.Raycaster(
        new T.Vector3(p.x, GROUND + 0.02, p.z),
        new T.Vector3(0, -1, 0),
        0,
        0.04,
      );
      expect(ray.intersectObject(map.decks[0], true)[0]?.point.y).toBeCloseTo(
        GROUND,
        5,
      );
    }
    map.reset();
    expect(boat.position.z).toBeCloseTo(crossings[0].z + 1.7);
  });
});
