/** Shared pieces for the Open Graph images: size, colours, the placeholder glyph and isometric maths. */

export const OG = { width: 1200, height: 630 } as const;

/** The site accent (`kit`) and one per package, matching `data-accent` in marketing.css. */
export const accents = {
  kit: "#6b9bff",
  sdk: "#6b9bff",
  contracts: "#ff6461",
  react: "#a78bfa",
  hca: "#ffc24b",
} as const;

export type Accent = keyof typeof accents;

export const INK = "#fafafa";
export const MUTED = "#a1a1aa";
export const FAINT = "#52525b";
export const LINE = "rgba(250,250,250,0.10)";
export const BG = "#09090b";

/** Placeholder glyph for the plates (a diamond in the 47 44 110 110 box) until ensforge has a drawn mark. */
export const KIT_GLYPH = "M102 54 150 99 102 144 54 99z";

/* ---------------------------------------------------------------- isometric maths */

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
