import { COS, SIN } from "@/components/marketing/iso";

/**
 * Geometry of the hero floor: an isometric plane centred on the hero. Story cards stand upright
 * above small pads on the floor, two in the band above the headline and two below it, and
 * coloured traces run along the floor grid from pad to pad in story order.
 */

export const CELL = 64;

export type Accent = "blue" | "sky" | "green" | "magenta" | "yellow";

export type Point = readonly [number, number];

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** One card's place: its pad on the plane and on screen, and the card's screen box above it. */
export interface CardSlot {
  readonly pad: Point;
  readonly padX: number;
  readonly padY: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface FloorLayout {
  readonly width: number;
  readonly height: number;
  /** The badge, headline, lede and buttons: nothing else goes here. */
  readonly clear: Box;
  /** Phones show two slots and no traces. */
  readonly compact: boolean;
  readonly slots: readonly CardSlot[];
  /** Plane points from each slot's pad to the next one's. */
  readonly traces: readonly (readonly Point[])[];
}

/** Under the site header nothing is placed. */
const HEADER = 64;
/** How far each pad sits below its card. */
const STEM = 36;

export const PLANE = { ux: COS, uy: SIN, vx: -COS, vy: SIN } as const;

export const toScreen = (width: number, height: number, u: number, v: number): Point => [
  width / 2 + u * PLANE.ux + v * PLANE.vx,
  height / 2 + u * PLANE.uy + v * PLANE.vy,
];

export const toPlane = (width: number, height: number, x: number, y: number): Point => {
  const across = (x - width / 2) / COS;
  const down = (y - height / 2) / SIN;

  return [(across + down) / 2, (down - across) / 2];
};

/** A card centred over a pad, the pad snapped to a grid crossing so traces follow the grid. */
function slot(width: number, height: number, x: number, top: number, size: Point): CardSlot {
  const [cardWidth, cardHeight] = size;
  const [u, v] = toPlane(width, height, x, top + cardHeight + STEM);
  let pad: Point = [Math.round(u / CELL) * CELL, Math.round(v / CELL) * CELL];
  // Snapping can lift the card; step the pad straight down a cell until the card clears `top`.
  while (toScreen(width, height, ...pad)[1] - STEM - cardHeight < top) {
    pad = [pad[0] + CELL, pad[1] + CELL];
  }
  const [padX, padY] = toScreen(width, height, pad[0], pad[1]);
  const left = Math.min(Math.max(padX - cardWidth / 2, 12), width - cardWidth - 12);

  return {
    pad,
    padX,
    padY,
    left,
    top: padY - STEM - cardHeight,
    width: cardWidth,
    height: cardHeight,
  };
}

/** Steps from one pad to the next, alternating along u and v a cell at a time. */
const staircase = ([ua, va]: Point, [ub, vb]: Point): readonly Point[] => {
  const points: Point[] = [[ua, va]];
  let [u, v] = [ua, va];

  while (u !== ub || v !== vb) {
    if (u !== ub) {
      u += Math.sign(ub - u) * CELL;
      points.push([u, v]);
    }
    if (v !== vb) {
      v += Math.sign(vb - v) * CELL;
      points.push([u, v]);
    }
  }

  return points;
};

export function placeFloor(width: number, height: number, clear: Box): FloorLayout {
  if (width < 900) {
    const size: Point = [Math.min(260, width - 32), 118];
    const slots = [
      slot(width, height, width / 2, HEADER + 8, size),
      slot(width, height, width / 2, clear.bottom + 28, size),
    ];

    return { width, height, clear, compact: true, slots, traces: [] };
  }

  // Clockwise round the headline: top left, top right, bottom right, bottom left.
  const size: Point = [250, 132];
  const top = HEADER + 12;
  const bottom = clear.bottom + 32;
  const first = slot(width, height, width * 0.2, top, size);
  const second = slot(width, height, width * 0.8, top, size);
  const third = slot(width, height, width * 0.8, bottom, size);
  const fourth = slot(width, height, width * 0.2, bottom, size);

  // Along the bands the traces step level; down the side the trace bends out round the edge,
  // so the floor beside the headline stays free for names.
  const outward = ([ua, va]: Point, [ub, vb]: Point): readonly Point[] => {
    const corners: Point[] = [
      [ub, va],
      [ua, vb],
    ];
    const outer = corners.toSorted(
      (a, b) =>
        Math.abs(toScreen(width, height, ...b)[0] - width / 2) -
        Math.abs(toScreen(width, height, ...a)[0] - width / 2),
    )[0];

    return [[ua, va], outer ?? [ub, va], [ub, vb]];
  };
  const traces = [
    staircase(first.pad, second.pad),
    outward(second.pad, third.pad),
    staircase(third.pad, fourth.pad),
  ];

  return {
    width,
    height,
    clear,
    compact: false,
    slots: [first, second, third, fourth],
    traces,
  };
}
