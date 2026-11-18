import { glyphs, reactOrbits } from "@/components/logos/glyphs";

/** Shared pieces for the Open Graph images: size, colours, marks and isometric maths. */

export const OG = { width: 1200, height: 630 } as const;

/**
 * The site accent (`kit`, ENS blue) and one per package: the dark-theme values of `data-accent`
 * in marketing.css and the `--ens-*` colours in home.css, as hex for the renderer.
 */
export const accents = {
  kit: "#5298ff",
  sdk: "#5298ff",
  contracts: "#f8554f",
  react: "#a991f9",
  hca: "#f3b539",
} as const;

export type Accent = keyof typeof accents;

/** Each accent's brand mark; the site accent carries the ensforge anvil. */
export const marks: Record<Accent, { glyph: string; outline?: string }> = {
  kit: { glyph: glyphs.ensforge },
  sdk: { glyph: glyphs.sdk },
  contracts: { glyph: glyphs.contracts },
  react: { glyph: glyphs.react, outline: reactOrbits },
  hca: { glyph: glyphs.hca },
};

export const INK = "#fafafa";
export const MUTED = "#a1a1aa";
export const SUBTLE = "#71717a";
export const FAINT = "#52525b";
export const RULE = "#27272a";
export const PANEL = "#111113";
export const BG = "#09090b";

export const COS = 0.866;
export const SIN = 0.5;
export type P = readonly [number, number];
export const iso =
  (cx: number, cy: number) =>
  (u: number, v: number, z: number): P => [cx + (u - v) * COS, cy + (u + v) * SIN - z];
export const poly = (points: readonly P[]) =>
  `M${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}Z`;

export function boxFaces(
  at: ReturnType<typeof iso>,
  u: number,
  v: number,
  z: number,
  w: number,
  d: number,
  h: number,
) {
  return {
    top: poly([at(u, v, z + h), at(u + w, v, z + h), at(u + w, v + d, z + h), at(u, v + d, z + h)]),
    left: poly([
      at(u, v + d, z + h),
      at(u + w, v + d, z + h),
      at(u + w, v + d, z),
      at(u, v + d, z),
    ]),
    right: poly([
      at(u + w, v, z + h),
      at(u + w, v + d, z + h),
      at(u + w, v + d, z),
      at(u + w, v, z),
    ]),
  };
}
