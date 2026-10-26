import * as THREE from "three";

export function createCameraFocus(camera: THREE.PerspectiveCamera, target: THREE.Vector3) {
  type Focus = { id: string; read: () => THREE.Vector3 | undefined; elapsed: number; from: THREE.Vector3; fromOffset: THREE.Vector3; offset: THREE.Vector3 };
  let focus: Focus | null = null;
  const desired = new THREE.Vector3();
  const previous = new THREE.Vector3();
  return {
    get id() { return focus?.id ?? null; },
    focus(id: string, read: () => THREE.Vector3 | undefined, visibility?: (eye: THREE.Vector3, at: THREE.Vector3) => number) {
      const at = read();
      if (!at) return;
      const offset = camera.position.clone().sub(target);
      if (Math.hypot(offset.x, offset.z) < .001) offset.z = 1;
      offset.y = Math.hypot(offset.x, offset.z) * .9;
      offset.normalize().multiplyScalar(7.8);
      if (visibility) {
        const center = at.clone().add(new THREE.Vector3(0, .6, 0));
        const original = offset.clone();
        let best = -1;
        for (const angle of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI * .75, -Math.PI * .75, Math.PI]) {
          const candidate = original.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, angle);
          const score = visibility(center.clone().add(candidate), at);
          if (score > best) { best = score; offset.copy(candidate); }
          if (score === 3) break;
        }
      }
      focus = { id, read, elapsed: 0, from: target.clone(), fromOffset: camera.position.clone().sub(target), offset };
    },
    release() { focus = null; },
    update(delta: number, reduced: boolean) {
      if (!focus) return;
      const at = focus.read();
      if (!at) { focus = null; return; }
      desired.copy(at).add(new THREE.Vector3(0, .6, 0));
      const transitioning = focus.elapsed < .7;
      focus.elapsed = reduced ? .7 : Math.min(.7, focus.elapsed + Math.max(0, delta));
      const t = reduced ? 1 : focus.elapsed / .7;
      const ease = t * t * (3 - 2 * t);
      previous.copy(target);
      target.lerpVectors(focus.from, desired, ease);
      if (transitioning) {
        const offset = focus.fromOffset.clone().lerp(focus.offset, ease);
        camera.position.copy(target).add(offset);
      } else {
        camera.position.add(desired.sub(previous));
        target.copy(at).y += .6;
      }
    },
  };
}
