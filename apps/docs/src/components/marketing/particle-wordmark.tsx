import { useEffect, useRef } from "react";

import { cn } from "@/lib/cn";
import { site } from "@/lib/site";

/**
 * The site name drawn as a field of dots. The dots fly in and settle into the letters when the
 * footer scrolls into view, scatter away from the pointer and spring back. Static under reduced
 * motion; paused while offscreen.
 */

const TEXT = site.name;
const PUSH = 90;

interface Dot {
  hx: number;
  hy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heat: number;
}

export function ParticleWordmark({ className }: { readonly className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return undefined;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let dots: Dot[] = [];
    // Sampling grid and dot size follow the width, so the letters stay legible on phones.
    let step = 5;
    let radius = 1.15;
    let width = 0;
    let height = 0;
    let frame = 0;
    let visible = false;
    let assembled = false;
    let ink = "#fff";
    let accent = "#5b8cff";

    const pointer = { x: -9999, y: -9999 };

    const readColors = () => {
      const style = getComputedStyle(element);
      ink = style.color;
      accent = style.getPropertyValue("--ek-accent").trim() || accent;
    };

    const font = (size: number) => `600 ${size}px "Inter Variable", Inter, sans-serif`;

    const layout = () => {
      width = element.getBoundingClientRect().width;
      step = Math.max(2.4, Math.min(5, width / 290));
      radius = step * 0.23;

      // Fit the word across the full width, centred. The canvas is shorter than the letters so
      // their bottom sits below the footer's bottom rule.
      const probe = document.createElement("canvas");
      const ink2d = probe.getContext("2d");
      if (!ink2d) return;

      ink2d.font = font(100);
      ink2d.letterSpacing = "-6.5px";
      const perHundred = ink2d.measureText(TEXT).width;
      const size = (width * 0.97 * 100) / Math.max(perHundred, 1);
      height = Math.round(size * 0.6);
      element.style.height = `${height}px`;

      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      // Draw on a wider probe, then centre on the pixels that were actually inked: canvas text
      // metrics with negative letter spacing are not reliable enough to centre by.
      probe.width = Math.ceil(width * 1.6);
      probe.height = Math.ceil(height);
      ink2d.font = font(size);
      ink2d.letterSpacing = `${-0.065 * size}px`;
      ink2d.textAlign = "left";
      ink2d.textBaseline = "alphabetic";
      ink2d.fillStyle = "#000";
      ink2d.fillText(TEXT, width * 0.05, height + size * 0.15);
      const pixels = ink2d.getImageData(0, 0, probe.width, probe.height).data;

      // Sample the inked pixels on a grid, one dot per cell.
      const next: Dot[] = [];
      for (let y = step / 2; y < probe.height; y += step) {
        for (let x = step / 2; x < probe.width; x += step) {
          const alpha = pixels[(Math.floor(y) * probe.width + Math.floor(x)) * 4 + 3] ?? 0;
          if (alpha < 128) continue;

          const start = assembled || reduced;
          next.push({
            hx: x,
            hy: y,
            x: start ? x : Math.random() * width,
            y: start ? y : height + Math.random() * height * 0.8,
            vx: 0,
            vy: 0,
            heat: 0,
          });
        }
      }

      // Re-centre on the dots and shrink to fit if the word overflows the canvas.
      let minX = Infinity;
      let maxX = -Infinity;
      for (const dot of next) {
        minX = Math.min(minX, dot.hx);
        maxX = Math.max(maxX, dot.hx);
      }

      const span = Math.max(maxX - minX, 1);
      const scale = Math.min(1, (width * 0.97) / span);

      for (const dot of next) {
        dot.hx = width / 2 + (dot.hx - (minX + maxX) / 2) * scale;
        if (assembled || reduced) dot.x = dot.hx;
      }

      dots = next;
    };

    const draw = () => {
      context.clearRect(0, 0, width, height);

      for (const dot of dots) {
        // Fade towards the bottom so the word sinks into the page, like the type it replaces.
        const fade = 0.85 - (dot.hy / height) * 0.65;
        context.globalAlpha = Math.max(0.08, fade) * (0.55 + dot.heat * 0.45);
        context.fillStyle = dot.heat > 0.15 ? accent : ink;
        context.beginPath();
        context.arc(dot.x, dot.y, radius + dot.heat * 0.6, 0, Math.PI * 2);
        context.fill();
      }

      context.globalAlpha = 1;
    };

    const tick = () => {
      frame = 0;

      for (const dot of dots) {
        const dx = dot.x - pointer.x;
        const dy = dot.y - pointer.y;
        const distance = Math.hypot(dx, dy);

        if (distance < PUSH) {
          const force = (1 - distance / PUSH) * 2.4;
          dot.vx += (dx / (distance || 1)) * force;
          dot.vy += (dy / (distance || 1)) * force;
          dot.heat = Math.min(1, dot.heat + 0.2);
        } else {
          dot.heat *= 0.94;
        }

        // Spring back towards home, with damping.
        dot.vx += (dot.hx - dot.x) * 0.045;
        dot.vy += (dot.hy - dot.y) * 0.045;
        dot.vx *= 0.82;
        dot.vy *= 0.82;

        dot.x += dot.vx;
        dot.y += dot.vy;
      }

      draw();
      if (visible) frame = requestAnimationFrame(tick);
    };

    const start = () => {
      if (!frame && visible && !reduced) frame = requestAnimationFrame(tick);
    };

    const onMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      start();
    };

    const onLeave = () => {
      pointer.x = -9999;
      pointer.y = -9999;
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      if (visible) {
        readColors();
        if (reduced) draw();
        else {
          start();
          // Mark assembled after the first entrance so resizes don't replay it.
          window.setTimeout(() => (assembled = true), 1800);
        }
      } else if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    });

    let lastWidth = 0;
    const resize = new ResizeObserver(() => {
      const next = element.getBoundingClientRect().width;
      if (Math.abs(next - lastWidth) < 1) return;

      lastWidth = next;
      layout();
      readColors();
      draw();
    });

    const theme = new MutationObserver(() => {
      readColors();
      if (reduced || !visible) draw();
    });

    let cancelled = false;

    const boot = async () => {
      // Sample the real font, not the fallback it would otherwise measure.
      await document.fonts.ready;
      if (cancelled) return;

      layout();
      readColors();
      draw();
      resize.observe(element);
      observer.observe(element);
    };

    void boot();
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerleave", onLeave);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      theme.disconnect();
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      className={cn("block w-full text-fd-foreground", className)}
    />
  );
}
