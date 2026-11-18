import { useEffect, useRef } from "react";

import { COS, SIN } from "@/components/marketing/iso";
import { cn } from "@/lib/cn";

/**
 * Hero background: an isometric floor of ENS names in faint mono type. Every so often a name
 * lights up in ENS blue, types itself out and resolves to its address, then settles back into
 * the floor. Hovering a name resolves it too. The centre is masked in CSS so the headline sits
 * on a quiet floor. Paused when offscreen; one still frame under reduced motion.
 */

/** Side of one floor cell, in plane units. A name takes two cells along u. */
const CELL = 64;
/** How long one name stays lit, from lighting up to settling back. */
const LIFE_MS = 4200;
const MAX_LIT = 4;

/** Addresses read from mainnet; each name is also the primary name of its address. */
const names = [
  { name: "nick.eth", address: "0xb8c2…67d5" },
  { name: "vitalik.eth", address: "0xd8dA…6045" },
  { name: "jesse.base.eth", address: "0x2211…7DA9" },
  { name: "envoy1084.eth", address: "0xc0d8…1FE6" },
  { name: "cap.eth", address: "0x035e…17D3" },
  { name: "artii.eth", address: "0x1D84…19f8" },
  { name: "maxi.eth", address: "0xc9E6…e2c8" },
] as const;

interface Slot {
  /** Plane corner of the slot's two cells. */
  readonly u: number;
  readonly v: number;
  readonly name: string;
  readonly address: string;
  /** When the slot last lit up, or `undefined` while it rests. */
  litAt: number | undefined;
}

const smooth = (edge0: number, edge1: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));

  return t * t * (3 - 2 * t);
};

/** Deterministic hash so the names land in the same places every load. */
const hash = (i: number, j: number) => {
  const value = Math.sin(i * 127.1 + j * 311.7) * 43_758.5453;

  return value - Math.floor(value);
};

