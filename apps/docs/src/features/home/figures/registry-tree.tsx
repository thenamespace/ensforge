import { useEffect, useRef, useState } from "react";

import { useInView, useReducedMotion } from "@/components/marketing/hooks";
import { COS, isoProjector } from "@/components/marketing/iso";
import { cn } from "@/lib/cn";

/**
 * Closing figure: ENS as a tree of registries. The root registry holds `eth`, the .eth registry
 * holds each name, and a name can have its own subregistry, as base.eth does for jesse.base.eth.
 * A lookup travels down the tree to one name, which lights up and shows the address its
 * resolver returns. One still frame under reduced motion.
 */

const { at, box, plane } = isoProjector(330, 120);

interface Plate {
  readonly id: string;
  readonly label: string;
  readonly parent?: string;
  /** Screen offset from the figure's centre line, and height of the plate's base. */
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  readonly h: number;
  /** Registries are slabs; names are tags. */
  readonly kind: "registry" | "name";
  /** What the name's resolver returns, read from mainnet. */
  readonly address?: string;
}

const plates: readonly Plate[] = [
  { id: "root", label: "root", kind: "registry", x: 0, z: 300, w: 76, d: 76, h: 12 },
  {
    id: "eth",
    label: "eth registry",
    parent: "root",
    kind: "registry",
    x: 0,
    z: 178,
    w: 116,
    d: 84,
    h: 12,
  },
  {
    id: "nick",
    label: "nick.eth",
    parent: "eth",
    kind: "name",
    x: -200,
    z: 50,
    w: 92,
    d: 34,
    h: 6,
    address: "0xb8c2…67d5",
  },
  {
    id: "vitalik",
    label: "vitalik.eth",
    parent: "eth",
    kind: "name",
    x: -20,
    z: 50,
    w: 112,
    d: 34,
    h: 6,
    address: "0xd8dA…6045",
  },
  { id: "base", label: "base.eth", parent: "eth", kind: "name", x: 170, z: 50, w: 92, d: 34, h: 6 },
  {
    id: "base-registry",
    label: "subregistry",
    parent: "base",
    kind: "registry",
    x: 170,
    z: -60,
    w: 84,
    d: 60,
    h: 10,
  },
  {
    id: "jesse",
    label: "jesse.base.eth",
    parent: "base-registry",
    kind: "name",
    x: 170,
    z: -170,
    w: 132,
    d: 34,
    h: 6,
    address: "0x2211…7DA9",
  },
];

const byId = new Map(plates.map((plate) => [plate.id, plate]));

/** Lookups in the order the figure plays them. */
const lookups = ["vitalik", "jesse", "nick"] as const;

/** Plate centre on the plane: an x offset on screen is equal and opposite steps in u and v. */
const centre = (plate: Plate) => {
  const offset = plate.x / (2 * COS);

  return { u: offset, v: -offset };
};

const ancestry = (id: string): readonly Plate[] => {
  const plate = byId.get(id);
  if (!plate) return [];

  return plate.parent ? [...ancestry(plate.parent), plate] : [plate];
};

/** The wire from a plate's parent: down from its underside, across, and down onto the plate. */
const wire = (plate: Plate) => {
  const parent = plate.parent ? byId.get(plate.parent) : undefined;
  if (!parent) return undefined;

  const from = centre(parent);
  const to = centre(plate);
  const top = plate.z + plate.h;
  const bus = top + (parent.z - top) * 0.45;
  const points = [
    at(from.u, from.v, parent.z),
    at(from.u, from.v, bus),
    at(to.u, to.v, bus),
    at(to.u, to.v, top),
  ];

  return points
    .map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join("");
};

