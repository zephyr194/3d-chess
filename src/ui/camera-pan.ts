import * as THREE from "three";
import { BOARD_BOUNDS } from "../scene/board";

const directionKeys: Record<string, readonly [number, number]> = {
  KeyW: [0, 1], ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

export function createCameraPan(camera: THREE.PerspectiveCamera, target: THREE.Vector3, canvas: HTMLCanvasElement) {
  const held = new Set<string>();
  const right = new THREE.Vector3(), forward = new THREE.Vector3(), offset = new THREE.Vector3();
  const clear = () => held.clear();
  const isControl = (node: EventTarget | null) => node instanceof Element && Boolean(node.closest(
    'input, textarea, select, button, summary, a, [role="dialog"], [contenteditable]:not([contenteditable="false"])',
  ));
  window.addEventListener("keydown", (event) => {
    if (!directionKeys[event.code] || event.altKey || event.ctrlKey || event.metaKey || isControl(event.target)) return;
    held.add(event.code);
    event.preventDefault();
  });
  window.addEventListener("keyup", (event) => { held.delete(event.code); });
  window.addEventListener("blur", clear);
  document.addEventListener("visibilitychange", clear);
  document.addEventListener("focusin", (event) => { if (isControl(event.target)) clear(); });
  canvas.addEventListener("pointerdown", () => canvas.focus({ preventScroll: true }));
  return {
    clear,
    update(deltaSeconds: number) {
      let x = 0, z = 0;
      for (const code of held) {
        const direction = directionKeys[code];
        x += direction[0]; z += direction[1];
      }
      const length = Math.hypot(x, z);
      if (!length) return;
      right.set(1, 0, 0).applyQuaternion(camera.quaternion).setY(0).normalize();
      forward.set(right.z, 0, -right.x);
      const speed = THREE.MathUtils.clamp(camera.position.distanceTo(target) * .3, 2.2, 18);
      offset.copy(right).multiplyScalar(x).addScaledVector(forward, z)
        .multiplyScalar(speed * Math.min(.05, Math.max(0, deltaSeconds)) / length);
      offset.x = THREE.MathUtils.clamp(target.x + offset.x, -BOARD_BOUNDS.halfWidth - 8, BOARD_BOUNDS.halfWidth + 8) - target.x;
      offset.z = THREE.MathUtils.clamp(target.z + offset.z, -BOARD_BOUNDS.halfDepth - 8, BOARD_BOUNDS.halfDepth + 8) - target.z;
      camera.position.add(offset);
      target.add(offset);
    },
  };
}
