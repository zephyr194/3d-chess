import * as T from "three";
export const GROUND = 0.54,
  BASE = 0.545,
  SPACING = 3.2,
  FILE_SPACING = 4.4,
  PIECE_SCALE = 0.68,
  RIVER_GAP = 2.68;
export const BOARD_BOUNDS = {
  halfWidth: FILE_SPACING * 4,
  halfDepth: SPACING * 4.5 + RIVER_GAP / 2,
  width: FILE_SPACING * 8,
  depth: SPACING * 9 + RIVER_GAP,
};
export const boardPosition = (p: { x: number; y: number }) =>
  new T.Vector3(
    (p.x - 4) * FILE_SPACING,
    BASE,
    (p.y - 4.5) * SPACING + (p.y < 5 ? -RIVER_GAP / 2 : RIVER_GAP / 2),
  );
export function nearestPosition(p: T.Vector3) {
  let best = null,
    d = Infinity;
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 9; x++) {
      const v = boardPosition({ x, y }),
        n = Math.hypot(v.x - p.x, v.z - p.z);
      if (n < d) {
        d = n;
        best = { x, y };
      }
    }
  return d < SPACING * 0.65 ? best : null;
}
export function frameCamera(camera: T.PerspectiveCamera, overview = false) {
  const hw = BOARD_BOUNDS.halfWidth + (overview ? 7.4 : 1.3),
    hd = BOARD_BOUNDS.halfDepth + (overview ? 8.25 : 1.75);
  const dir = new T.Vector3(camera.aspect < 0.9 ? 0 : 1.8, overview ? 29 : 40, 21).normalize();
  const right = new T.Vector3().crossVectors(camera.up, dir).normalize(),
    up = new T.Vector3().crossVectors(dir, right).normalize();
  const target = new T.Vector3(0, 0, 0),
    tan = Math.tan(T.MathUtils.degToRad(camera.fov / 2));
  let dist = 0;
  const pts = [-hw, hw].flatMap((x) =>
    [-hd, hd].flatMap((z) =>
      [0.54, overview ? 9 : 2.4].map((y) => new T.Vector3(x, y, z)),
    ),
  );
  for (let k = 0; k < 8; k++) {
    dist = 0;
    for (const p of pts) {
      const v = p.clone().sub(target);
      dist = Math.max(
        dist,
        v.dot(dir) + Math.abs(v.dot(right)) / (tan * camera.aspect * 0.96),
        v.dot(dir) + Math.abs(v.dot(up)) / (tan * 0.94),
      );
    }
    const xs = pts.map((p) => {
        const v = p.clone().sub(target);
        return v.dot(right) / (dist - v.dot(dir));
      }),
      ys = pts.map((p) => {
        const v = p.clone().sub(target);
        return v.dot(up) / (dist - v.dot(dir));
      });
    target
      .addScaledVector(right, ((Math.min(...xs) + Math.max(...xs)) * dist) / 2)
      .addScaledVector(up, ((Math.min(...ys) + Math.max(...ys)) * dist) / 2);
  }
  camera.position.copy(target).addScaledVector(dir, dist);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  return target;
}
