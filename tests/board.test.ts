import * as T from "three";
import { describe, expect, it } from "vitest";
import { BASE, BOARD_BOUNDS, FILE_SPACING, SPACING, boardPosition, frameCamera, nearestPosition } from "../src/scene/board";

describe("wider battlefield coordinates", () => {
  it("adds real horizontal room while retaining rank spacing and level stations", () => {
    expect(BOARD_BOUNDS.width).toBeCloseTo(35.2);
    expect(BOARD_BOUNDS.width / 25.6).toBeCloseTo(1.375);
    expect(boardPosition({ x: 8, y: 4 }).x - boardPosition({ x: 0, y: 4 }).x).toBe(BOARD_BOUNDS.width);
    expect(boardPosition({ x: 3, y: 3 }).distanceTo(boardPosition({ x: 4, y: 3 }))).toBeCloseTo(FILE_SPACING);
    expect(boardPosition({ x: 3, y: 3 }).distanceTo(boardPosition({ x: 3, y: 2 }))).toBeCloseTo(SPACING);
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < 9; x++) {
        const at = boardPosition({ x, y });
        expect(at.y).toBe(BASE);
        expect(nearestPosition(at)).toEqual({ x, y });
      }
    const openValley = boardPosition({ x: 2, y: 2 }).lerp(boardPosition({ x: 3, y: 2 }), .5);
    expect(nearestPosition(openValley)).toBeNull();
  });

  it.each([1440 / 850, 390 / 470])("frames the outer pieces at aspect %s", (aspect) => {
    const camera = new T.PerspectiveCamera(41, aspect, .8, 220);
    frameCamera(camera);
    for (const x of [0, 8]) for (const y of [0, 9]) for (const height of [BASE, 2.4]) {
      const projected = boardPosition({ x, y }).setY(height).project(camera);
      expect(Math.abs(projected.x)).toBeLessThan(1);
      expect(Math.abs(projected.y)).toBeLessThan(1);
    }
  });
});
