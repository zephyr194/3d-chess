import * as T from "three";
import { describe, expect, it } from "vitest";
import { createBattlefield } from "../src/scene/battlefield";
import { falls, riverCentre, riverWidth } from "../src/scene/landscape-layout";
import { GROUND } from "../src/scene/board";

const map = createBattlefield(new T.Group());
const named = (name: string) => {
  const objects: T.Object3D[] = [];
  map.root.traverse((object) => { if (object.name === name) objects.push(object); });
  return objects;
};
const decorativeNames = new Set([
  "cascade-whitewater", "river-flow-glint", "tributary-current", "cascade-outlet-foam",
  "cascade-spray", "lake-ripple", "windborne-leaf", "mountain-drift", "distant-mist",
  "pine-canopy", "broadleaf-canopy", "meadow-reeds",
]);
const decoration = () => {
  const snapshot: unknown[] = [];
  map.root.traverse((object) => {
    if (!decorativeNames.has(object.name)) return;
    snapshot.push({ name: object.name, position: object.position.toArray(),
      rotation: object.quaternion.toArray(), scale: object.scale.toArray(), visible: object.visible,
      opacity: object instanceof T.Mesh ? object.material.opacity : undefined,
      vertices: object.name === "cascade-whitewater" && object instanceof T.Mesh
        ? Array.from(object.geometry.getAttribute("position").array) : undefined,
      instances: object instanceof T.InstancedMesh ? Array.from(object.instanceMatrix.array) : undefined });
  });
  return snapshot;
};

describe("visible flow and exclusive road surfaces", () => {
  it("moves waterfall traces downhill along the real cascade arc", () => {
    const traces = named("cascade-whitewater").slice(0, 12);
    map.update(100, false);
    const before = traces.map((trace) => trace.position.clone());
    map.update(300, false);
    for (const [index, trace] of traces.entries()) {
      expect(trace.position.y).toBeLessThan(before[index].y);
      let nearest = Infinity;
      for (let i = 1; i < falls.length; i++) {
        const a = falls[i - 1], delta = falls[i].clone().sub(a),
          t = T.MathUtils.clamp(trace.position.clone().sub(a).dot(delta) / delta.lengthSq(), 0, 1);
        nearest = Math.min(nearest, trace.position.distanceTo(a.clone().addScaledVector(delta, t)));
      }
      expect(nearest).toBeLessThan(1e-7);
    }
  });

  it("keeps river glints on the curved channel while flowing downstream", () => {
    const glints = named("river-flow-glint");
    map.update(0, true);
    const lanes = glints.map((glint) =>
      (glint.position.z - riverCentre(glint.position.x)) / riverWidth(glint.position.x));
    map.update(1100, false);
    const before = glints.map((glint) => glint.position.x);
    map.update(1200, false);
    glints.forEach((glint, i) => {
      expect(glint.position.z).toBeCloseTo(riverCentre(glint.position.x) + lanes[i] * riverWidth(glint.position.x), 8);
      const moved = glint.position.x - before[i];
      if (moved < 1) expect(moved).toBeLessThan(0);
    });
  });

  it("restores every decorative transform and freezes it exactly with motion disabled", () => {
    map.update(0, true);
    const rest = decoration(), support = map.decks.map((deck) => deck.matrix.toArray());
    map.update(2400, false);
    expect(decoration()).not.toEqual(rest);
    map.update(2500, true);
    expect(decoration()).toEqual(rest);
    map.update(9900, true);
    expect(decoration()).toEqual(rest);
    expect(map.decks.map((deck) => deck.matrix.toArray())).toEqual(support);
  });

  it("gives each sampled road cap point exactly one visible top face", () => {
    const caps = [...named("stream-crossing-deck"), ...named("bridge-paving"), ...named("cliff-plank")];
    map.root.updateMatrixWorld(true);
    let samples = 0;
    for (const cap of caps) {
      if (!(cap instanceof T.Mesh)) continue;
      const positions = cap.geometry.getAttribute("position"), index = cap.geometry.index,
        count = index ? index.count : positions.count;
      const point = (i: number) => new T.Vector3().fromBufferAttribute(positions, index ? index.getX(i) : i).applyMatrix4(cap.matrixWorld);
      for (let i = 0; i < count; i += 3) {
        const a = point(i), b = point(i + 1), c = point(i + 2);
        if ([a, b, c].some((p) => Math.abs(p.y - (GROUND + .002)) > 1e-6)) continue;
        if (i % 111 !== 0 && count > 111) continue;
        const p = a.multiplyScalar(.23).addScaledVector(b, .31).addScaledVector(c, .46),
          ray = new T.Raycaster(p.clone().setY(GROUND + .02), new T.Vector3(0, -1, 0), 0, .03),
          hits = ray.intersectObjects(caps, false).filter((hit) => Math.abs(hit.point.y - p.y) < 1e-6);
        expect(hits.length, `top faces at ${p.toArray()}`).toBe(1);
        samples++;
      }
    }
    expect(samples).toBeGreaterThan(100);
    expect(named("inset-road-masonry")).toEqual([]);
  });
});
