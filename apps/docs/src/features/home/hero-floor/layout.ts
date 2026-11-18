import { COS, SIN } from "@/components/marketing/iso";

/**
 * Geometry of the hero floor: an isometric plane centred on the hero. Plane point (u, v) sits at
 * screen (width / 2 + (u − v)·cos, height / 2 + (u + v)·sin), and grid lines fall every CELL.
 */

export const CELL = 64;

export type Point = readonly [number, number];

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface FloorLayout {
  readonly width: number;
  readonly height: number;
  /** The badge, headline, lede and buttons: no name plate goes here. */
  readonly clear: Box;
  /** Phones show far fewer plates. */
  readonly compact: boolean;
}

export const PLANE = { ux: COS, uy: SIN, vx: -COS, vy: SIN } as const;

export const toScreen = (width: number, height: number, u: number, v: number): Point => [
  width / 2 + (u - v) * COS,
  height / 2 + (u + v) * SIN,
];

export const toPlane = (width: number, height: number, x: number, y: number): Point => {
  const across = (x - width / 2) / COS;
  const down = (y - height / 2) / SIN;

  return [(across + down) / 2, (down - across) / 2];
};
