import { type RefObject, useEffect, useRef } from "react";

import { cn } from "@/lib/cn";

import {
  type Accent,
  CELL,
  type FloorLayout,
  PLANE,
  type Point,
  toPlane,
  toScreen,
} from "./layout";
import { type FloorName, floorNames } from "./names";

/**
 * The hero floor itself: the isometric grid, ENS names on flat tiles, the pads under the story
 * cards and the traces between them. Each tile changes to the next name on its own timer, and
 * now and then one lights up and resolves an address or a text record. Pulses run the traces in
 * story order from the moment each story starts. One canvas, one animation loop, paused when
 * offscreen; a still frame under reduced motion.
 */

export interface StoryClock {
  /** When the current story started, on the `performance.now()` clock. */
  start: number;
  /** The accent of each card in the story, in slot order. */
  accents: readonly Accent[];
}

/** A tile's size at scale 1; tiles come in three sizes, scattered with a gap between them. */
const TILE_WIDTH = 152;
const TILE_HEIGHT = 52;
const TILE_GAP = 22;
const SCALES = [0.82, 0.94, 1.06] as const;
const LIFE_MS = 4600;
const SWAP_MS = 1400;
const MAX_LIT = 3;
/** Time for a pulse to cross one trace; the story's traces pulse one after another. */
const PULSE_MS = 1500;
const accents: readonly Accent[] = ["blue", "sky", "green", "magenta", "yellow"];
const accentVars: Record<Accent, string> = {
  blue: "--ens-blue",
  sky: "--ens-sky",
  green: "--ens-contracts",
  magenta: "--ens-react",
  yellow: "--ens-hca",
};

interface Tile {
  u: number;
  v: number;
  scale: number;
  /** How bright the tile sits at rest, so some read nearer than others. */
  depth: number;
  accent: Accent;
  entry: FloorName;
  showText: boolean;
  litAt: number | undefined;
  /** When the tile next fades to a new name, and when the current fade began. */
  swapAt: number;
  fadeFrom: number | undefined;
}

interface Trace {
  readonly points: readonly Point[];
  readonly lengths: readonly number[];
  readonly length: number;
}

const smooth = (edge0: number, edge1: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));

  return t * t * (3 - 2 * t);
};

const pointAt = (trace: Trace, at: number): Point => {
  const index = trace.lengths.findIndex((length) => length >= at);
  if (index <= 0) return trace.points[0] ?? [0, 0];

  const before = trace.lengths[index - 1] ?? 0;
  const after = trace.lengths[index] ?? before;
  const [au, av] = trace.points[index - 1] ?? [0, 0];
  const [bu, bv] = trace.points[index] ?? [0, 0];
  const t = after === before ? 0 : (at - before) / (after - before);

  return [au + (bu - au) * t, av + (bv - av) * t];
};

