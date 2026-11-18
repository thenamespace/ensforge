import { COS, SIN } from "@/components/marketing/iso";

/**
 * Geometry of the hero floor. The floor is an isometric plane centred on the hero: plane point
 * (u, v) sits at screen (width / 2 + (u − v)·cos, height / 2 + (u + v)·sin). Component cards lie
 * on the plane in the bands above and below the headline, and coloured traces run between them
 * along the floor grid.
 */

export const CELL = 64;

export type Accent = "blue" | "sky" | "green" | "magenta" | "yellow";

export type CardId =
  | "profile"
  | "primary"
  | "migrate"
  | "records"
  | "batch"
  | "subname"
  | "register";

export type Point = readonly [number, number];

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** A card's top-left corner and size on the plane. */
export interface FloorCard {
  readonly id: CardId;
  readonly u: number;
  readonly v: number;
  readonly w: number;
  readonly h: number;
}

/** A trace between two cards: plane points, stepping along the grid. */
export interface Trace {
  readonly accent: Accent;
  readonly points: readonly Point[];
}

export interface FloorLayout {
  readonly width: number;
  readonly height: number;
  /** The headline, lede and buttons: names stay clear of it. */
  readonly clear: Box;
  readonly cards: readonly FloorCard[];
  readonly traces: readonly Trace[];
}

/** Under the site header nothing is placed. */
const HEADER = 64;

const sizes: Record<CardId, readonly [w: number, h: number]> = {
  profile: [212, 150],
  primary: [212, 92],
  migrate: [196, 104],
  records: [212, 124],
  batch: [204, 124],
  subname: [204, 104],
  register: [196, 116],
};

export const toScreen = (width: number, height: number, u: number, v: number): Point => [
  width / 2 + (u - v) * COS,
  height / 2 + (u + v) * SIN,
];

const toPlane = (width: number, height: number, x: number, y: number): Point => {
  const across = (x - width / 2) / COS;
  const down = (y - height / 2) / SIN;

  return [(across + down) / 2, (down - across) / 2];
};

const snap = (value: number) => Math.round(value / (CELL / 4)) * (CELL / 4);

/** A card centred on a screen point, its corner snapped to a quarter cell so it sits on the grid. */
const cardAt = (width: number, height: number, id: CardId, x: number, y: number): FloorCard => {
  const [w, h] = sizes[id];
  const [u, v] = toPlane(width, height, x, y);

  return { id, u: snap(u - w / 2), v: snap(v - h / 2), w, h };
};

/** Steps from one card's centre to another's, alternating along u and v, so traces run level. */
const staircase = (from: FloorCard, to: FloorCard): readonly Point[] => {
  const [ua, va] = [from.u + from.w / 2, from.v + from.h / 2];
  const [ub, vb] = [to.u + to.w / 2, to.v + to.h / 2];
  const steps = Math.max(1, Math.round(Math.max(Math.abs(ub - ua), Math.abs(vb - va)) / CELL));
  const points: Point[] = [[ua, va]];

  for (let step = 1; step <= steps; step++) {
    const u = ua + ((ub - ua) * step) / steps;
    const [, previousV] = points.at(-1) ?? [ua, va];
    points.push([u, previousV], [u, va + ((vb - va) * step) / steps]);
  }

  return points;
};

export function placeFloor(width: number, height: number, clear: Box): FloorLayout {
  const top = (HEADER + clear.top) / 2;
  const bottom = (clear.bottom + height) / 2;

  // Phones: one card above the headline and one below it, without traces.
  if (width < 900) {
    return {
      width,
      height,
      clear,
      cards: [
        cardAt(width, height, "profile", width / 2, top),
        cardAt(width, height, "batch", width / 2, bottom),
      ],
      traces: [],
    };
  }

  const at = (id: CardId, x: number, y: number) => cardAt(width, height, id, width * x, y);
  const profile = at("profile", 0.15, top);
  const primary = at("primary", 0.5, top);
  const migrate = at("migrate", 0.85, top);
  const records = at("records", 0.13, bottom);
  const batch = at("batch", 0.38, bottom);
  const subname = at("subname", 0.62, bottom);
  const register = at("register", 0.87, bottom);

  return {
    width,
    height,
    clear,
    cards: [profile, primary, migrate, records, batch, subname, register],
    traces: [
      { accent: "sky", points: staircase(profile, primary) },
      { accent: "blue", points: staircase(primary, migrate) },
      { accent: "magenta", points: staircase(records, batch) },
      { accent: "yellow", points: staircase(batch, subname) },
      { accent: "green", points: staircase(subname, register) },
    ],
  };
}
