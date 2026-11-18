import type { ReactNode } from "react";

import { site } from "@/lib/site";

import { type Accent, accents, BG, FAINT, INK, marks, MUTED, OG } from "./primitives";

/**
 * The frame the docs and blog images share: the brand top left, the eyebrow, title and
 * description in the text column, and the package's art on the right. No rules or footer.
 */
const PADDING = 72;
/** Width of the text column. */
const TEXT_WIDTH = 660;

/** A brand mark as an SVG image (Takumi draws `<img>` sources, keeping the glyph exact). */
export function Mark({ accent, size, color }: { accent: Accent; size: number; color?: string }) {
  const { glyph, outline } = marks[accent];
  const fill = color ?? accents[accent];
  const orbits = outline
    ? `<path fill="none" stroke="${fill}" stroke-width="4.5" stroke-linejoin="miter" d="${outline}"/>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="8 8 84 84">${orbits}<path fill="${fill}" fill-rule="evenodd" d="${glyph}"/></svg>`;

  return <img src={`data:image/svg+xml;base64,${btoa(svg)}`} width={size} height={size} alt="" />;
}

/** The ensforge anvil and wordmark. */
export function Brand() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <Mark accent="kit" size={34} color={INK} />
      <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: -0.6 }}>{site.name}</span>
    </div>
  );
}

/** The site background as a full-canvas box; children position themselves on it. */
export function Canvas({ children }: { children: ReactNode }) {
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
      {children}
    </div>
  );
}

interface FrameProps {
  /** Mono line above the title. */
  readonly eyebrow: ReactNode;
  readonly art: ReactNode;
  readonly children: ReactNode;
}

export function Frame({ eyebrow, art, children }: FrameProps) {
  return (
    <Canvas>
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 16,
          bottom: 0,
          display: "flex",
          alignItems: "center",
        }}
      >
        {art}
      </div>
      <div
        style={{
          position: "absolute",
          top: PADDING - 8,
          left: PADDING,
          bottom: PADDING,
          width: TEXT_WIDTH,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <Brand />
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              display: "flex",
              gap: 12,
              fontFamily: "JetBrains Mono",
              fontSize: 18,
              textTransform: "uppercase",
              letterSpacing: 1.6,
              color: MUTED,
            }}
          >
            {eyebrow}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>{children}</div>
        </div>
      </div>
    </Canvas>
  );
}

/** Mono separator for the eyebrow. */
export function Slash() {
  return <span style={{ color: FAINT }}>/</span>;
}

/**
 * The page title, sized by length to fill at most three lines of the text cell, then clamped.
 * `code` sets identifiers (API names, error codes) in mono, sized so the longest segment fits on
 * one line, and breaks after dots and underscores.
 */
export function Title({
  text,
  code = false,
  size,
}: {
  text: string;
  code?: boolean;
  size?: number;
}) {
  if (code) {
    // JetBrains Mono advances 0.6 em per character.
    const oneLine = Math.floor(TEXT_WIDTH / (0.6 * text.length));
    const longest = Math.max(...text.split(/[._]/).map((segment) => segment.length + 1));
    const fit =
      oneLine >= 44
        ? Math.min(72, oneLine)
        : Math.min(52, Math.max(36, Math.floor(TEXT_WIDTH / (0.6 * longest))));

    return (
      <div style={{ ...titleStyle(fit), fontFamily: "JetBrains Mono", fontWeight: 500 }}>
        {text.replaceAll(/([._])/g, "$1\u200B")}
      </div>
    );
  }

  const steps = [
    [16, 84],
    [28, 72],
    [44, 60],
    [64, 52],
  ] as const;
  const fit = size ?? steps.find(([chars]) => text.length <= chars)?.[1] ?? 46;

  return <div style={{ ...titleStyle(fit), fontWeight: 600 }}>{text}</div>;
}

const titleStyle = (size: number) =>
  ({
    display: "block",
    fontFamily: "Inter",
    fontSize: size,
    lineHeight: 1.08,
    letterSpacing: -size * 0.03,
    color: INK,
    overflowWrap: "anywhere",
    textWrap: "balance",
    lineClamp: 3,
    textOverflow: "ellipsis",
  }) as const;

export function Description({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "block",
        fontSize: 24,
        lineHeight: 1.45,
        color: MUTED,
        lineClamp: 3,
        textOverflow: "ellipsis",
      }}
    >
      {children}
    </div>
  );
}
