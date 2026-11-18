import { type Accent, accents, BG, boxFaces, COS, iso, marks, PANEL, SIN } from "./primitives";

/**
 * Isometric line art for the right-hand cell (384 × 438), drawn as plain SVG so Takumi can
 * rasterize it: flat fills and thin strokes only, in the projection of the landing page's plates.
 */

const WIDTH = 384;
const HEIGHT = 438;
const LINE = "#3f3f46";
const SIDE = "#0d0d0f";

/**
 * A brand mark lying on a top face, centred on `(u, v)` at height `z`. Turned to face the viewer,
 * the glyph only stretches and flattens, so it stays legible.
 */
function FlatMark(props: {
  at: ReturnType<typeof iso>;
  u: number;
  v: number;
  z: number;
  size: number;
  accent: Accent;
}) {
  const { glyph, outline } = marks[props.accent];
  const color = accents[props.accent];
  const [x, y] = props.at(props.u, props.v, props.z);
  const half = props.size / 2;

  return (
    <g transform={`translate(${x} ${y}) matrix(${COS * Math.SQRT2} 0 0 ${SIN * Math.SQRT2} 0 0)`}>
      <svg x={-half} y={-half} width={props.size} height={props.size} viewBox="8 8 84 84">
        {outline ? (
          <path d={outline} fill="none" stroke={color} strokeWidth={4.5} strokeLinejoin="miter" />
        ) : null}
        <path d={glyph} fill={color} fillRule="evenodd" />
      </svg>
    </g>
  );
}

/** Docs pages: three plates; the top one in the package accent carries its mark. */
export function PlateStack({ accent }: { accent: Accent }) {
  const color = accents[accent];
  const [cx, cy] = [WIDTH / 2, 187];
  const at = iso(cx, cy);
  const size = 168;
  const thick = 12;
  const gap = 46;
  const top = 2 * gap;

  return (
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
      {(
        [
          [size, 0],
          [0, size],
          [size, size],
        ] as const
      ).map(([u, v]) => {
        const [x1, y1] = at(u, v, thick);
        const [x2, y2] = at(u, v, top);
        return (
          <path
            key={`${u}-${v}`}
            d={`M${x1} ${y1}L${x2} ${y2}`}
            stroke={LINE}
            strokeWidth={1}
            strokeDasharray="2 4"
          />
        );
      })}
      {[0, gap, top].map((z) => {
        const faces = boxFaces(at, 0, 0, z, size, size, thick);
        const lit = z === top;
        const stroke = lit ? color : LINE;

        return (
          <g key={z}>
            <path
              d={faces.left}
              fill={lit ? `${color}2e` : PANEL}
              stroke={stroke}
              strokeWidth={1.25}
            />
            <path
              d={faces.right}
              fill={lit ? `${color}1a` : SIDE}
              stroke={stroke}
              strokeWidth={1.25}
            />
            <path d={faces.top} fill={BG} stroke={stroke} strokeWidth={1.25} />
          </g>
        );
      })}
      <FlatMark at={at} u={size / 2} v={size / 2} z={top + thick} size={92} accent={accent} />
    </svg>
  );
}

/** Home and blog: one tile per package on a base plate, the SDK's raised in ENS blue. */
export function PackageTiles() {
  const [cx, cy] = [WIDTH / 2, 124];
  const at = iso(cx, cy);
  const base = 192;
  const margin = 14;
  const tile = 76;
  const gap = 12;
  // Drawn back to front so nearer tiles cover the ones behind.
  const tiles: readonly { accent: Accent; i: number; j: number }[] = [
    { accent: "react", i: 0, j: 0 },
    { accent: "contracts", i: 1, j: 0 },
    { accent: "hca", i: 0, j: 1 },
    { accent: "sdk", i: 1, j: 1 },
  ];
  const plate = boxFaces(at, 0, 0, 0, base, base, 10);

  return (
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
      <path d={plate.left} fill={PANEL} stroke={LINE} strokeWidth={1.25} />
      <path d={plate.right} fill={SIDE} stroke={LINE} strokeWidth={1.25} />
      <path d={plate.top} fill={BG} stroke={LINE} strokeWidth={1.25} />
      {tiles.map(({ accent, i, j }) => {
        const u = margin + i * (tile + gap);
        const v = margin + j * (tile + gap);
        const lead = accent === "sdk";
        const height = lead ? 40 : 14;
        const faces = boxFaces(at, u, v, 10, tile, tile, height);
        const stroke = lead ? accents.sdk : LINE;

        return (
          <g key={accent}>
            <path
              d={faces.left}
              fill={lead ? `${accents.sdk}2e` : PANEL}
              stroke={stroke}
              strokeWidth={1.25}
            />
            <path
              d={faces.right}
              fill={lead ? `${accents.sdk}1a` : SIDE}
              stroke={stroke}
              strokeWidth={1.25}
            />
            <path d={faces.top} fill={BG} stroke={stroke} strokeWidth={1.25} />
            <FlatMark
              at={at}
              u={u + tile / 2}
              v={v + tile / 2}
              z={10 + height}
              size={tile - 30}
              accent={accent}
            />
          </g>
        );
      })}
    </svg>
  );
}
