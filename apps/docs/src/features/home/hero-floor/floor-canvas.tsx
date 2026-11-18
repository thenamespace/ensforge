import { useEffect, useRef } from "react";

import { COS, SIN } from "@/components/marketing/iso";
import { cn } from "@/lib/cn";

import { type Accent, CELL, type FloorLayout, type Point, toScreen } from "./layout";
import { type FloorName, floorNames } from "./names";

/**
 * The hero floor itself: the isometric grid, ENS names on tiles in faint mono type, and the
 * coloured traces between the component cards. Every so often a tile lights up in its accent,
 * types its name and resolves an address or a text record; pulses travel the traces between
 * related cards. Hovering a tile resolves it too. Paused when offscreen; one still frame under
 * reduced motion.
 */

/** A tile takes three cells along u. */
const SPAN = 3;
const LIFE_MS = 4600;
const MAX_LIT = 5;
const PULSE_MS = 2200;
const accents: readonly Accent[] = ["blue", "sky", "green", "magenta", "yellow"];
const accentVars: Record<Accent, string> = {
  blue: "--ens-blue",
  sky: "--ens-sky",
  green: "--ens-contracts",
  magenta: "--ens-react",
  yellow: "--ens-hca",
};

interface Tile {
  readonly u: number;
  readonly v: number;
  readonly accent: Accent;
  entry: FloorName;
  /** Which record the tile resolves to next: its address or its text record. */
  showText: boolean;
  litAt: number | undefined;
}

interface Trace {
  readonly accent: Accent;
  readonly points: readonly Point[];
  readonly lengths: readonly number[];
  readonly length: number;
  /** Offset so the traces pulse in turn rather than together. */
  readonly delay: number;
}

const smooth = (edge0: number, edge1: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));

  return t * t * (3 - 2 * t);
};

/** Deterministic hash so the tiles land in the same places every load. */
const hash = (i: number, j: number) => {
  const value = Math.sin(i * 127.1 + j * 311.7) * 43_758.5453;

  return value - Math.floor(value);
};

