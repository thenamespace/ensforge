import type { ComponentType } from "react";

import {
  ContractsLogo,
  EnsforgeLogo,
  HcaLogo,
  type LogoProps,
  ReactLogo,
  SdkLogo,
} from "@/components/logos";
import { useReducedMotion } from "@/components/marketing/hooks";
import { isoProjector, type Point } from "@/components/marketing/iso";
import type { BlogCategory, BlogPackage } from "@/lib/blog/schema";
import { cn } from "@/lib/cn";

/**
 * Drawn covers for posts without a cover image, in the closing sections' isometric language: a
 * plate for the app and blocks for the packages, with one scene per category. Also the fallback
 * when a cover image fails to load.
 */

const logos: Record<BlogPackage, ComponentType<LogoProps>> = {
  sdk: SdkLogo,
  contracts: ContractsLogo,
  react: ReactLogo,
  hca: HcaLogo,
};

const { at, box, plane } = isoProjector(262, 92);

const PLATE = { w: 290, d: 190, h: 12 };

function Plate({ label }: { readonly label: string }) {
  const faces = box(0, 0, 0, PLATE.w, PLATE.d, PLATE.h);

  return (
    <g>
      <path className="ek-cta-side" d={faces.left} />
      <path className="ek-cta-side-dark" d={faces.right} />
      <path className="ek-cta-top" d={faces.top} />
      <g transform={plane(PLATE.h)}>
        <rect
          className="ek-cta-line"
          x={9}
          y={9}
          width={PLATE.w - 18}
          height={PLATE.d - 18}
          fill="none"
        />
        <text
          className="ek-cta-engrave font-mono text-[9px] tracking-[0.14em] uppercase"
          x={20}
          y={PLATE.d - 18}
        >
          {label}
        </text>
      </g>
    </g>
  );
}

interface BlockProps {
  readonly u: number;
  readonly v: number;
  readonly z: number;
  readonly size?: number;
  readonly height?: number;
  readonly Logo?: ComponentType<LogoProps>;
  readonly active?: boolean;
  readonly className?: string;
  readonly accent?: BlogPackage;
}

function Block({
  u,
  v,
  z,
  size = 76,
  height = 26,
  Logo,
  active = false,
  className,
  accent,
}: BlockProps) {
  const faces = box(u, v, z, size, size, height);
  const mark = size * 0.46;

  return (
    <g
      className={cn("ek-cta-module", active && "is-docked", className)}
      {...(accent ? { "data-accent": accent } : {})}
    >
      <path className="ek-cta-module-side" d={faces.left} />
      <path className="ek-cta-module-side-dark" d={faces.right} />
      <path className="ek-cta-module-top" d={faces.top} />
      {Logo ? (
        <g transform={plane(z + height)}>
          <Logo
            x={u + (size - mark) / 2}
            y={v + (size - mark) / 2}
            width={mark}
            height={mark}
            className="ek-cta-logo"
          />
        </g>
      ) : null}
    </g>
  );
}

/** A release: the stack the package already is, and the new version settling on top. */
function ReleaseScene({ pkg, version }: { pkg?: BlogPackage; version?: string }) {
  const Logo = pkg ? logos[pkg] : EnsforgeLogo;
  const u = 107;
  const v = 57;

  return (
    <>
      <Plate label={version ? `release ${version}` : "release"} />
      <Block u={u} v={v} z={PLATE.h} height={20} />
      <Block u={u} v={v} z={PLATE.h + 20} height={20} />
      <g className="ek-blog-float">
        <Block u={u} v={v} z={PLATE.h + 58} Logo={Logo} active />
      </g>
    </>
  );
}

/** An announcement: the app with each package docked in its slot. */
function AnnouncementScene() {
  const size = 60;
  const blocks = [
    { slug: "sdk", u: 14 },
    { slug: "contracts", u: 82 },
    { slug: "react", u: 150 },
    { slug: "hca", u: 218 },
  ] as const;

  return (
    <>
      <Plate label="your app" />
      <g transform={plane(PLATE.h)}>
        {blocks.map((block) => (
          <rect
            key={block.slug}
            className="ek-cta-slot is-docked"
            data-accent={block.slug}
            x={block.u - 4}
            y={61}
            width={size + 8}
            height={size + 8}
            strokeDasharray="4 4"
          />
        ))}
      </g>
      {blocks.map((block, index) => (
        <Block
          key={block.slug}
          u={block.u}
          v={65}
          z={PLATE.h}
          size={size}
          Logo={logos[block.slug]}
          active
          accent={block.slug}
          {...(index === blocks.length - 1 ? { className: "ek-blog-float" } : {})}
        />
      ))}
    </>
  );
}

