import { useEffect, useRef, useState } from "react";

import { glyphs } from "@/components/logos";
import { useInView, useReducedMotion } from "@/components/marketing/hooks";
import { COS, isoProjector, SIN } from "@/components/marketing/iso";
import { cn } from "@/lib/cn";

/**
 * Closing figure: the ensforge anvil, extruded from its logo glyph, on a plinth. A name plate
 * lies on the anvil's face; every strike forges the next name with a burst of sparks, while
 * names already forged float around it.
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
const PLATE = {
  u: ANVIL.u + 40 * SCALE,
  v: ANVIL.v + 12,
  w: 36 * SCALE,
  d: ANVIL.depth - 24,
  h: 7,
};

const forged = ["nick.eth", "vitalik.eth", "jesse.base.eth", "ens.eth", "yourname.eth"];

const floating = [
  { name: "vitalik.eth", u: 250, v: 170, z: 40, delay: 0 },
  { name: "ens.eth", u: -40, v: 110, z: 110, delay: 1.2 },
  { name: "jesse.base.eth", u: 250, v: -10, z: 170, delay: 2.1 },
] as const;

/** Maps the glyph's side profile onto the vertical plane at depth `v`. */
const profile = (v: number) => {
  const [e, f] = at(ANVIL.u, v, FEET_Y * SCALE);

  return `matrix(${SCALE * COS} ${SCALE * SIN} 0 ${SCALE} ${e.toFixed(2)} ${f.toFixed(2)})`;
};

function Tag({
  name,
  u,
  v,
  z,
  w,
  d,
  h,
  className,
}: {
  readonly name: string;
  readonly u: number;
  readonly v: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  readonly h: number;
  readonly className?: string;
}) {
  const faces = box(u, v, z, w, d, h);

  return (
    <g className={cn("ens-forge-tag", className)}>
      <path className="ens-forge-tag-side" d={faces.left} />
      <path className="ens-forge-tag-side-dark" d={faces.right} />
      <path className="ens-forge-tag-top" d={faces.top} />
      <g transform={plane(z + h)}>
        <circle className="ens-forge-tag-hole" cx={u + 9} cy={v + d / 2} r={3} />
        <text
          className="ens-forge-tag-name font-mono"
          x={u + 17}
          y={v + d / 2 + 4}
          fontSize={name.length > 12 ? 9 : 11}
        >
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

    const timer = window.setInterval(() => setStrike((value) => value + 1), 2400);

    return () => window.clearInterval(timer);
  }, [inView, reduced]);

  const plinth = box(-10, -10, -18, 340, 170, 18);
  const layers = Array.from(
    { length: Math.ceil(ANVIL.depth / 2) },
    (_, index) => ANVIL.v + index * 2,
  );
  const name = forged[strike % forged.length] ?? "nick.eth";
  const [sparkX, sparkY] = at(PLATE.u + PLATE.w / 2, PLATE.v + PLATE.d / 2, FACE_Z + PLATE.h);

  return (
    <svg
      ref={root}
      viewBox="90 -30 530 470"
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
          ensforge · the sdk for ens
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
      </g>

      <g key={name} className="ens-forge-current">
        <Tag name={name} {...PLATE} z={FACE_Z} />
      </g>
      {reduced ? null : (
        <g key={strike} className="ens-forge-sparks" transform={`translate(${sparkX} ${sparkY})`}>
          {Array.from({ length: 12 }, (_, index) => {
            const angle = (index / 12) * Math.PI * 2 + 0.2;
            const length = 10 + (index % 3) * 6;

            return (
              <path
                key={index}
                className="ens-forge-spark"
                style={{ animationDelay: `${(index % 4) * 25}ms` }}
                d={`M${Math.cos(angle) * 14} ${Math.sin(angle) * 8}l${Math.cos(angle) * length} ${Math.sin(angle) * length * 0.6 - 6}`}
              />
            );
          })}
        </g>
      )}

      {floating.map((tag) => (
        <g key={tag.name} className="ens-forge-float" style={{ animationDelay: `${tag.delay}s` }}>
          <Tag
            name={tag.name}
            u={tag.u}
            v={tag.v}
            z={tag.z}
            w={tag.name.length * 7 + 26}
            d={34}
            h={6}
          />
        </g>
      ))}
    </svg>
  );
}
