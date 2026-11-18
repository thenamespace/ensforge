import { useEffect, useRef, useState } from "react";

import { glyphs } from "@/components/logos";
import { useInView, useReducedMotion } from "@/components/marketing/hooks";
import { COS, isoProjector, SIN } from "@/components/marketing/iso";
import { cn } from "@/lib/cn";

import { avatarSrc } from "../avatars";

/**
 * Closing figure: the ensforge anvil, extruded from its logo glyph, on a plinth. A name plate
 * lies on the anvil's face; every strike lights the face's edge, throws sparks and forges the
 * next name, while names already forged float around it with their avatars.
 */

const CX = 300;
const CY = 170;
const { at, box, plane } = isoProjector(CX, CY);

/** Glyph units to plate units, and where the anvil stands. */
const SCALE = 2.6;
const ANVIL = { u: 40, v: 40, depth: 70 };
/** Glyph y of the feet and of the anvil's face. */
const FEET_Y = 73;
const FACE_Y = 28;
const FACE_Z = (FEET_Y - FACE_Y) * SCALE;
/** The plate spans glyph x 33–81, inside the face's flat top (30–84). */
const PLATE = {
  u: ANVIL.u + 33 * SCALE,
  v: ANVIL.v + 12,
  w: 48 * SCALE,
  d: ANVIL.depth - 24,
  h: 7,
};
const TAG = { d: 34, h: 6 };

type Accent = "blue" | "magenta" | "green" | "yellow";

/** Each avatar takes a package accent, so the figure carries the brand palette. */
const accentVar: Record<Accent, string> = {
  blue: "var(--ens-blue)",
  magenta: "var(--ens-react)",
  green: "var(--ens-contracts)",
  yellow: "var(--ens-hca)",
};

/** Names forged on the anvil in turn; the ones around it are already done. */
const forged: readonly { name: string; accent: Accent }[] = [
  { name: "yourname.eth", accent: "blue" },
  { name: "brantly.eth", accent: "magenta" },
  { name: "cap.eth", accent: "green" },
  { name: "artii.eth", accent: "yellow" },
  { name: "maxi.eth", accent: "magenta" },
];

/** Names already forged, in an arc around the anvil: three on the left, two on the right. */
const floating: readonly { name: string; accent: Accent; u: number; v: number; z: number }[] = [
  { name: "ens.eth", accent: "blue", u: -60, v: 0, z: 210 },
  { name: "envoy1084.eth", accent: "yellow", u: -90, v: 110, z: 90 },
  { name: "vitalik.eth", accent: "magenta", u: 230, v: -80, z: 220 },
  { name: "nick.eth", accent: "green", u: 340, v: 10, z: 130 },
  { name: "jesse.base.eth", accent: "blue", u: 70, v: 250, z: 25 },
];

/** Maps the glyph's side profile onto the vertical plane at depth `v`. */
const profile = (v: number) => {
  const [e, f] = at(ANVIL.u, v, FEET_Y * SCALE);

  return `matrix(${SCALE * COS} ${SCALE * SIN} 0 ${SCALE} ${e.toFixed(2)} ${f.toFixed(2)})`;
};

/** Width of a tag that fits its avatar, its name and some air. */
const tagWidth = (name: string) => name.length * 7 + 46;

function Tag({
  name,
  accent,
  u,
  v,
  z,
  w,
  d,
  h,
}: {
  readonly name: string;
  readonly accent: Accent;
  readonly u: number;
  readonly v: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  readonly h: number;
}) {
  const faces = box(u, v, z, w, d, h);
  const avatar = avatarSrc(name);
  const clip = `forge-avatar-${name.replaceAll(".", "-")}`;

  return (
    <g className="ens-forge-tag" style={{ "--avatar": accentVar[accent] }}>
      <path className="ens-forge-tag-side" d={faces.left} />
      <path className="ens-forge-tag-side-dark" d={faces.right} />
      <path className="ens-forge-tag-top" d={faces.top} />
      <g transform={plane(z + h)}>
        <circle className="ens-forge-avatar" cx={u + 16} cy={v + d / 2} r={9} />
        {avatar ? (
          <>
            <clipPath id={clip}>
              <circle cx={u + 16} cy={v + d / 2} r={8.5} />
            </clipPath>
            <image
              href={avatar}
              x={u + 7}
              y={v + d / 2 - 9}
              width={18}
              height={18}
              clipPath={`url(#${clip})`}
            />
          </>
        ) : (
          <text
            className="ens-forge-avatar-initial font-mono"
            x={u + 16}
            y={v + d / 2 + 3.5}
            fontSize={10}
            textAnchor="middle"
          >
            {name.charAt(0).toUpperCase()}
          </text>
        )}
        <text className="ens-forge-tag-name font-mono" x={u + 32} y={v + d / 2 + 4} fontSize={11}>
          {name}
        </text>
      </g>
    </g>
  );
}

