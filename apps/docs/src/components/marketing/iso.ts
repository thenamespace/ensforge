/** Isometric helpers shared by the line illustrations (30° projection, z up). */
export const COS = 0.866;
export const SIN = 0.5;

export type Point = readonly [number, number];

const poly = (points: readonly Point[]) =>
  `M${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}Z`;

export function isoProjector(cx: number, cy: number) {
  const at = (u: number, v: number, z: number): Point => [
    cx + (u - v) * COS,
    cy + (u + v) * SIN - z,
  ];

  /** Top, left and right faces of an axis-aligned box. */
  const box = (u: number, v: number, z: number, w: number, d: number, h: number) => ({
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
  });

  /** SVG transform that maps flat (u, v) drawing onto the plane at height z. */
  const plane = (z: number) => `matrix(${COS} ${SIN} ${-COS} ${SIN} ${cx} ${cy - z})`;

  return { at, poly, box, plane };
}
