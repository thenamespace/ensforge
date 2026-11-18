import type { ReactNode } from "react";

import { glyphs } from "@/components/logos";
import { site } from "@/lib/site";

import { type Accent, accents, BG, FAINT, INK, MUTED, OG } from "./primitives";

/** The frame every image shares: brand and crumb on top, text on the left, art on the right. */

/** The ensforge mark as an SVG image (the OG renderer draws images, not inline SVG elements). */
export function EnsforgeMark({ height = 32, color = INK }: { height?: number; color?: string }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="8 8 84 84"><path fill="${color}" d="${glyphs.ensforge}"/></svg>`;

  return (
    <img src={`data:image/svg+xml;base64,${btoa(svg)}`} width={height} height={height} alt="" />
  );
}

export function DotGrid() {
  const dots: ReactNode[] = [];

  for (let y = 15; y < OG.height; y += 30)
    for (let x = 15; x < OG.width; x += 30)
      dots.push(<circle key={`${x}-${y}`} cx={x} cy={y} r={1.1} fill="rgba(250,250,250,0.07)" />);

  return (
    <svg width={OG.width} height={OG.height} style={{ position: "absolute", top: 0, left: 0 }}>
      {dots}
    </svg>
  );
}

interface FrameProps {
  readonly accent: Accent;
  /** Shown after the brand, e.g. "Blog" or a package name. */
  readonly crumb?: string;
  readonly art: ReactNode;
  readonly children: ReactNode;
  /** Narrow the text column when the art reaches into the middle. */
  readonly wide?: boolean;
}

export function Frame({ accent, crumb, art, children, wide = true }: FrameProps) {
  const color = accents[accent];

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        width: OG.width,
        height: OG.height,
        backgroundColor: BG,
        color: INK,
        fontFamily: "Inter",
        overflow: "hidden",
      }}
    >
      <DotGrid />
      <div
        style={{
          position: "absolute",
          right: -160,
          top: -120,
          width: 760,
          height: 760,
          borderRadius: 9999,
          backgroundImage: `radial-gradient(circle, ${color}26 0%, ${color}00 65%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: 600,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {art}
      </div>
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          width: OG.width,
          height: OG.height,
          padding: "64px 72px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <EnsforgeMark />
          <span style={{ fontSize: 28, fontWeight: 600, letterSpacing: -0.5 }}>{site.name}</span>
          {crumb ? (
            <span
              style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 28, color: MUTED }}
            >
              <span style={{ color: FAINT }}>/</span>
              <span style={{ color }}>{crumb}</span>
            </span>
          ) : null}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flexGrow: 1,
            gap: 22,
            maxWidth: wide ? 640 : 560,
            paddingBottom: 48,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function Title({ children, size = 76 }: { children: ReactNode; size?: number }) {
  return (
    <div
      style={{
        fontSize: size,
        fontWeight: 500,
        lineHeight: 1.04,
        letterSpacing: -size * 0.035,
        color: INK,
      }}
    >
      {children}
    </div>
  );
}

export function Description({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 28, lineHeight: 1.4, color: MUTED, fontWeight: 400 }}>{children}</div>
  );
}