export function FloorCanvas({
  layout,
  className,
}: {
  readonly layout: FloorLayout;
  readonly className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    const host = element?.parentElement;
    if (!element || !context || !host) return undefined;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const { width, height, clear, cards } = layout;
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
    const reach = Math.ceil((width / 2 / COS + height / 2 / SIN) / 2 / CELL) + 1;
    const lines: (readonly [number, number, number, number])[] = [];
    for (let k = -reach; k <= reach; k++) {
      const [ax, ay] = project(k * CELL, -reach * CELL);
      const [bx, by] = project(k * CELL, reach * CELL);
      const [cx, cy] = project(-reach * CELL, k * CELL);
      const [dx, dy] = project(reach * CELL, k * CELL);
      lines.push([ax, ay, bx, by], [cx, cy, dx, dy]);
    }

    // Tiles stay off the headline and off the cards, with a little air around both.
    const onCard = (u: number, v: number) =>
      cards.some(
        (card) =>
          u < card.u + card.w + 16 &&
          u + CELL * SPAN > card.u - 16 &&
          v < card.v + card.h + 16 &&
          v + CELL > card.v - 16,
      );
    const onHeadline = (u: number, v: number) => {
      const [x, y] = project(u + (CELL * SPAN) / 2, v + CELL / 2);

      return (
        x > clear.left - 70 && x < clear.right + 70 && y > clear.top - 20 && y < clear.bottom + 20
      );
    };

    const tiles: Tile[] = [];
    let used = 0;
    for (let i = -reach; i < reach; i += SPAN) {
      for (let j = -reach; j < reach; j++) {
        const roll = hash(i, j);
        if (roll < 0.35) continue;

        const u = i * CELL;
        const v = j * CELL;
        const [x, y] = project(u + (CELL * SPAN) / 2, v + CELL / 2);
        if (x < 90 || x > width - 90 || y < 84 || y > height - 30) continue;
        if (onCard(u, v) || onHeadline(u, v)) continue;

        const entry = floorNames[used++ % floorNames.length] ?? floorNames[0];
        if (!entry) continue;

        tiles.push({
          u,
          v,
          accent: accents[Math.floor(hash(j, i) * accents.length)] ?? "blue",
          entry,
          showText: roll > 0.8,
          litAt: undefined,
        });
      }
    }

    const traces: Trace[] = layout.traces.map((trace, index) => {
      const lengths = [0];
      for (let point = 1; point < trace.points.length; point++) {
        const [au, av] = trace.points[point - 1] ?? [0, 0];
        const [bu, bv] = trace.points[point] ?? [0, 0];
        lengths.push((lengths.at(-1) ?? 0) + Math.hypot(bu - au, bv - av));
      }

      return { ...trace, lengths, length: lengths.at(-1) ?? 0, delay: index * 900 };
    });

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
      const { u, v, entry } = tile;
      const accent = color[tile.accent];
      const life = tile.litAt === undefined ? 1 : (time - tile.litAt) / LIFE_MS;
      const lit =
        tile.litAt === undefined ? 0 : smooth(0, 0.08, life) * (1 - smooth(0.86, 1, life));
      const hasAvatar = Boolean(entry.avatar);
      const left = u + (hasAvatar ? 40 : 18);

      if (lit === 0) {
        context.globalAlpha = 0.55;
        context.fillStyle = accent;
        context.fillRect(u + 3, v + 3, 4, 4);
        if (!avatar(entry.avatar, u + 20, v + CELL / 2, 10, 0.35) && !hasAvatar) {
          context.beginPath();
          context.arc(u + 10, v + CELL / 2 - 4, 2, 0, Math.PI * 2);
          context.fill();
        }

        context.globalAlpha = 0.2;
        context.fillStyle = ink;
        context.font = `500 12px ${font}`;
        context.fillText(entry.name, left, v + 37);
        return;
      }

      const tileWidth = CELL * SPAN - 2;
      context.globalAlpha = lit * 0.08;
      context.fillStyle = accent;
      context.fillRect(u + 1, v + 1, tileWidth, CELL - 2);
      context.globalAlpha = lit * 0.55;
      context.strokeStyle = accent;
      context.lineWidth = 0.8;
      context.strokeRect(u + 1, v + 1, tileWidth, CELL - 2);
      context.globalAlpha = lit;
      context.fillRect(u + 1, v + 1, 3, CELL - 2);

      if (avatar(entry.avatar, u + 22, v + CELL / 2, 12, lit)) {
        context.globalAlpha = lit;
        context.strokeStyle = accent;
        context.beginPath();
        context.arc(u + 22, v + CELL / 2, 12, 0, Math.PI * 2);
        context.stroke();
      }

      const text = tile.showText ? entry.text : undefined;
      context.globalAlpha = lit * 0.9;
      context.fillStyle = accent;
      context.font = `600 8.5px ${font}`;
      context.fillText((text?.[0] ?? "addr").toUpperCase(), left, v + 20);

      const typed = entry.name.slice(0, Math.ceil(entry.name.length * smooth(0.08, 0.36, life)));
      context.globalAlpha = Math.max(lit, 0.2) * 0.95;
      context.fillStyle = ink;
      context.font = `500 12px ${font}`;
      context.fillText(typed, left, v + 37);

      if (life < 0.4) {
        const caret = left + context.measureText(typed).width + 1;
        context.globalAlpha = lit;
        context.fillStyle = accent;
        context.fillRect(caret, v + 27, 6, 12);
        return;
      }

      context.globalAlpha = smooth(0.4, 0.5, life) * lit * 0.85;
      context.fillStyle = ink;
      context.font = `400 9.5px ${font}`;
      context.fillText(`→ ${text?.[1] ?? entry.address}`, left, v + 52);
    };

    const tracePoint = (trace: Trace, at: number): Point => {
      const index = trace.lengths.findIndex((length) => length >= at);
      if (index <= 0) return trace.points[0] ?? [0, 0];

      const before = trace.lengths[index - 1] ?? 0;
      const after = trace.lengths[index] ?? before;
      const [au, av] = trace.points[index - 1] ?? [0, 0];
      const [bu, bv] = trace.points[index] ?? [0, 0];
      const t = after === before ? 0 : (at - before) / (after - before);

      return [au + (bu - au) * t, av + (bv - av) * t];
    };

    const drawTrace = (trace: Trace, time: number) => {
      const accent = color[trace.accent];

      context.globalAlpha = 0.4;
      context.strokeStyle = accent;
      context.lineWidth = 1;
      context.beginPath();
      for (const [index, [u, v]] of trace.points.entries()) {
        if (index === 0) context.moveTo(u, v);
        else context.lineTo(u, v);
      }
      context.stroke();

      if (reduced) return;

      // One pulse per cycle: a short bright run with a solid head, and a pause before the next.
      const cycle = PULSE_MS * 2;
      const phase = ((time + trace.delay) % cycle) / PULSE_MS;
      if (phase > 1) return;

      const head = trace.length * smooth(0, 1, phase);
      context.globalAlpha = 1;
      context.lineWidth = 1.6;
      context.beginPath();
      for (let at = Math.max(0, head - 70); at <= head; at += 6) {
        const [u, v] = tracePoint(trace, at);
        if (at === Math.max(0, head - 70)) context.moveTo(u, v);
        else context.lineTo(u, v);
      }
      context.stroke();
      const [hu, hv] = tracePoint(trace, head);
      context.fillStyle = accent;
      context.beginPath();
      context.arc(hu, hv, 2.6, 0, Math.PI * 2);
      context.fill();
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
        ratio * COS,
        ratio * SIN,
        -ratio * COS,
        ratio * SIN,
        (ratio * width) / 2,
        (ratio * height) / 2,
      );
      context.textBaseline = "alphabetic";

      for (const trace of traces) drawTrace(trace, time);
      for (const tile of tiles) {
        if (tile.litAt !== undefined && time - tile.litAt >= LIFE_MS) {
          tile.litAt = undefined;
          tile.showText = !tile.showText && Boolean(tile.entry.text);
        }
        drawTile(tile, time);
      }

      context.globalAlpha = 1;
    };

    const tick = (time: number) => {
      frame = 0;
      if (time - last > 30) {
        last = time;

        if (time > nextLight) {
          const resting = tiles.filter((tile) => tile.litAt === undefined);
          const pick = resting[Math.floor(Math.random() * resting.length)];
          if (pick && tiles.length - resting.length < MAX_LIT) pick.litAt = time;
          nextLight = time + 700 + Math.random() * 600;
        }

        draw(time);
      }

      if (visible) frame = requestAnimationFrame(tick);
    };

    // A still frame: a few tiles already resolved, spread across the floor.
    const still = () => {
      const now = performance.now();
      for (const [index, tile] of tiles.entries()) {
        tile.litAt = index % 6 === 2 ? now - LIFE_MS * 0.6 : undefined;
      }
      draw(now);
    };

    const onMove = (event: PointerEvent) => {
      if (reduced) return;

      const rect = element.getBoundingClientRect();
      const across = (event.clientX - rect.left - width / 2) / COS;
      const down = (event.clientY - rect.top - height / 2) / SIN;
      const u = (across + down) / 2;
      const v = (down - across) / 2;
      const tile = tiles.find(
        (entry) => u >= entry.u && u < entry.u + CELL * SPAN && v >= entry.v && v < entry.v + CELL,
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

    const repaint = () => (reduced ? still() : draw(performance.now()));
    for (const image of images.values()) image.addEventListener("load", repaint, { once: true });

    repaint();
    view.observe(element);
    host.addEventListener("pointermove", onMove);

    return () => {
      cancelAnimationFrame(frame);
      view.disconnect();
      host.removeEventListener("pointermove", onMove);
      for (const image of images.values()) image.removeEventListener("load", repaint);
    };
  }, [layout]);

  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      className={cn("ens-name-field pointer-events-none font-mono text-fd-foreground", className)}
    />
  );
}
