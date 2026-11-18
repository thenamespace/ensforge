import { useEffect, useRef } from "react";

import { cn } from "@/lib/cn";

/**
 * Hero background: an isometric floor of tiles in the same projection as the layer stack.
 * Tiles breathe in slow waves, swell into blocks under the pointer, and a few blocks rise in
 * ENS blue and the package colours. The centre is masked so the headline sits on a quiet floor. Paused when
 * offscreen; one still frame under reduced motion.
 */

const A = 19; // half width of a tile on screen
const B = 11; // half height
/** Colours of the tiles that rise: mostly ENS blue, now and then a package accent. */
const ACCENTS = [
  "--ens-blue",
  "--ens-blue",
  "--ens-blue",
  "--ens-react",
  "--ens-hca",
  "--ens-contracts",
] as const;

interface Tile {
  readonly i: number;
  readonly j: number;
  readonly x: number;
  readonly y: number;
  /** 0 in the middle of the hero, 1 at the edges. */
  readonly edge: number;
  /** Accent slot for the few tiles that rise in colour, or -1. */
  readonly accent: number;
  readonly phase: number;
  height: number;
}

const smooth = (edge0: number, edge1: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));

  return t * t * (3 - 2 * t);
};

/** Deterministic hash so the accent tiles land in the same places every load. */
const hash = (i: number, j: number) => {
  const value = Math.sin(i * 127.1 + j * 311.7) * 43_758.5453;

  return value - Math.floor(value);
};

