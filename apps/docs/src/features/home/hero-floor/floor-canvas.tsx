import { useEffect, useRef } from "react";

import { SIN } from "@/components/marketing/iso";
import { cn } from "@/lib/cn";

import { CELL, type FloorLayout, PLANE, toScreen } from "./layout";
import { type FloorName, floorNames } from "./names";

/**
 * The hero floor: an isometric grid with ENS names on flat plates. Each plate fills a row of grid
 * cells. It lifts out of the floor, types its name, pops in its avatar, types the address the
 * name resolves to, settles an accent edge, holds, and sinks away; a new name then rises in
 * another free spot. Plates never touch, so the floor never clumps. One canvas and one animation
 * loop, paused when offscreen; a still set of written plates under reduced motion.
 */

/** A plate covers three cells along u and one along v. */
const SPAN = 3;
const RISE_MS = 650;
const SINK_MS = 900;
/** Typing speed for the name and the address, and the pauses around them. */
const NAME_CHAR_MS = 55;
const ADDRESS_CHAR_MS = 28;
const TYPE_DELAY_MS = 250;
const POP_MS = 320;
const accentVars = ["--ens-blue", "--ens-sky", "--ens-contracts", "--ens-react", "--ens-hca"];

interface Plate {
  /** Its first grid cell. */
  readonly i: number;
  readonly j: number;
  readonly entry: FloorName;
  readonly accent: string;
  /** How bright it sits, so some plates read nearer than others. */
  readonly depth: number;
  readonly born: number;
  /** Its whole life, rise to sink, between ten and fourteen seconds. */
  readonly life: number;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const expoOut = (value: number) => (value >= 1 ? 1 : 1 - 2 ** (-10 * clamp(value)));
const easeIn = (value: number) => clamp(value) ** 2;
/** A small overshoot, for the avatar popping in. */
const backOut = (value: number) => {
  const t = clamp(value) - 1;

  return 1 + 2.4 * t ** 3 + 1.4 * t ** 2;
};

/** When each step of a plate's life ends, in milliseconds after it was born. */
const timeline = (entry: FloorName) => {
  const name = TYPE_DELAY_MS + entry.name.length * NAME_CHAR_MS;
  const pop = name + POP_MS;
  const address = name + 180 + entry.address.length * ADDRESS_CHAR_MS;

  return { name, pop, address, settle: address + 450 };
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
    if (!element || !context) return undefined;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const { width, height, clear, compact } = layout;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    element.width = Math.round(width * ratio);
    element.height = Math.round(height * ratio);

    const style = getComputedStyle(element);
    const ink = style.color;
    const font = style.fontFamily;
    const accents = accentVars.map((name) => style.getPropertyValue(name).trim() || ink);
    const project = (u: number, v: number) => toScreen(width, height, u, v);

    const images = new Map<string, HTMLImageElement>();
    for (const { avatar } of floorNames) {
      if (!avatar || images.has(avatar)) continue;

      const image = new Image();
      image.decoding = "async";
      image.src = avatar;
      images.set(avatar, image);
    }

    // The grid lines, and the range of cells that covers the screen.
    const reach = Math.ceil((width / 2 / PLANE.ux + height / 2 / PLANE.uy) / 2 / CELL) + 1;
    const lines: (readonly [number, number, number, number])[] = [];
    for (let k = -reach; k <= reach; k++) {
      const [ax, ay] = project(k * CELL, -reach * CELL);
      const [bx, by] = project(k * CELL, reach * CELL);
      const [cx, cy] = project(-reach * CELL, k * CELL);
      const [dx, dy] = project(reach * CELL, k * CELL);
      lines.push([ax, ay, bx, by], [cx, cy, dx, dy]);
    }

    // A plate may sit where all its corners are on screen, clear of the headline, with no other
    // plate in its cells or the ring of cells around them.
    const plates: Plate[] = [];
    const fits = (i: number, j: number) => {
      const u = i * CELL;
      const v = j * CELL;
      const corners = [
        project(u, v),
        project(u + SPAN * CELL, v),
        project(u, v + CELL),
        project(u + SPAN * CELL, v + CELL),
        project(u + (SPAN * CELL) / 2, v + CELL / 2),
      ];
      const onScreen = corners.every(
        ([x, y]) => x > 12 && x < width - 12 && y > 76 && y < height - 16,
      );
      const onHeadline = corners.some(
        ([x, y]) =>
          x > clear.left - 36 &&
          x < clear.right + 36 &&
          y > clear.top - 20 &&
          y < clear.bottom + 20,
      );
      if (!onScreen || onHeadline) return false;

      return plates.every(
        (plate) => i > plate.i + SPAN || i + SPAN < plate.i || j > plate.j + 1 || j + 1 < plate.j,
      );
    };

    let used = 0;
    const spawn = (time: number, random: () => number, age = 0): Plate | undefined => {
      for (let attempt = 0; attempt < 200; attempt++) {
        const i = Math.floor((random() * 2 - 1) * reach);
        const j = Math.floor((random() * 2 - 1) * reach);
        if (!fits(i, j)) continue;

        const entry = floorNames[used++ % floorNames.length];
        if (!entry) return undefined;

        return {
          i,
          j,
          entry,
          accent: accents[Math.floor(random() * accents.length)] ?? ink,
          depth: 0.7 + random() * 0.3,
          born: time - age,
          life: 10_000 + random() * 4000,
        };
      }

      return undefined;
    };

    // The canvas draws only after mount, so plain randomness cannot upset hydration; every load
    // starts from a different scatter.
    const target = compact ? 4 : 9;
    const start = performance.now();
    for (let index = 0; index < target; index++) {
      // Spread the first plates through their lives, so they do not all rise together.
      const plate = spawn(start, Math.random, reduced ? 5000 : Math.random() * 9000);
      if (plate) plates.push(plate);
    }
    let spawns: number[] = [];

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

    const drawPlate = (plate: Plate, time: number) => {
      const { entry } = plate;
      // Under reduced motion every plate is drawn fully written and still.
      const age = reduced ? plate.life / 2 : time - plate.born;
      const steps = timeline(entry);
      const rise = expoOut(age / RISE_MS);
      const sink = easeIn((age - (plate.life - SINK_MS)) / SINK_MS);
      const alpha = rise * (1 - sink) * plate.depth;
      if (alpha <= 0) return;

      // Lifting out of the floor and sinking back: a small drop down the screen, in plane units.
      const drop = ((1 - rise) * 14 + sink * 10) / (2 * SIN);
      const u = plate.i * CELL + drop + 4;
      const v = plate.j * CELL + drop + 4;
      const w = SPAN * CELL - 8;
      const h = CELL - 8;

      context.globalAlpha = alpha * 0.1;
      context.fillStyle = plate.accent;
      context.fillRect(u, v, w, h);
      context.globalAlpha = alpha * 0.4;
      context.strokeStyle = plate.accent;
      context.lineWidth = 0.8;
      context.strokeRect(u, v, w, h);

      // The accent edge grows along the front once the name has resolved.
      const settled = expoOut((age - steps.address) / (steps.settle - steps.address));
      context.globalAlpha = alpha;
      context.fillRect(u, v + h - 2, w * settled, 2);
      context.fillRect(u, v, 2.5, h);

      // The avatar pops in once the name is typed.
      const pop = backOut((age - steps.name) / POP_MS);
      const radius = 12 * pop;
      const hasAvatar = Boolean(entry.avatar);
      if (radius > 0.5 && !avatar(entry.avatar, u + 24, v + h / 2, radius, alpha)) {
        context.globalAlpha = alpha;
        context.beginPath();
        context.arc(u + 24, v + h / 2, 3 * pop, 0, Math.PI * 2);
        context.fill();
      }

      const left = u + (hasAvatar ? 44 : 36);
      const nameShown = Math.floor((age - TYPE_DELAY_MS) / NAME_CHAR_MS);
      const addressShown = Math.floor((age - steps.name - 180) / ADDRESS_CHAR_MS);
      const name = entry.name.slice(0, Math.max(0, nameShown));
      const address = entry.address.slice(0, Math.max(0, addressShown));

      context.globalAlpha = alpha * 0.95;
      context.fillStyle = ink;
      context.font = `500 12px ${font}`;
      context.fillText(name, left, v + 25);

      context.globalAlpha = alpha * 0.75;
      context.fillStyle = plate.accent;
      context.font = `400 9.5px ${font}`;
      context.fillText(address, left, v + 41);

      // A caret follows whichever line is typing and leaves once both are written.
      if (age > TYPE_DELAY_MS && age < steps.address + 200) {
        const onName = age < steps.name + 180;
        context.font = onName ? `500 12px ${font}` : `400 9.5px ${font}`;
        const x = left + context.measureText(onName ? name : address).width + 1.5;
        const blink = Math.floor(age / 260) % 2 === 0 ? 1 : 0.35;
        context.globalAlpha = alpha * blink;
        context.fillStyle = plate.accent;
        context.fillRect(x, onName ? v + 15 : v + 33, 1.5, onName ? 12 : 10);
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

      // Plates lie flat on the floor plane.
      context.setTransform(
        ratio * PLANE.ux,
        ratio * PLANE.uy,
        ratio * PLANE.vx,
        ratio * PLANE.vy,
        (ratio * width) / 2,
        (ratio * height) / 2,
      );
      context.textBaseline = "alphabetic";
      for (const plate of plates) drawPlate(plate, time);
      context.globalAlpha = 1;
    };

    // Retire plates that have sunk, and raise new ones a moment later somewhere else.
    const update = (time: number) => {
      for (let index = plates.length - 1; index >= 0; index--) {
        const plate = plates[index];
        if (!plate || time - plate.born < plate.life) continue;

        plates.splice(index, 1);
        spawns.push(time + 400 + Math.random() * 1600);
      }

      const due = spawns.filter((at) => at <= time);
      spawns = spawns.filter((at) => at > time);
      for (const _ of due) {
        const plate = spawn(time, Math.random);
        if (plate) plates.push(plate);
        else spawns.push(time + 1000);
      }
    };

    let frame = 0;
    let visible = false;
    let last = 0;

    const tick = (time: number) => {
      frame = 0;
      // About 30 frames a second is plenty for slow plates.
      if (time - last > 30) {
        last = time;
        update(time);
        draw(time);
      }

      if (visible) frame = requestAnimationFrame(tick);
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
    view.observe(element);

    return () => {
      cancelAnimationFrame(frame);
      view.disconnect();
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