export function NameField({ className }: { readonly className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return undefined;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let slots: Slot[] = [];
    let lines: (readonly [number, number, number, number])[] = [];
    let width = 0;
    let height = 0;
    let ratio = 1;
    let frame = 0;
    let visible = false;
    let last = 0;
    let nextLight = 0;

    const colors = { ink: "#fff", blue: "#5298ff", font: "monospace" };

    const readColors = () => {
      const style = getComputedStyle(element);
      colors.ink = style.color;
      colors.blue = style.getPropertyValue("--ens-blue").trim() || colors.blue;
      colors.font = style.fontFamily;
    };

    const project = (u: number, v: number) =>
      [width / 2 + (u - v) * COS, height / 2 + (u + v) * SIN] as const;

    const layout = () => {
      const rect = element.getBoundingClientRect();
      width = rect.width;
      height = rect.height;

      ratio = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);

      // The plane range that covers the screen, in whole cells.
      const reach = Math.ceil((width / 2 / COS + height / 2 / SIN) / 2 / CELL) + 1;

      lines = [];
      for (let k = -reach; k <= reach; k++) {
        const [ax, ay] = project(k * CELL, -reach * CELL);
        const [bx, by] = project(k * CELL, reach * CELL);
        const [cx, cy] = project(-reach * CELL, k * CELL);
        const [dx, dy] = project(reach * CELL, k * CELL);
        lines.push([ax, ay, bx, by], [cx, cy, dx, dy]);
      }

      const next: Slot[] = [];
      for (let i = -reach; i < reach; i += 2) {
        for (let j = -reach; j < reach; j++) {
          const roll = hash(i, j);
          if (roll < 0.72) continue;

          const u = i * CELL;
          const v = j * CELL;
          const [x, y] = project(u + CELL, v + CELL / 2);
          if (x < 70 || x > width - 70 || y < 80 || y > height - 40) continue;

          // Keep names out of the middle, where the headline sits behind the CSS mask.
          const centre = Math.hypot(
            (x - width / 2) / (width * 0.36),
            (y - height / 2) / (height * 0.34),
          );
          if (centre < 1) continue;

          const entry = names[Math.floor(roll * 1000) % names.length] ?? names[0];
          next.push({ u, v, ...entry, litAt: undefined });
        }
      }
      slots = next;
    };

    const draw = (time: number) => {
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      context.globalAlpha = 0.07;
      context.strokeStyle = colors.ink;
      context.lineWidth = 1;
      context.beginPath();
      for (const [ax, ay, bx, by] of lines) {
        context.moveTo(ax, ay);
        context.lineTo(bx, by);
      }
      context.stroke();

      // Names are drawn on the floor plane, so the type lies flat like the cells under it.
      context.setTransform(
        ratio * COS,
        ratio * SIN,
        -ratio * COS,
        ratio * SIN,
        (ratio * width) / 2,
        (ratio * height) / 2,
      );
      context.textBaseline = "alphabetic";

      for (const slot of slots) {
        const life = slot.litAt === undefined ? 1 : (time - slot.litAt) / LIFE_MS;
        if (life >= 1) slot.litAt = undefined;

        const { u, v, name, address } = slot;
        const lit =
          slot.litAt === undefined ? 0 : smooth(0, 0.08, life) * (1 - smooth(0.84, 1, life));

        context.font = `500 12px ${colors.font}`;

        if (lit === 0) {
          context.globalAlpha = 0.11;
          context.fillStyle = colors.ink;
          context.fillText(name, u + 10, v + 30);
          continue;
        }

        context.globalAlpha = lit * 0.1;
        context.fillStyle = colors.blue;
        context.fillRect(u + 1, v + 1, CELL * 2 - 2, CELL - 2);
        context.globalAlpha = lit * 0.6;
        context.strokeStyle = colors.blue;
        context.lineWidth = 0.8;
        context.strokeRect(u + 1, v + 1, CELL * 2 - 2, CELL - 2);

        const typed = name.slice(0, Math.ceil(name.length * smooth(0.06, 0.38, life)));
        context.globalAlpha = Math.max(lit, 0.11) * 0.95;
        context.fillStyle = colors.ink;
        context.fillText(typed, u + 10, v + 30);

        if (life < 0.42) {
          const caret = u + 10 + context.measureText(typed).width + 1;
          context.globalAlpha = lit;
          context.fillStyle = colors.blue;
          context.fillRect(caret, v + 20, 6, 12);
          continue;
        }

        context.globalAlpha = smooth(0.42, 0.52, life) * lit;
        context.fillStyle = colors.blue;
        context.font = `500 9.5px ${colors.font}`;
        context.fillText(`→ ${address}`, u + 10, v + 47);
      }

      context.globalAlpha = 1;
    };

    const tick = (time: number) => {
      frame = 0;
      // About 30 frames a second is plenty for a slow background.
      if (time - last > 30) {
        last = time;

        if (time > nextLight) {
          const resting = slots.filter((slot) => slot.litAt === undefined);
          const lit = slots.length - resting.length;
          const pick = resting[Math.floor(Math.random() * resting.length)];
          if (pick && lit < MAX_LIT) pick.litAt = time;
          nextLight = time + 900 + Math.random() * 700;
        }

        draw(time);
      }

      if (visible) frame = requestAnimationFrame(tick);
    };

    const start = () => {
      if (!frame && visible && !reduced) frame = requestAnimationFrame(tick);
    };

    // A still frame: a few names already resolved, spread across the floor.
    const still = () => {
      const now = performance.now();
      for (const [index, slot] of slots.entries()) {
        slot.litAt = index % 7 === 3 ? now - LIFE_MS * 0.6 : undefined;
      }
      draw(now);
    };

    // The canvas ignores pointer events so the hero stays clickable; track the pointer on its host.
    const host = element.parentElement ?? element;

    const onMove = (event: PointerEvent) => {
      if (reduced) return;

      const rect = element.getBoundingClientRect();
      const x = (event.clientX - rect.left - width / 2) / COS;
      const y = (event.clientY - rect.top - height / 2) / SIN;
      const u = (x + y) / 2;
      const v = (y - x) / 2;
      const slot = slots.find(
        (entry) => u >= entry.u && u < entry.u + CELL * 2 && v >= entry.v && v < entry.v + CELL,
      );

      if (slot && slot.litAt === undefined) slot.litAt = performance.now();
    };

    const view = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;

      if (visible) start();
      else if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    });

    const resize = new ResizeObserver(() => {
      layout();
      readColors();
      if (reduced) still();
      else draw(performance.now());
    });

    // Theme switches toggle a class on <html>; the reduced-motion still frame has to be repainted
    // in the new colours because no animation loop will do it.
    const theme = new MutationObserver(() => {
      readColors();
      if (reduced) still();
    });

    layout();
    readColors();
    if (reduced) still();
    else draw(performance.now());
    view.observe(element);
    resize.observe(element);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    host.addEventListener("pointermove", onMove);

    return () => {
      cancelAnimationFrame(frame);
      view.disconnect();
      resize.disconnect();
      theme.disconnect();
      host.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      className={cn("ens-name-field pointer-events-none font-mono text-fd-foreground", className)}
    />
  );
}
