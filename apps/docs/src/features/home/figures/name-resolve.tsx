import { type ReactNode, useEffect, useRef, useState } from "react";

import { EnsforgeLogo } from "@/components/logos";
import { useInView, useReducedMotion } from "@/components/marketing/hooks";
import { isoProjector } from "@/components/marketing/iso";
import { cn } from "@/lib/cn";

/**
 * Hero figure: a name tag floats above ENS's two layers. Each cycle a lookup drops from the
 * tag through the registry to the resolver, and the name's records fan out beside the stack.
 * The records are real mainnet values, recorded once: the hero never calls the network.
 */

interface Sample {
  readonly name: string;
  readonly records: readonly { readonly key: string; readonly value: string }[];
}

const samples: readonly Sample[] = [
  {
    name: "nick.eth",
    records: [
      { key: "addr", value: "0xb8c2…67d5" },
      { key: "avatar", value: "euc.li/nick.eth" },
      { key: "com.github", value: "arachnid" },
      { key: "url", value: "ens.domains" },
    ],
  },
  {
    name: "vitalik.eth",
    records: [
      { key: "addr", value: "0xd8dA…6045" },
      { key: "avatar", value: "euc.li/vitalik.eth" },
      { key: "com.github", value: "vbuterin" },
      { key: "url", value: "vitalik.ca" },
    ],
  },
  {
    name: "jesse.base.eth",
    records: [
      { key: "addr", value: "0x2211…7DA9" },
      { key: "avatar", value: "cryptopunk.png" },
      { key: "com.twitter", value: "jessepollak" },
      { key: "url", value: "jesse.xyz" },
    ],
  },
  {
    name: "ens.eth",
    records: [
      { key: "addr", value: "0xFe89…44b7" },
      { key: "avatar", value: "i.imgur.com/ga6y0c0" },
      { key: "com.twitter", value: "ensdomains" },
      { key: "url", value: "ens.domains" },
    ],
  },
];

const { at, box, plane } = isoProjector(250, 300);
const SIZE = 200;
const THICK = 12;
/** The registry sits above the resolver: a lookup passes through it first. */
const REGISTRY_Z = 118;
const TAG = { u: 40, v: 70, w: 130, d: 60, z: 238, h: 12 };
/** Phases of one cycle: tag in, registry, resolver, then records held on screen. */
const PHASES = 7;
const TICK_MS = 850;

const engrave = "font-mono text-[8px] tracking-[0.14em] uppercase";

function Plate({
  z,
  label,
  lit,
  children,
}: {
  readonly z: number;
  readonly label: string;
  readonly lit: boolean;
  readonly children: ReactNode;
}) {
  const faces = box(0, 0, z, SIZE, SIZE, THICK);

  return (
    <g className="ens-hero-plate" data-lit={lit}>
      <path className="ens-hero-side" d={faces.left} />
      <path className="ens-hero-side-dark" d={faces.right} />
      <path className="ens-hero-top" d={faces.top} />
      <g transform={plane(z + THICK)}>
        <rect
          className="ens-hero-line"
          x={8}
          y={8}
          width={SIZE - 16}
          height={SIZE - 16}
          fill="none"
        />
        <text className={cn(engrave, "ens-hero-engrave")} x={16} y={24}>
          {label}
        </text>
        {children}
      </g>
    </g>
  );
}

/** The registry: a small tree from the root through `eth` to the name. */
function RegistryDetail({ lit }: { readonly lit: boolean }) {
  const leaves = [52, 84, 116, 148];

  return (
    <>
      <circle className="ens-hero-node" cx={100} cy={52} r={7} />
      <path className="ens-hero-line" d={`M100 59V84M${leaves[0]} 92H${leaves.at(-1)}`} />
      {leaves.map((x, index) => (
        <g key={x}>
          <path className="ens-hero-line" d={`M${x} 92V104`} />
          <rect
            className={cn("ens-hero-cell", lit && index === 1 && "is-lit")}
            x={x - 12}
            y={104}
            width={24}
            height={16}
          />
        </g>
      ))}
      <path className="ens-hero-line" d="M84 120V140M60 140H108" />
      {[60, 84, 108].map((x, index) => (
        <rect
          key={x}
          className={cn("ens-hero-cell", lit && index === 1 && "is-lit")}
          x={x - 10}
          y={140}
          width={20}
          height={14}
        />
      ))}
      <text className={cn(engrave, "ens-hero-engrave")} x={16} y={180}>
        root · eth · name
      </text>
    </>
  );
}

