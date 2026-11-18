import { useReducedMotion } from "@/components/marketing/hooks";
import { isoProjector } from "@/components/marketing/iso";

/**
 * Error page drawings in the same isometric language as the closing sections: plates and
 * blocks with engraved lines, the page accent for what matters, and calm looping motion.
 */

type Point = readonly [number, number];

const pathOf = (points: readonly Point[]) =>
  `M${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}`;

/* ---------- Not found: a board of routes with one slot empty ---------- */

const board = isoProjector(300, 50);

const TILE = { w: 92, d: 92, h: 10 };
const BOARD = { w: 334, d: 236, h: 14 };
const TOP = BOARD.h + TILE.h;
const GHOST_LIFT = 74;

const tiles = [
  { u: 18, v: 22, route: "/" },
  { u: 124, v: 22, route: "/docs" },
  { u: 230, v: 22, route: "/blog" },
  { u: 18, v: 126, route: "/terms" },
  { u: 230, v: 126, route: "/privacy" },
] as const;

const MISSING = { u: 124, v: 126 };

const shorten = (path: string) => (path.length > 13 ? `${path.slice(0, 12)}…` : path);

export function MissingRouteIllustration({ path }: { readonly path: string }) {
  const { box, plane } = board;
  const base = box(0, 0, 0, BOARD.w, BOARD.d, BOARD.h);
  const ghost = box(MISSING.u, MISSING.v, BOARD.h + GHOST_LIFT, TILE.w, TILE.d, TILE.h);

  return (
    <svg viewBox="70 -50 560 420" className="h-auto w-full" aria-hidden="true">
      <path className="ek-cta-side" d={base.left} />
      <path className="ek-cta-side-dark" d={base.right} />
      <path className="ek-cta-top" d={base.top} />
      <g transform={plane(BOARD.h)}>
        <rect
          className="ek-cta-line"
          x={8}
          y={8}
          width={BOARD.w - 16}
          height={BOARD.d - 16}
          fill="none"
        />
        <text
          className="ek-cta-engrave font-mono text-[8px] tracking-[0.14em] uppercase"
          x={18}
          y={BOARD.d - 14}
        >
          routes
        </text>
        <rect
          className="ek-err-slot"
          x={MISSING.u}
          y={MISSING.v}
          width={TILE.w}
          height={TILE.d}
          rx={2}
        />
      </g>

      {tiles.map(({ u, v, route }) => {
        const faces = box(u, v, BOARD.h, TILE.w, TILE.d, TILE.h);
        return (
          <g key={route}>
            <path className="ek-cta-module-side" d={faces.left} />
            <path className="ek-cta-module-side-dark" d={faces.right} />
            <path className="ek-cta-module-top" d={faces.top} />
            <g transform={plane(TOP)}>
              <text className="ek-cta-engrave font-mono text-[9px]" x={u + 10} y={v + 22}>
                {route}
              </text>
              {[38, 50, 62].map((y, index) => (
                <path
                  key={y}
                  className="ek-cta-line"
                  d={`M${u + 10} ${v + y}h${62 - index * 16}`}
                />
              ))}
            </g>
          </g>
        );
      })}

      {/* The page that was asked for: an outline hovering over the slot it should fill. */}
      <g className="ek-err-float">
        <path className="ek-err-ghost" d={ghost.left} />
        <path className="ek-err-ghost" d={ghost.right} />
        <path className="ek-err-ghost is-top" d={ghost.top} />
        <g transform={plane(BOARD.h + GHOST_LIFT + TILE.h)}>
          <text className="ek-err-path font-mono text-[9px]" x={MISSING.u + 10} y={MISSING.v + 22}>
            {shorten(path)}
          </text>
          <text className="ek-err-mark font-mono text-[22px]" x={MISSING.u + 34} y={MISSING.v + 66}>
            ?
          </text>
        </g>
      </g>
    </svg>
  );
}

/* ---------- Error: your app, a module, and the line between them cut ---------- */

const bench = isoProjector(250, 120);