/** A guide: code engraved on the plate, and the block it is about beside it. */
function GuideScene({ pkg }: { pkg?: BlogPackage }) {
  const Logo = pkg ? logos[pkg] : EnsforgeLogo;
  const lines = [
    { y: 44, x: 24, w: 70 },
    { y: 58, x: 36, w: 96 },
    { y: 72, x: 36, w: 120, accent: true },
    { y: 86, x: 36, w: 82 },
    { y: 100, x: 48, w: 104 },
    { y: 114, x: 36, w: 58 },
    { y: 128, x: 24, w: 30 },
  ];

  return (
    <>
      <Plate label="guide" />
      <g transform={plane(PLATE.h)}>
        <rect className="ek-cta-line" x={16} y={26} width={160} height={122} rx={3} fill="none" />
        {[22, 30, 38].map((x) => (
          <circle key={x} className="ek-blog-dot" cx={x + 4} cy={33} r={1.6} />
        ))}
        {lines.map((line) => (
          <path
            key={line.y}
            className={line.accent ? "ek-blog-code-accent" : "ek-cta-line"}
            d={`M${line.x} ${line.y}h${line.w}`}
          />
        ))}
      </g>
      <g className="ek-blog-float">
        <Block u={196} v={60} z={PLATE.h + 26} Logo={Logo} active />
      </g>
    </>
  );
}

/** Engineering: three services wired together, with requests moving along the cables. */
function EngineeringScene({ pkg }: { pkg?: BlogPackage }) {
  const reduced = useReducedMotion();
  const Logo = pkg ? logos[pkg] : EnsforgeLogo;
  const size = 58;
  const nodes = [
    { u: 22, v: 26 },
    { u: 200, v: 22 },
    { u: 112, v: 118 },
  ];

  const centre = (node: { u: number; v: number }): Point =>
    at(node.u + size / 2, node.v + size / 2, PLATE.h + 22);

  const cables = [
    [nodes[0], nodes[2]],
    [nodes[1], nodes[2]],
    [nodes[0], nodes[1]],
  ].flatMap(([from, to]) => {
    if (!from || !to) return [];

    const a = centre(from);
    const b = centre(to);
    const c: Point = [(a[0] + b[0]) / 2, Math.max(a[1], b[1]) + 26];

    return [
      `M${a[0].toFixed(1)} ${a[1].toFixed(1)}Q${c[0].toFixed(1)} ${c[1].toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`,
    ];
  });

  return (
    <>
      <Plate label="services" />
      {cables.map((d) => (
        <path key={d} className="ek-cta-cable" d={d} fill="none" />
      ))}
      {reduced
        ? null
        : cables.slice(0, 2).map((d, index) => (
            <circle key={d} r={3.2} className="ek-cta-packet">
              <animateMotion
                dur="2.6s"
                begin={`${index * 1.3}s`}
                repeatCount="indefinite"
                path={d}
              />
            </circle>
          ))}
      {nodes.map((node, index) => (
        <Block
          key={`${node.u}-${node.v}`}
          u={node.u}
          v={node.v}
          z={PLATE.h}
          size={size}
          height={22}
          active={index === 2}
          {...(index === 2 ? { Logo } : {})}
        />
      ))}
    </>
  );
}

export function CoverArt({
  category,
  pkg,
  version,
  className,
}: {
  readonly category: BlogCategory;
  readonly pkg?: BlogPackage | undefined;
  readonly version?: string | undefined;
  readonly className?: string;
}) {
  const optional = {
    ...(pkg ? { pkg } : {}),
    ...(version ? { version } : {}),
  };

  return (
    <div
      className={cn("ek-blog-art relative grid place-items-center overflow-hidden", className)}
      {...(pkg ? { "data-accent": pkg } : {})}
    >
      <div aria-hidden="true" className="ek-blog-art-dots pointer-events-none absolute inset-0" />
      <svg
        viewBox="40 -34 530 392"
        className="relative h-[86%] w-auto max-w-[92%]"
        aria-hidden="true"
      >
        {category === "release" ? <ReleaseScene {...optional} /> : null}
        {category === "announcement" ? <AnnouncementScene /> : null}
        {category === "guide" ? <GuideScene {...optional} /> : null}
        {category === "engineering" ? <EngineeringScene {...optional} /> : null}
      </svg>
    </div>
  );
}