/** The resolver: record slots that light up as they answer. */
function ResolverDetail({ lit }: { readonly lit: boolean }) {
  const rows = [40, 70, 100, 130];

  return (
    <>
      {rows.map((y, index) => (
        <g key={y}>
          <rect
            className={cn("ens-hero-cell", lit && "is-lit")}
            style={{ transitionDelay: `${index * 90}ms` }}
            x={18}
            y={y}
            width={22}
            height={18}
          />
          <path
            className="ens-hero-line"
            d={`M48 ${y + 6}h${92 - index * 14}M48 ${y + 12}h${60 + index * 8}`}
          />
        </g>
      ))}
      <EnsforgeLogo x={146} y={146} width={34} height={34} className="ens-hero-mark" />
    </>
  );
}

export function NameResolve({ className }: { readonly className?: string }) {
  const root = useRef<SVGSVGElement>(null);
  const inView = useInView(root, { threshold: 0.2 });
  const reduced = useReducedMotion();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!inView || reduced) return undefined;

    const timer = window.setInterval(() => setTick((value) => value + 1), TICK_MS);

    return () => window.clearInterval(timer);
  }, [inView, reduced]);

  // Reduced motion holds the first name with its records shown.
  const phase = reduced ? PHASES - 1 : tick % PHASES;
  const sample = samples[reduced ? 0 : Math.floor(tick / PHASES) % samples.length] ?? samples[0];
  if (!sample) return null;

  const tag = box(TAG.u, TAG.v, TAG.z, TAG.w, TAG.d, TAG.h);
  const [dropX, dropTop] = at(TAG.u + TAG.w / 2, TAG.v + TAG.d / 2, TAG.z);
  const [, registryY] = at(TAG.u + TAG.w / 2, TAG.v + TAG.d / 2, REGISTRY_Z + THICK);
  const [, resolverY] = at(TAG.u + TAG.w / 2, TAG.v + TAG.d / 2, THICK);
  const anchor = at(SIZE, SIZE * 0.3, THICK);

  return (
    <svg
      ref={root}
      viewBox="40 60 580 470"
      className={cn("ens-hero-figure h-auto w-full", className)}
      aria-hidden="true"
    >
      <Plate z={0} label="resolver" lit={phase >= 2}>
        <ResolverDetail lit={phase >= 2} />
      </Plate>
      <Plate z={REGISTRY_Z} label="registry" lit={phase >= 1}>
        <RegistryDetail lit={phase >= 1} />
      </Plate>

      <path className="ens-hero-drop" d={`M${dropX} ${dropTop}V${resolverY}`} />
      {phase === 1 || phase === 2 ? (
        <circle
          key={tick}
          className="ens-hero-packet"
          cx={dropX}
          cy={phase === 1 ? dropTop : registryY}
          r={4}
          style={{ "--drop": `${phase === 1 ? registryY - dropTop : resolverY - registryY}px` }}
        />
      ) : null}

      <g key={sample.name} className="ens-hero-tag">
        <path className="ens-hero-tag-side" d={tag.left} />
        <path className="ens-hero-tag-side-dark" d={tag.right} />
        <path className="ens-hero-tag-top" d={tag.top} />
        <g transform={plane(TAG.z + TAG.h)}>
          <circle className="ens-hero-tag-hole" cx={TAG.u + 12} cy={TAG.v + TAG.d / 2} r={4} />
          <text
            className="ens-hero-tag-name font-mono"
            x={TAG.u + 24}
            y={TAG.v + TAG.d / 2 + 5}
            fontSize={sample.name.length > 12 ? 11.5 : 14}
          >
            {sample.name}
          </text>
        </g>
      </g>

      {sample.records.map((record, index) => {
        const y = 210 + index * 50;
        const x = 470;
        const shown = phase >= 3;

        return (
          <g
            key={`${sample.name}-${record.key}`}
            className="ens-hero-record"
            data-shown={shown}
            style={{ transitionDelay: shown ? `${index * 120}ms` : "0ms" }}
          >
            <path
              className="ens-hero-leader"
              fill="none"
              d={`M${anchor[0]} ${anchor[1]}C${anchor[0] + 40} ${anchor[1]} ${x - 50} ${y} ${x - 8} ${y}`}
            />
            <rect className="ens-hero-chip" x={x - 8} y={y - 17} width={150} height={34} rx={6} />
            <text
              className="ens-hero-chip-key font-mono text-[8.5px] tracking-[0.1em] uppercase"
              x={x + 2}
              y={y - 3}
            >
              {record.key}
            </text>
            <text className="ens-hero-chip-value font-mono text-[11px]" x={x + 2} y={y + 10}>
              {record.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