/** Point on a quadratic curve from `a` to `b` through control `c`. */
const onCurve = (a: Point, c: Point, b: Point, t: number): Point => [
  (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t ** 2 * b[0],
  (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t ** 2 * b[1],
];

const curve = (a: Point, c: Point, b: Point, from: number, to: number) =>
  pathOf(
    Array.from({ length: 17 }, (_, step) => onCurve(a, c, b, from + ((to - from) * step) / 16)),
  );

/** Short spark strokes radiating from a cut end. */
const sparks = ([x, y]: Point, side: 1 | -1) =>
  [-0.9, -0.2, 0.55].map((angle, index) => {
    const length = 9 + index * 3;
    const theta = angle + (side === 1 ? 0 : Math.PI);
    return `M${(x + Math.cos(theta) * 4).toFixed(1)} ${(y + Math.sin(theta) * 4).toFixed(1)}L${(x + Math.cos(theta) * length).toFixed(1)} ${(y + Math.sin(theta) * length).toFixed(1)}`;
  });

export function BrokenLinkIllustration() {
  const reduced = useReducedMotion();
  const { at, box, plane } = bench;

  const app = box(0, 120, 0, 150, 110, 14);
  const slabs = [0, 1].map((index) => box(200, -60, index * 30, 110, 110, 24));
  const top = box(200, -60, 60, 110, 110, 24);

  const plug = at(150, 175, 7);
  const port = at(200, -5, 12);
  const control: Point = [(plug[0] + port[0]) / 2, Math.max(plug[1], port[1]) + 40];
  const near = curve(plug, control, port, 0, 0.42);
  const far = curve(plug, control, port, 0.58, 1);
  const cutA = onCurve(plug, control, port, 0.42);
  const cutB = onCurve(plug, control, port, 0.58);

  return (
    <svg viewBox="-10 -30 620 420" className="h-auto w-full" aria-hidden="true">
      <path d={near} className="ek-cta-cable" />
      <path d={far} className="ek-cta-cable" />
      <circle cx={cutA[0]} cy={cutA[1]} r={2.6} className="ek-err-end" />
      <circle cx={cutB[0]} cy={cutB[1]} r={2.6} className="ek-err-end" />
      <g className="ek-err-sparks">
        {[...sparks(cutA, 1), ...sparks(cutB, -1)].map((d) => (
          <path key={d} d={d} className="ek-err-spark" />
        ))}
      </g>
      {reduced ? null : (
        <circle r={3.5} className="ek-cta-packet ek-err-packet">
          <animateMotion
            dur="2.4s"
            repeatCount="indefinite"
            path={near}
            keyPoints="0;1;1"
            keyTimes="0;0.7;1"
            calcMode="linear"
          />
          <animate
            attributeName="opacity"
            dur="2.4s"
            repeatCount="indefinite"
            values="1;1;0;0"
            keyTimes="0;0.68;0.74;1"
          />
        </circle>
      )}

      <g>
        <path className="ek-cta-side" d={app.left} />
        <path className="ek-cta-side-dark" d={app.right} />
        <path className="ek-cta-top" d={app.top} />
        <g transform={plane(14)}>
          <rect className="ek-cta-line" x={10} y={130} width={130} height={90} fill="none" />
          <text
            className="ek-cta-engrave font-mono text-[9px] tracking-[0.14em] uppercase"
            x={20}
            y={150}
          >
            your app
          </text>
          {[170, 180, 190].map((y, index) => (
            <path key={y} className="ek-cta-line" d={`M20 ${y}h${80 - index * 18}`} />
          ))}
        </g>
      </g>

      {slabs.map((faces, index) => (
        <g key={faces.top} className="ek-cta-module">
          <path className="ek-cta-module-side" d={faces.left} />
          <path className="ek-cta-module-side-dark" d={faces.right} />
          <path className="ek-cta-module-top" d={faces.top} />
          {[8, 14].map((z) => {
            const a = at(212, 50, index * 30 + z);
            const b = at(290, 50, index * 30 + z);
            return <path key={z} className="ek-cta-line" d={`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`} />;
          })}
        </g>
      ))}

      {/* The failing module: tinted, jolting, with a warning mark on top. */}
      <g className="ek-err-fault">
        <path className="ek-err-module-side" d={top.left} />
        <path className="ek-err-module-side-dark" d={top.right} />
        <path className="ek-err-module-top" d={top.top} />
        {[8, 14].map((z) => {
          const a = at(212, 50, 60 + z);
          const b = at(290, 50, 60 + z);
          return <path key={z} className="ek-cta-line" d={`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`} />;
        })}
        <g transform={plane(84)}>
          <path className="ek-err-warn" d="M255 -32 L279 10 L231 10 Z" />
          <path className="ek-err-warn-mark" d="M255 -18 L255 -2" />
          <circle className="ek-err-warn-dot" cx={255} cy={4} r={1.6} />
        </g>
      </g>
    </svg>
  );
}