export function Forge({ className }: { readonly className?: string }) {
  const root = useRef<SVGSVGElement>(null);
  const inView = useInView(root, { threshold: 0.3 });
  const reduced = useReducedMotion();
  const [strike, setStrike] = useState(0);

  useEffect(() => {
    if (!inView || reduced) return undefined;

    const timer = window.setInterval(() => setStrike((value) => value + 1), 2600);

    return () => window.clearInterval(timer);
  }, [inView, reduced]);

  const plinth = box(-10, -10, -18, 340, 170, 18);
  const layers = Array.from(
    { length: Math.ceil(ANVIL.depth / 2) },
    (_, index) => ANVIL.v + index * 2,
  );
  const current = forged[strike % forged.length] ?? { name: "yourname.eth", accent: "blue" };
  const [sparkX, sparkY] = at(PLATE.u + PLATE.w / 2, PLATE.v + PLATE.d / 2, FACE_Z + PLATE.h);

  return (
    <svg
      ref={root}
      viewBox="85 -95 600 560"
      className={cn("ens-forge h-auto w-full", className)}
      aria-hidden="true"
    >
      <path className="ek-cta-side" d={plinth.left} />
      <path className="ek-cta-side-dark" d={plinth.right} />
      <path className="ek-cta-top" d={plinth.top} />
      <g transform={plane(0)}>
        <rect className="ek-cta-line" x={0} y={0} width={320} height={150} fill="none" />
        <text
          className="ek-cta-engrave font-mono text-[9px] tracking-[0.14em] uppercase"
          x={10}
          y={142}
        >
          ensforge · every ens name, one api
        </text>
      </g>

      <g className="ens-forge-anvil">
        {layers.map((v) => (
          <path
            key={v}
            className="ens-forge-anvil-body"
            d={glyphs.ensforge}
            transform={profile(v)}
          />
        ))}
        <path
          className="ens-forge-anvil-face"
          d={glyphs.ensforge}
          transform={profile(ANVIL.v + ANVIL.depth)}
        />
        {reduced ? null : (
          <path
            key={`edge-${strike}`}
            className="ens-forge-strike-edge"
            d={box(ANVIL.u + 30 * SCALE, ANVIL.v, FACE_Z, 54 * SCALE, ANVIL.depth, 0).top}
          />
        )}
      </g>

      <g key={current.name} className="ens-forge-current">
        <Tag name={current.name} accent={current.accent} {...PLATE} z={FACE_Z} />
      </g>

      {reduced ? null : (
        <g key={strike} transform={`translate(${sparkX} ${sparkY})`}>
          {Array.from({ length: 10 }, (_, index) => {
            const angle = (index / 10) * Math.PI * 2;

            return (
              <path
                key={`ray-${index}`}
                className="ens-forge-ray"
                d={`M${Math.cos(angle) * 20} ${Math.sin(angle) * 11}L${Math.cos(angle) * 46} ${Math.sin(angle) * 26}`}
              />
            );
          })}
          {Array.from({ length: 14 }, (_, index) => {
            const angle = -Math.PI * (0.08 + (index / 13) * 0.84);
            const length = 16 + ((index * 7) % 5) * 6;
            const x = Math.cos(angle) * (18 + length);
            const y = Math.sin(angle) * (12 + length) - 8;

            return (
              <path
                key={`spark-${index}`}
                className={cn("ens-forge-spark", index % 3 === 0 && "is-cool")}
                style={{ animationDelay: `${(index % 4) * 30}ms` }}
                d={`M${Math.cos(angle) * 14} ${Math.sin(angle) * 8}L${x} ${y}`}
              />
            );
          })}
        </g>
      )}

      {floating.map((tag, index) => (
        <g key={tag.name} className="ens-forge-float" style={{ animationDelay: `${index * 0.9}s` }}>
          <Tag {...tag} w={tagWidth(tag.name)} {...TAG} />
        </g>
      ))}
    </svg>
  );
}