export function FloorCanvas({
  layout,
  clock,
  className,
}: {
  readonly layout: FloorLayout;
  readonly clock: RefObject<StoryClock>;
  readonly className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    const host = element?.parentElement;
    if (!element || !context || !host) return undefined;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const { width, height, clear, slots, compact } = layout;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    element.width = Math.round(width * ratio);
    element.height = Math.round(height * ratio);

    const style = getComputedStyle(element);
    const ink = style.color;
    const font = style.fontFamily;
    const read = (accent: Accent) => style.getPropertyValue(accentVars[accent]).trim() || ink;
    const color: Record<Accent, string> = {
      blue: read("blue"),
      sky: read("sky"),
      green: read("green"),
      magenta: read("magenta"),
      yellow: read("yellow"),
    };
    const project = (u: number, v: number) => toScreen(width, height, u, v);

    const images = new Map<string, HTMLImageElement>();
    for (const { avatar } of floorNames) {
      if (!avatar || images.has(avatar)) continue;

      const image = new Image();
      image.decoding = "async";
      image.src = avatar;
      images.set(avatar, image);
    }

    // The plane range that covers the screen, in whole cells.
    const reach =
      Math.ceil(
        Math.max(
          ...[
            [0, 0],
            [width, 0],
            [0, height],
            [width, height],
          ].flatMap(([x = 0, y = 0]) => toPlane(width, height, x, y).map(Math.abs)),
        ) / CELL,
      ) + 1;
    const lines: (readonly [number, number, number, number])[] = [];
    for (let k = -reach; k <= reach; k++) {
      const [ax, ay] = project(k * CELL, -reach * CELL);
      const [bx, by] = project(k * CELL, reach * CELL);
      const [cx, cy] = project(-reach * CELL, k * CELL);
      const [dx, dy] = project(reach * CELL, k * CELL);
      lines.push([ax, ay, bx, by], [cx, cy, dx, dy]);
    }

    const traces: Trace[] = layout.traces.map((points) => {
      const lengths = [0];
      for (let point = 1; point < points.length; point++) {
        const [au, av] = points[point - 1] ?? [0, 0];
        const [bu, bv] = points[point] ?? [0, 0];
        lengths.push((lengths.at(-1) ?? 0) + Math.hypot(bu - au, bv - av));
      }

      return { points, lengths, length: lengths.at(-1) ?? 0 };
    });

    // Tiles stay whole on screen, and off the headline, the cards, the pads, the traces and each
    // other.
    const tiles: Tile[] = [];
    const blocked = (u: number, v: number, w: number, h: number, self?: Tile) => {
      const points = [project(u, v), project(u + w, v), project(u, v + h), project(u + w, v + h)];
      const screen = points.every(
        ([x, y]) => x > 12 && x < width - 12 && y > 76 && y < height - 24,
      );
      if (!screen) return true;

      // A tile can straddle a box without a corner inside it, so test its centre too.
      points.push(project(u + w / 2, v + h / 2));
      const hits = (left: number, top: number, right: number, bottom: number) =>
        points.some(([x, y]) => x > left && x < right && y > top && y < bottom);

      if (hits(clear.left - 40, clear.top - 24, clear.right + 40, clear.bottom + 24)) return true;
      if (
        slots.some((slot) =>
          hits(slot.left - 24, slot.top - 20, slot.left + slot.width + 24, slot.padY + 24),
        )
      ) {
        return true;
      }

      const near = (left: number, top: number, right: number, bottom: number, gap: number) =>
        u < right + gap && u + w > left - gap && v < bottom + gap && v + h > top - gap;

      if (
        tiles.some(
          (tile) =>
            tile !== self &&
            near(
              tile.u,
              tile.v,
              tile.u + TILE_WIDTH * tile.scale,
              tile.v + TILE_HEIGHT * tile.scale,
              TILE_GAP,
            ),
        )
      ) {
        return true;
      }

      return layout.traces.some((trace) =>
        trace.slice(1).some(([bu, bv], index) => {
          const [au = 0, av = 0] = trace[index] ?? [];
          return near(Math.min(au, bu), Math.min(av, bv), Math.max(au, bu), Math.max(av, bv), 24);
        }),
      );
    };

    // A seeded scatter, so the first frame is the same on every load; later moves are random.
    let seed = 1084;
    const seeded = () => {
      seed = (seed + 0x6d_2b_79_f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    };
    const span = reach * CELL;

    /** Somewhere free for a tile of this scale, or `undefined` after enough tries. */
    const findSpot = (scale: number, random: () => number, self?: Tile) => {
      for (let attempt = 0; attempt < 400; attempt++) {
        const u = (random() * 2 - 1) * span;
        const v = (random() * 2 - 1) * span;
        if (!blocked(u, v, TILE_WIDTH * scale, TILE_HEIGHT * scale, self)) return [u, v] as const;
      }

      return undefined;
    };

    const now = performance.now();
    let used = 0;
    const nextName = () => floorNames[used++ % floorNames.length];
    const target = compact ? 10 : 46;
    for (let index = 0; index < target; index++) {
      const scale = (SCALES[Math.floor(seeded() * SCALES.length)] ?? 1) * (compact ? 0.78 : 1);
      const spot = findSpot(scale, seeded);
      const entry = nextName();
      if (!spot || !entry) continue;

      const roll = seeded();
      tiles.push({
        u: spot[0],
        v: spot[1],
        scale,
        depth: 0.6 + seeded() * 0.4,
        accent: accents[Math.floor(seeded() * accents.length)] ?? "blue",
        entry,
        showText: roll > 0.6,
        litAt: undefined,
        swapAt: now + 1500 + roll * 14_000,
        fadeFrom: undefined,
      });
    }

    let frame = 0;
    let visible = false;
    let last = 0;
    let nextLight = 0;

    const avatar = (
      src: string | undefined,
      u: number,
      v: number,
      radius: number,
      alpha: number,
    ) => {
      const image = src ? images.get(src) : undefined;
      if (!image?.complete || image.naturalWidth === 0) return false;

      context.save();
      context.globalAlpha = alpha;
      context.beginPath();
      context.arc(u, v, radius, 0, Math.PI * 2);
      context.clip();
      context.drawImage(image, u - radius, v - radius, radius * 2, radius * 2);
      context.restore();

      return true;
    };

    const drawTile = (tile: Tile, time: number) => {
      context.save();
      context.translate(tile.u, tile.v);
      context.scale(tile.scale, tile.scale);
      paintTile(tile, time);
      context.restore();
    };

    /** Draws a tile in its own space: origin at its corner, at scale 1. */
    const paintTile = (tile: Tile, time: number) => {
      const u = 0;
      const v = 0;
      const { entry } = tile;
      const accent = color[tile.accent];
      const life = tile.litAt === undefined ? 1 : (time - tile.litAt) / LIFE_MS;
      const lit =
        tile.litAt === undefined ? 0 : smooth(0, 0.08, life) * (1 - smooth(0.86, 1, life));
      // A swap dips the tile out and back in with the new name.
      const fade =
        tile.fadeFrom === undefined ? 1 : Math.abs(1 - (2 * (time - tile.fadeFrom)) / SWAP_MS);
      const rest = 0.4 * fade * tile.depth;
      const left = u + (entry.avatar ? 34 : 19);

      context.globalAlpha = 0.07 * fade + lit * 0.06;
      context.fillStyle = accent;
      context.fillRect(u + 1, v + 1, TILE_WIDTH - 2, TILE_HEIGHT - 2);
      context.globalAlpha = Math.max(rest * 0.5, lit * 0.55);
      context.strokeStyle = accent;
      context.lineWidth = 0.8;
      context.strokeRect(u + 1, v + 1, TILE_WIDTH - 2, TILE_HEIGHT - 2);
      context.globalAlpha = Math.max(rest, lit);
      context.fillRect(u + 1, v + 1, 3, TILE_HEIGHT - 2);

      if (!avatar(entry.avatar, u + 19, v + TILE_HEIGHT / 2, 9, Math.max(rest * 1.6, lit))) {
        context.globalAlpha = Math.max(rest, lit);
        context.beginPath();
        context.arc(u + 11, v + TILE_HEIGHT / 2, 2.5, 0, Math.PI * 2);
        context.fill();
      }

      const text = tile.showText ? entry.text : undefined;
      context.globalAlpha = Math.max(rest * 0.8, lit * 0.9);
      context.fillStyle = accent;
      context.font = `600 8.5px ${font}`;
      context.fillText((text?.[0] ?? "addr").toUpperCase(), left, v + 16);

      const typed =
        lit > 0
          ? entry.name.slice(0, Math.ceil(entry.name.length * smooth(0.08, 0.36, life)))
          : entry.name;
      context.globalAlpha = Math.max(rest * 1.4, lit);
      context.fillStyle = ink;
      context.font = `500 11px ${font}`;
      context.fillText(typed, left, v + 30);

      if (lit > 0 && life < 0.4) {
        const caret = left + context.measureText(typed).width + 1;
        context.globalAlpha = lit;
        context.fillStyle = accent;
        context.fillRect(caret, v + 21, 5, 11);
        return;
      }

      context.globalAlpha = Math.max(rest * 0.9, smooth(0.4, 0.5, life) * lit * 0.85);
      context.fillStyle = ink;
      context.font = `400 9px ${font}`;
      context.fillText(`→ ${text?.[1] ?? entry.address}`, left, v + 43);
    };

    const drawTraces = (time: number) => {
      const story = clock.current;
      const elapsed = time - story.start;

      for (const [index, trace] of traces.entries()) {
        const accent = color[story.accents[index + 1] ?? "blue"];

        context.globalAlpha = 0.4;
        context.strokeStyle = accent;
        context.lineWidth = 1;
        context.beginPath();
        for (const [point, [u, v]] of trace.points.entries()) {
          if (point === 0) context.moveTo(u, v);
          else context.lineTo(u, v);
        }
        context.stroke();

        if (reduced) continue;

        // The story's traces pulse in order, twice per story: card 1 → 2, then 2 → 3, then 3 → 4.
        const cycle = traces.length * PULSE_MS + 1500;
        const phase = ((elapsed - 400) % cycle) / PULSE_MS - index;
        if (elapsed < 400 || phase < 0 || phase > 1) continue;

        const head = trace.length * smooth(0, 1, phase);
        const tail = Math.max(0, head - 90);
        context.globalAlpha = 1;
        context.lineWidth = 1.8;
        context.beginPath();
        for (let at = tail; at <= head; at += 4) {
          const [u, v] = pointAt(trace, at);
          if (at === tail) context.moveTo(u, v);
          else context.lineTo(u, v);
        }
        context.stroke();
        const [hu, hv] = pointAt(trace, head);
        context.fillStyle = accent;
        context.beginPath();
        context.arc(hu, hv, 3, 0, Math.PI * 2);
        context.fill();
      }
    };

    const drawPads = () => {
      for (const [index, slot] of slots.entries()) {
        const accent = color[clock.current.accents[index] ?? "blue"];
        const [u, v] = slot.pad;

        context.globalAlpha = 0.18;
        context.fillStyle = accent;
        context.fillRect(u - 14, v - 14, 28, 28);
        context.globalAlpha = 0.9;
        context.strokeStyle = accent;
        context.lineWidth = 1.2;
        context.strokeRect(u - 14, v - 14, 28, 28);
      }
    };

    const draw = (time: number) => {
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      context.globalAlpha = 0.07;
      context.strokeStyle = ink;
      context.lineWidth = 1;
      context.beginPath();
      for (const [ax, ay, bx, by] of lines) {
        context.moveTo(ax, ay);
        context.lineTo(bx, by);
      }
      context.stroke();

      // Everything else lies flat on the floor plane.
      context.setTransform(
        ratio * PLANE.ux,
        ratio * PLANE.uy,
        ratio * PLANE.vx,
        ratio * PLANE.vy,
        (ratio * width) / 2,
        (ratio * height) / 2,
      );
      context.textBaseline = "alphabetic";

      for (const tile of tiles) {
        if (tile.litAt !== undefined && time - tile.litAt >= LIFE_MS) tile.litAt = undefined;

        if (tile.litAt === undefined && tile.fadeFrom === undefined && time > tile.swapAt) {
          tile.fadeFrom = time;
        }
        // Halfway through the fade, while the tile is out, it moves somewhere new with a new name.
        if (
          tile.fadeFrom !== undefined &&
          time - tile.fadeFrom > SWAP_MS / 2 &&
          tile.swapAt <= time
        ) {
          const scale =
            (SCALES[Math.floor(Math.random() * SCALES.length)] ?? 1) * (compact ? 0.78 : 1);
          const spot = findSpot(scale, Math.random, tile);
          if (spot) {
            [tile.u, tile.v] = spot;
            tile.scale = scale;
            tile.depth = 0.6 + Math.random() * 0.4;
            tile.accent = accents[Math.floor(Math.random() * accents.length)] ?? tile.accent;
          }
          tile.entry = nextName() ?? tile.entry;
          tile.showText = !tile.showText && Boolean(tile.entry.text);
          tile.swapAt = time + 6000 + Math.random() * 10_000;
        }
        if (tile.fadeFrom !== undefined && time - tile.fadeFrom > SWAP_MS)
          tile.fadeFrom = undefined;

        drawTile(tile, time);
      }
      drawTraces(time);
      drawPads();

      context.globalAlpha = 1;
    };

    const tick = (time: number) => {
      frame = 0;
      if (time - last > 30) {
        last = time;

        if (time > nextLight) {
          const resting = tiles.filter(
            (tile) => tile.litAt === undefined && tile.fadeFrom === undefined,
          );
          const pick = resting[Math.floor(Math.random() * resting.length)];
          if (pick && tiles.length - resting.length < MAX_LIT) pick.litAt = time;
          nextLight = time + 1400 + Math.random() * 1000;
        }

        draw(time);
      }

      if (visible) frame = requestAnimationFrame(tick);
    };

    const onMove = (event: PointerEvent) => {
      if (reduced) return;

      const rect = element.getBoundingClientRect();
      const [u, v] = toPlane(width, height, event.clientX - rect.left, event.clientY - rect.top);
      const tile = tiles.find(
        (entry) =>
          u >= entry.u &&
          u < entry.u + TILE_WIDTH * entry.scale &&
          v >= entry.v &&
          v < entry.v + TILE_HEIGHT * entry.scale,
      );

      if (tile && tile.litAt === undefined) tile.litAt = performance.now();
    };

    const view = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;

      if (visible && !frame && !reduced) frame = requestAnimationFrame(tick);
      if (!visible && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    });

    const repaint = () => draw(performance.now());
    for (const image of images.values()) image.addEventListener("load", repaint, { once: true });

    repaint();
    // The story clock is set just after this effect runs; paint once more with its colours.
    const settle = requestAnimationFrame(repaint);
    view.observe(element);
    host.addEventListener("pointermove", onMove);

    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(settle);
      view.disconnect();
      host.removeEventListener("pointermove", onMove);
      for (const image of images.values()) image.removeEventListener("load", repaint);
    };
  }, [layout, clock]);

  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      className={cn("ens-name-field pointer-events-none font-mono text-fd-foreground", className)}
    />
  );
}
