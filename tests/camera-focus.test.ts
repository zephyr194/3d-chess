import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createCameraFocus } from "../src/ui/camera-focus";

function fixture() {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(20, 30, 25);
  const target = new THREE.Vector3();
  const focus = createCameraFocus(camera, target);
  return { camera, target, focus };
}

describe("piece camera focus", () => {
  it("centers a moving piece and preserves its orbital offset after settling", () => {
    const { camera, target, focus } = fixture();
    const at = new THREE.Vector3(4, .545, 8);
    focus.focus("red", () => at);
    for (let i = 0; i < 70; i++) focus.update(.016, false);
    expect(target.distanceTo(at.clone().add(new THREE.Vector3(0, .6, 0)))).toBeLessThan(1e-8);
    const offset = camera.position.clone().sub(target);
    at.x += 2;
    focus.update(.016, false);
    expect(camera.position.clone().sub(target).distanceTo(offset)).toBeLessThan(1e-8);
  });
  it("uses the nearest clear azimuth when foreground terrain blocks the piece", () => {
    const { camera, target, focus } = fixture();
    let attempts = 0;
    const at = new THREE.Vector3(3, .545, 2);
    focus.focus("piece", () => at, () => ++attempts < 3 ? 1 : 3);
    focus.update(.016, true);
    expect(attempts).toBe(3);
    expect(camera.position.distanceTo(target)).toBeCloseTo(7.8, 8);
    expect(target.toArray()).toEqual([3, 1.145, 2]);
  });
  it("releases absent pieces and allows manual camera movement", () => {
    const { camera, focus } = fixture();
    let at: THREE.Vector3 | undefined = new THREE.Vector3();
    focus.focus("black", () => at);
    focus.update(.1, false);
    at = undefined;
    const previous = camera.position.clone();
    focus.update(.1, false);
    expect(focus.id).toBeNull();
    expect(camera.position.equals(previous)).toBe(true);
  });
  it("reduced motion centers immediately and release cancels transition", () => {
    const { camera, target, focus } = fixture();
    const at = new THREE.Vector3(3, .545, 2);
    focus.focus("piece", () => at);
    focus.update(.016, true);
    expect(target.toArray()).toEqual([3, 1.145, 2]);
    const offset = camera.position.clone().sub(target);
    expect(offset.length()).toBeCloseTo(7.8, 8);
    expect(offset.y / Math.hypot(offset.x, offset.z)).toBeCloseTo(.9, 8);
    focus.release();
    const previous = camera.position.clone();
    at.x = 99;
    focus.update(.5, false);
    expect(camera.position.equals(previous)).toBe(true);
  });
});
