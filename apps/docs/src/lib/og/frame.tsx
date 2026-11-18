import type { ReactNode } from "react";

import { site } from "@/lib/site";

import { type Accent, accents, BG, FAINT, INK, marks, MUTED, OG, RULE, SUBTLE } from "./primitives";

/**
 * The frame every image shares: a hairline grid with a header (brand, package), a text cell, an
 * art cell and a footer (URL path, note). Rules sit on these coordinates.
 */
const MARGIN = 56;
const HEADER = 96;
const FOOTER = 534;
const DIVIDER = 760;
const INSET = 32;
/** Width of the text in the text cell. */
const TEXT_WIDTH = DIVIDER - MARGIN - 2 * INSET;

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

function Grid() {
  const crosses: readonly (readonly [number, number])[] = [
    [MARGIN, HEADER],
    [DIVIDER, HEADER],
    [OG.width - MARGIN, HEADER],
    [MARGIN, FOOTER],
    [DIVIDER, FOOTER],
    [OG.width - MARGIN, FOOTER],
  ];
  // Half-pixel offsets keep 1px rules on the pixel grid.
  const rules = [
    `M0 ${HEADER + 0.5}H${OG.width}`,
    `M0 ${FOOTER + 0.5}H${OG.width}`,
    `M${MARGIN + 0.5} 0V${OG.height}`,
    `M${OG.width - MARGIN - 0.5} 0V${OG.height}`,
    `M${DIVIDER + 0.5} ${HEADER}V${FOOTER}`,
  ];

  return (
    <svg
      width={OG.width}
      height={OG.height}
      viewBox={`0 0 ${OG.width} ${OG.height}`}
      style={{ position: "absolute", top: 0, left: 0 }}
    >
      <path d={rules.join("")} stroke={RULE} strokeWidth={1} fill="none" />
      {crosses.map(([x, y]) => (
        <path
          key={`${x}-${y}`}
          d={`M${x - 6} ${y + 0.5}H${x + 7}M${x + 0.5} ${y - 6}V${y + 7}`}
          stroke={FAINT}
          strokeWidth={1}
        />
      ))}
    </svg>
  );
}

interface FrameProps {
  /** Header right: the package (or site) the page belongs to, with its mark. */
  readonly label: { readonly accent: Accent; readonly text: string };
  /** Mono line above the title. */
  readonly eyebrow: ReactNode;
  /** Footer left: the page's address, without the scheme. */
  readonly path: string;
  /** Footer right. */
  readonly note: string;
  readonly art: ReactNode;
  readonly children: ReactNode;
}

export function Frame({ label, eyebrow, path, note, art, children }: FrameProps) {
  const row = {
    position: "absolute",
    left: MARGIN,
    right: MARGIN,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: `0 ${INSET}px`,
  } as const;
  const mono = { fontFamily: "JetBrains Mono", fontSize: 18, letterSpacing: 0.2 } as const;

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
      <Grid />
      <div style={{ ...row, top: 0, height: HEADER }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Mark accent="kit" size={34} color={INK} />
          <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: -0.6 }}>{site.name}</span>
        </div>
        <div style={{ ...mono, display: "flex", alignItems: "center", gap: 12, color: MUTED }}>
          <Mark accent={label.accent} size={22} />
          {label.text}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          top: HEADER + 1,
          left: MARGIN + 1,
          width: DIVIDER - MARGIN - 1,
          height: FOOTER - HEADER - 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: `36px ${INSET}px 40px`,
        }}
      >
        <div
          style={{
            ...mono,
            display: "flex",
            gap: 12,
            textTransform: "uppercase",
            letterSpacing: 1.6,
            color: MUTED,
          }}
        >
          {eyebrow}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>{children}</div>
      </div>
      <div
        style={{
          position: "absolute",
          top: HEADER + 1,
          left: DIVIDER + 1,
          display: "flex",
        }}
      >
        {art}
      </div>
      <div style={{ ...row, ...mono, top: FOOTER + 1, height: OG.height - FOOTER - 1 }}>
        <span style={{ color: MUTED }}>{path}</span>
        <span style={{ color: SUBTLE }}>{note}</span>
      </div>
    </div>
  );
}

/** Mono separator for the eyebrow. */
export function Slash() {
  return <span style={{ color: FAINT }}>/</span>;
}

/**
 * The page title, sized by length to fill at most three lines of the text cell, then clamped.
 * `code` sets identifiers (API names, error codes) in mono, sized so the longest dotted segment
 * fits on one line, and breaks after dots.
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
    const segments = text.split(".");
    const longest = Math.max(...segments.map((segment) => segment.length + 1));
    const fit = Math.min(72, Math.max(36, Math.floor(TEXT_WIDTH / (0.6 * longest))));

    return (
      <div style={{ ...titleStyle(fit), fontFamily: "JetBrains Mono", fontWeight: 500 }}>
        {segments.join(".\u200B")}
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
