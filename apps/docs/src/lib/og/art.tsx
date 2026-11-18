import { type Accent, accents, BG, boxFaces, COS, iso, KIT_GLYPH, SIN } from "./primitives";

/** Illustrations drawn on the right of each image, as plain SVG so Takumi can rasterize them. */

/** Three slanted plates, the top one carrying the mark: the "layer" motif. */
export function PlateStack({ accent }: { accent: Accent }) {
  const color = accents[accent];
  const at = iso(300, 210);
  const plates = [0, 1, 2].map((index) => boxFaces(at, 0, 0, index * 58, 200, 200, 16));

  return (
    <svg width={600} height={630} viewBox="0 0 600 630">
      {plates.map((faces, index) => {
        const top = index === plates.length - 1;

        return (
          <g key={faces.top}>
            <path
              d={faces.left}
              fill={top ? `${color}33` : "#18181b"}
              stroke={top ? color : "#3f3f46"}
              strokeWidth={1.5}
            />
            <path
              d={faces.right}
              fill={top ? `${color}22` : "#121214"}
              stroke={top ? color : "#3f3f46"}
              strokeWidth={1.5}
            />
            <path
              d={faces.top}
              fill={top ? `${color}1f` : BG}
              stroke={top ? color : "#52525b"}
              strokeWidth={1.5}
            />
          </g>
        );
      })}
      <g transform={`matrix(${COS} ${SIN} ${-COS} ${SIN} 300 ${210 - 2 * 58 - 16})`}>
        <svg x={50} y={50} width={100} height={100} viewBox="47 44 110 110">
          <path d={KIT_GLYPH} fill={color} />
        </svg>
      </g>
    </svg>
  );
}

/** Home and blog: the packages as an exploded stack, one plate per package in its colour. */
export function KitStack() {
  const at = iso(300, 448);
  const plates: readonly { id: Accent; mark?: boolean }[] = [
    { id: "hca" },
    { id: "react" },
    { id: "contracts" },
    { id: "sdk", mark: true },
  ];
  const size = 148;
  const gap = 104;

  return (
    <svg width={600} height={630} viewBox="0 0 600 630">
      {/* Guides from plate to plate. */}
      {(
        [
          [0, 0],
          [size, 0],
          [0, size],
          [size, size],
        ] as const
      ).map(([u, v]) => {
        const [x1, y1] = at(u, v, 14);
        const [x2, y2] = at(u, v, (plates.length - 1) * gap);
        return (
          <path
            key={`${u}-${v}`}
            d={`M${x1} ${y1}L${x2} ${y2}`}
            stroke="rgba(250,250,250,0.12)"
            strokeWidth={1}
            strokeDasharray="3 5"
          />
        );
      })}
      {plates.map((plate, index) => {
        const z = index * gap;
        const faces = boxFaces(at, 0, 0, z, size, size, 14);
        const color = accents[plate.id];

        return (
          <g key={plate.id}>
            <path d={faces.left} fill={`${color}30`} stroke={color} strokeWidth={1.5} />
            <path d={faces.right} fill={`${color}1c`} stroke={color} strokeWidth={1.5} />
            <path d={faces.top} fill={`${color}1a`} stroke={color} strokeWidth={1.5} />
            {plate.mark ? (
              <g transform={`matrix(${COS} ${SIN} ${-COS} ${SIN} 300 ${448 - z - 14})`}>
                <svg
                  x={size / 2 - 34}
                  y={size / 2 - 34}
                  width={68}
                  height={68}
                  viewBox="47 44 110 110"
                >
                  <path d={KIT_GLYPH} fill={color} />
                </svg>
              </g>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