export function IsoField({ className }: { readonly className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return undefined;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let tiles: Tile[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let visible = false;
    let last = 0;

    const pointer = { x: -9999, y: -9999, energy: 0 };
    const colors = { ink: "#fff", paper: "#000", accents: ACCENTS.map(() => "#5298ff") };

    const readColors = () => {
      const style = getComputedStyle(element);
      colors.ink = style.color;
      colors.paper = style.backgroundColor;
      colors.accents = ACCENTS.map((name) => style.getPropertyValue(name).trim() || "#888");
    };

    const layout = () => {
      const rect = element.getBoundingClientRect();
      width = rect.width;
      height = rect.height;

      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      const next: Tile[] = [];
      const span = Math.ceil((width / A + height / B) / 2) + 2;
      const cx = width / 2;
      const cy = height / 2;

      for (let i = -span; i <= span; i++) {
        for (let j = -span; j <= span; j++) {
          const x = cx + (i - j) * A;
          const y = cy + (i + j) * B;
          if (x < -A * 2 || x > width + A * 2 || y < -B * 4 || y > height + B * 2) continue;

          const dx = (x - cx) / (width * 0.42);
          const dy = (y - cy) / (height * 0.46);
          const edge = smooth(0.5, 1.25, Math.hypot(dx, dy));
          const roll = hash(i, j);

          next.push({
            i,
            j,
            x,
            y,
            edge,
            accent: edge > 0.5 && roll > 0.987 ? Math.floor(roll * 1000) % ACCENTS.length : -1,
            phase: roll * Math.PI * 2,
            height: 0,
          });
        }
      }

      // Paint back to front: higher on screen first.
      next.sort((a, b) => a.i + a.j - (b.i + b.j));
      tiles = next;
    };

    const diamond = (x: number, y: number) => {
      context.moveTo(x, y - B);
      context.lineTo(x + A, y);
      context.lineTo(x, y + B);
      context.lineTo(x - A, y);
      context.closePath();
    };

    const draw = (time: number) => {
      context.clearRect(0, 0, width, height);

      const t = time / 1000;
      pointer.energy *= 0.96;

      for (const tile of tiles) {
        const wave = Math.max(
          0,
          Math.sin(t * 0.55 + tile.i * 0.42) * Math.cos(t * 0.4 + tile.j * 0.37) - 0.62,
        );
        const near = Math.exp(-((tile.x - pointer.x) ** 2 + (tile.y - pointer.y) ** 2) / 9000);
        const pulse = tile.accent >= 0 ? Math.max(0, Math.sin(t * 0.7 + tile.phase)) ** 3 * 22 : 0;
        const target = (wave * 20 + pulse) * tile.edge + near * pointer.energy * 24;

        // Ease towards the target so tiles rise and settle instead of jumping each frame.
        tile.height += (target - tile.height) * 0.12;
      }

      // Flat tiles: one stroked path per alpha band keeps the draw calls low.
      const bands = 5;
      for (let band = 1; band <= bands; band++) {
        context.beginPath();
        let any = false;

        for (const tile of tiles) {
          if (tile.height > 1.5) continue;

          const alpha = Math.ceil(tile.edge * bands);
          if (alpha !== band) continue;
          diamond(tile.x, tile.y);
          any = true;
        }

        if (!any) continue;

        context.globalAlpha = 0.018 + (band / bands) * 0.06;
        context.strokeStyle = colors.ink;
        context.lineWidth = 1;
        context.stroke();
      }

      // Raised tiles: small prisms with two shaded sides and a lit top.
      for (const tile of tiles) {
        const h = tile.height;
        if (h <= 1.5) continue;

        const { x, y } = tile;
        const top = y - h;
        const accent = tile.accent >= 0 ? colors.accents[tile.accent] : undefined;
        const strength = Math.min(1, 0.35 + tile.edge * 0.65);

        context.globalAlpha = strength;
        context.fillStyle = colors.paper;
        context.beginPath();
        context.moveTo(x - A, top);
        context.lineTo(x, top + B);
        context.lineTo(x + A, top);
        context.lineTo(x + A, y);
        context.lineTo(x, y + B);
        context.lineTo(x - A, y);
        context.closePath();
        context.fill();

        context.globalAlpha = strength * 0.16;
        context.fillStyle = accent ?? colors.ink;
        context.beginPath();
        context.moveTo(x - A, top);
        context.lineTo(x, top + B);
        context.lineTo(x, y + B);
        context.lineTo(x - A, y);
        context.closePath();
        context.fill();

        context.globalAlpha = strength * 0.08;
        context.beginPath();
        context.moveTo(x, top + B);
        context.lineTo(x + A, top);
        context.lineTo(x + A, y);
        context.lineTo(x, y + B);
        context.closePath();
        context.fill();

        context.globalAlpha = strength * (accent ? 0.22 : 0.06);
        context.fillStyle = accent ?? colors.ink;
        context.beginPath();
        diamond(x, top);
        context.fill();

        context.globalAlpha = strength * (accent ? 0.75 : 0.3);
        context.strokeStyle = accent ?? colors.ink;
        context.beginPath();
        diamond(x, top);
        context.moveTo(x - A, top);
        context.lineTo(x - A, y);
        context.lineTo(x, y + B);
        context.lineTo(x + A, y);
        context.lineTo(x + A, top);
        context.moveTo(x, top + B);
        context.lineTo(x, y + B);
        context.stroke();
      }

      context.globalAlpha = 1;
    };

    const tick = (time: number) => {
      frame = 0;
      // About 30 frames a second is plenty for a slow background.
      if (time - last > 30) {
        last = time;
        draw(time);
      }

      if (visible) frame = requestAnimationFrame(tick);
    };

    const start = () => {
      if (!frame && visible && !reduced) frame = requestAnimationFrame(tick);
    };

    // The canvas ignores pointer events so the hero stays clickable; track the pointer on its host.
    const host = element.parentElement ?? element;

    const onMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.energy = Math.min(1, pointer.energy + 0.25);
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
      draw(performance.now());
    });

    // Theme switches toggle a class on <html>; the reduced-motion still frame has to be repainted
    // in the new colours because no animation loop will do it.
    const theme = new MutationObserver(() => {
      readColors();
      if (reduced) draw(4000);
    });

    layout();
    readColors();
    // A fixed time a few seconds in, so the reduced-motion still frame already shows some waves.
    draw(reduced ? 4000 : 0);
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
      className={cn(
        "ens-iso-field pointer-events-none bg-fd-background text-fd-foreground",
        className,
      )}
    />
  );
}