export function RegistryTree({ className }: { readonly className?: string }) {
  const root = useRef<SVGSVGElement>(null);
  const inView = useInView(root, { threshold: 0.3 });
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!inView || reduced) return undefined;

    const timer = window.setInterval(() => setStep((value) => value + 1), 3600);

    return () => window.clearInterval(timer);
  }, [inView, reduced]);

  const target = lookups[step % lookups.length] ?? "vitalik";
  const path = ancestry(target);
  const lit = new Map(path.map((plate, index) => [plate.id, index]));
  const route = path
    .map((plate) => wire(plate))
    .filter((segment) => segment !== undefined)
    .join("");
  const resolved = byId.get(target);

  return (
    <svg
      ref={root}
      viewBox="58 -244 530 630"
      className={cn("ens-tree h-auto w-full", className)}
      aria-hidden="true"
    >
      {plates.map((plate) => {
        const d = wire(plate);
        const index = lit.get(plate.id);

        return d ? (
          <path
            key={plate.id}
            className={cn("ens-tree-wire", index !== undefined && "is-lit")}
            style={index === undefined ? undefined : { transitionDelay: `${index * 320}ms` }}
            d={d}
          />
        ) : null;
      })}

      {plates.map((plate) => {
        const { u: cu, v: cv } = centre(plate);
        const u = cu - plate.w / 2;
        const v = cv - plate.d / 2;
        const faces = box(u, v, plate.z, plate.w, plate.d, plate.h);
        const index = lit.get(plate.id);

        return (
          <g
            key={plate.id}
            className={cn("ens-tree-plate", `is-${plate.kind}`, index !== undefined && "is-lit")}
            style={index === undefined ? undefined : { transitionDelay: `${index * 320}ms` }}
          >
            <path className="ens-tree-side" d={faces.left} />
            <path className="ens-tree-side-dark" d={faces.right} />
            <path className="ens-tree-top" d={faces.top} />
            <g transform={plane(plate.z + plate.h)}>
              {plate.kind === "registry" ? (
                <>
                  <rect
                    className="ens-tree-line"
                    x={u + 6}
                    y={v + 6}
                    width={plate.w - 12}
                    height={plate.d - 12}
                    fill="none"
                  />
                  <text
                    className="ens-tree-label font-mono"
                    x={u + 12}
                    y={v + plate.d - 13}
                    fontSize={9.5}
                  >
                    {plate.label}
                  </text>
                </>
              ) : (
                <>
                  <circle className="ens-tree-hole" cx={u + 9} cy={v + plate.d / 2} r={3} />
                  <text
                    className="ens-tree-name font-mono"
                    x={u + 17}
                    y={v + plate.d / 2 + 4}
                    fontSize={11}
                  >
                    {plate.label}
                  </text>
                </>
              )}
            </g>
          </g>
        );
      })}

      {reduced ? null : (
        <circle
          key={step}
          className="ens-tree-packet"
          r={3.5}
          style={{
            offsetPath: `path("${route}")`,
            animationDuration: `${path.length * 320}ms`,
          }}
        />
      )}

      {resolved?.address ? (
        <Record key={`record-${step}`} plate={resolved} delay={reduced ? 0 : path.length * 320} />
      ) : null}
    </svg>
  );
}

/** The address the name's resolver returned, hung under the name. */
function Record({ plate, delay }: { readonly plate: Plate; readonly delay: number }) {
  const { u, v } = centre(plate);
  const [x, y] = at(u + plate.w / 2, v + plate.d / 2, plate.z);
  const width = (plate.address?.length ?? 0) * 6.4 + 54;

  return (
    <g className="ens-tree-record" style={{ animationDelay: `${delay}ms` }}>
      <path className="ens-tree-leader" d={`M${x} ${y + 2}v16`} />
      <rect
        className="ens-tree-chip"
        x={x - width / 2}
        y={y + 18}
        width={width}
        height={24}
        rx={4}
      />
      <text className="font-mono" x={x - width / 2 + 10} y={y + 34} fontSize={10.5}>
        <tspan className="ens-tree-chip-key">addr</tspan>
        <tspan className="ens-tree-chip-value" dx={8}>
          {plate.address}
        </tspan>
      </text>
    </g>
  );
}
