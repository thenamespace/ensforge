import { type ReactNode, useEffect, useRef, useState } from "react";

import { EnsforgeLogo } from "@/components/logos";
import { ButtonLink } from "@/components/marketing/button";
import { useSectionView } from "@/components/marketing/hooks";
import { Container, Heading, Lede } from "@/components/marketing/section";
import { track } from "@/lib/analytics/client";
import { cn } from "@/lib/cn";

/**
 * "How ensforge fits in", after Effect Kit's layer stack: four isometric plates, from your
 * app down to ENS on Ethereum. Scrolling pins the section; each step lifts its plate out of the
 * stack, draws its annotations and expands its text in the step list.
 */

interface Note {
  /** Point on the plate's top face, in plate units (0..SIZE). */
  readonly at: readonly [number, number];
  readonly label: string;
  readonly side: "left" | "right";
}

interface Step {
  readonly id: string;
  readonly label: string;
  readonly title: string;
  readonly body: string;
  readonly notes: readonly Note[];
}

const steps: readonly Step[] = [
  {
    id: "app",
    label: "Your app",
    title: "Call it from anywhere",
    body: "A server, a browser, a React component or an Effect program. You ask for a name's address and get a typed value back, or null when it has none.",
    notes: [
      { at: [40, 190], label: "Promises or\nEffect", side: "left" },
      { at: [190, 50], label: "React\nhooks", side: "right" },
    ],
  },
  {
    id: "client",
    label: "The client",
    title: "One client, on viem",
    body: "Ensforge.create takes the viem client you already have. Its chain picks the ENS contracts; add a wallet only when you write.",
    notes: [
      { at: [40, 182], label: "Your viem\nclient", side: "left" },
      { at: [190, 60], label: "Wallet for\nwrites", side: "right" },
    ],
  },
  {
    id: "actions",
    label: "Actions",
    title: "Actions that know ENS",
    body: "Each action normalizes the name, finds the right contract and decodes the answer. Reads batch together; writes become plans you can preview before sending.",
    notes: [
      { at: [40, 175], label: "Batched\nreads", side: "left" },
      { at: [200, 120], label: "Plans for\nwrites", side: "right" },
    ],
  },
  {
    id: "ens",
    label: "ENS underneath",
    title: "Every name, one API",
    body: "ENSv1 or ENSv2, wrapped or not, on-chain or off-chain through CCIP-Read: ensforge works it out, so your code never branches on it.",
    notes: [
      { at: [50, 160], label: "ENSv1 and ENSv2\nregistries", side: "left" },
      { at: [190, 40], label: "Resolvers and\ngateways", side: "right" },
    ],
  },
];

const STATES = steps.length + 1; // intro, then one state per step
const SIZE = 230;
const THICK = 12;
const COS = 0.866;
const SIN = 0.5;
const CX = 320;
const FOCUS_Y = 245;
const GAP_TIGHT = 26;
const GAP_WIDE = 150;
const PLANE = `matrix(${COS} ${SIN} ${-COS} ${SIN} 0 0)`;

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const smooth = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0));

  return t * t * (3 - 2 * t);
};

/** Top-corner y of plate `index` for a continuous scroll state (0 = intro, k = step k). */
function plateY(index: number, state: number) {
  const spread = clamp(state);
  const focus = (steps.length - 1) / 2 + (state - 1 - (steps.length - 1) / 2) * spread;
  const d = index - focus;
  const wide = Math.sign(d) * Math.min(Math.abs(d), 1) * (GAP_WIDE - GAP_TIGHT) * spread;

  return FOCUS_Y + d * GAP_TIGHT + wide;
}

const toScreen = ([u, v]: readonly [number, number], y: number) =>
  [CX + (u - v) * COS, y + (u + v) * SIN] as const;

function Slab({ children }: { readonly children?: ReactNode }) {
  const right = [SIZE * COS, SIZE * SIN] as const;
  const bottom = [0, SIZE] as const;
  const left = [-SIZE * COS, SIZE * SIN] as const;

  return (
    <>
      <path
        className="ek-plate-side"
        d={`M${left[0]} ${left[1]}L${bottom[0]} ${bottom[1]}L${right[0]} ${right[1]}v${THICK}L${bottom[0]} ${bottom[1] + THICK}L${left[0]} ${left[1] + THICK}z`}
      />
      <path
        className="ek-plate-edge"
        fill="none"
        d={`M${left[0]} ${left[1]}L${bottom[0]} ${bottom[1]}L${right[0]} ${right[1]}M${bottom[0]} ${bottom[1]}v${THICK}`}
      />
      <g transform={PLANE}>
        <rect className="ek-plate-top" width={SIZE} height={SIZE} />
        <g>{children}</g>
      </g>
    </>
  );
}

const engrave = "ek-engrave font-mono text-[8px] tracking-[0.12em] uppercase";

/** Your app: a profile screen, the thing most ENS reads end up drawing. */
function AppPlate() {
  return (
    <Slab>
      <rect className="ek-line" x={10} y={10} width={210} height={210} fill="none" />
      <text className={engrave} x={18} y={26}>
        your app
      </text>
      <rect className="ek-line" x={18} y={36} width={194} height={176} fill="none" />
      <circle className="ek-fill" cx={56} cy={80} r={24} />
      <circle className="ek-mark" cx={56} cy={80} r={8} />
      <rect className="ek-fill-strong" x={92} y={66} width={84} height={9} />
      <rect className="ek-fill" x={92} y={82} width={108} height={7} />
      {[0, 1, 2].map((index) => (
        <rect
          key={index}
          className="ek-line"
          x={30 + index * 60}
          y={122}
          width={52}
          height={16}
          rx={8}
          fill="none"
        />
      ))}
      {[156, 168, 180, 192].map((y, index) => (
        <path key={y} className="ek-line" d={`M30 ${y}h${170 - index * 28}`} />
      ))}
    </Slab>
  );
}

/** The client: the anvil on a socket, viem's transport wired in from the sides. */
function ClientPlate() {
  const pins = Array.from({ length: 9 }, (_, index) => 62 + index * 13);

  return (
    <Slab>
      <rect className="ek-line" x={12} y={12} width={206} height={206} fill="none" />
      <text className={engrave} x={20} y={28}>
        ensforge client
      </text>
      {pins.map((p) => (
        <path key={p} className="ek-line" d={`M${p} 46v10M${p} 174v10M46 ${p}h10M174 ${p}h10`} />
      ))}
      <rect className="ek-fill" x={60} y={60} width={110} height={110} />
      <rect className="ek-line" x={66} y={66} width={98} height={98} fill="none" />
      <EnsforgeLogo x={89} y={89} width={52} height={52} className="ek-mark" />
      <text className={engrave} x={20} y={208}>
        viem · public + wallet
      </text>
    </Slab>
  );
}

/** Actions: rows of reads, and a write drawn as a plan of steps. */
function ActionsPlate() {
  const rows = [
    { y: 16, label: "record.get" },
    { y: 70, label: "name.get" },
  ];

  return (
    <Slab>
      {rows.map(({ y, label }) => (
        <g key={y}>
          <path className="ek-fill" d={`M30 ${y}H216V${y + 44}H30L14 ${y + 22}Z`} />
          <circle className="ek-line" cx={34} cy={y + 22} r={5} fill="none" />
          <text className={engrave} x={52} y={y + 26}>
            {label}
          </text>
          <path className="ek-line" d={`M150 ${y + 16}h50M150 ${y + 24}h36M150 ${y + 32}h44`} />
        </g>
      ))}
      <path className="ek-line" fill="none" d="M30 128H216V214H30L14 171Z" />
      <text className={engrave} x={52} y={146}>
        plan
      </text>
      {[0, 1, 2].map((index) => (
        <g key={index}>
          <rect
            className={index === 0 ? "ek-fill-strong" : "ek-line"}
            fill={index === 0 ? undefined : "none"}
            x={52 + index * 52}
            y={160}
            width={38}
            height={30}
          />
          {index < 2 ? <path className="ek-line" d={`M${90 + index * 52} 175h14`} /> : null}
        </g>
      ))}
    </Slab>
  );
}

/** ENS on Ethereum: two registries, the resolvers behind them and the off-chain gateways. */
function EnsPlate() {
  const crosses = [];
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 4; col++) crosses.push([30 + col * 26, 140 + row * 20] as const);

  const heights = [6, 2, 4, 2, 8, 3, 2, 5, 2, 7, 3, 2, 4, 6, 2, 3, 5];
  let offset = 22;
  const bars = heights.map((height, index) => {
    const bar = { y: offset, height, wide: index % 3 === 0 };
    offset += height + 3;

    return bar;
  });

  return (
    <Slab>
      <rect className="ek-line" x={12} y={12} width={206} height={206} fill="none" />
      <text className={engrave} x={20} y={30}>
        ens · ethereum
      </text>
      {["v1", "v2"].map((label, index) => (
        <g key={label}>
          <rect className="ek-fill" x={20 + index * 60} y={44} width={50} height={50} />
          <text className={cn(engrave, "ek-mark")} x={34 + index * 60} y={73}>
            {label}
          </text>
        </g>
      ))}
      <path className="ek-line" d="M45 94V112H105V94M75 112V124" />
      {crosses.map(([x, y]) => (
        <path key={`${x}-${y}`} className="ek-line" d={`M${x - 4} ${y}h8M${x} ${y - 4}v8`} />
      ))}
      {bars.map((bar) => (
        <rect
          key={bar.y}
          className="ek-fill-strong"
          x={150}
          y={bar.y}
          width={bar.wide ? 56 : 40}
          height={bar.height}
        />
      ))}
    </Slab>
  );
}

const plates = [AppPlate, ClientPlate, ActionsPlate, EnsPlate];

function Annotation({ note, plateTop }: { readonly note: Note; readonly plateTop: number }) {
  const [px, py] = toScreen(note.at, plateTop);
  const lines = note.label.split("\n");

  const ly = py - 64;
  const lx = note.side === "left" ? 40 : 600;
  const elbowX = note.side === "left" ? lx + 108 : lx - 108;
  const textX = note.side === "left" ? lx + 10 : lx - 10;

  return (
    <g className="ek-note">
      <path
        className="ek-note-line"
        fill="none"
        pathLength={1}
        d={`M${elbowX} ${ly - 4}L${px} ${ly + 26}V${py}`}
      />
      <circle className="ek-note-dot" cx={lx} cy={ly - 8} r={3} />
      <text
        className="ek-note-text font-mono text-[12px] tracking-[0.08em] uppercase"
        x={textX}
        y={ly - 4}
        textAnchor={note.side === "left" ? "start" : "end"}
      >
        {lines.map((line, index) => (
          <tspan key={line} x={textX} dy={index === 0 ? 0 : 15}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

function StackVisual({ state, active }: { readonly state: number; readonly active: number }) {
  return (
    <svg viewBox="20 10 600 700" className="h-full w-full" aria-hidden="true">
      {plates
        .map((Plate, index) => ({ Plate, index }))
        .toReversed()
        .map(({ Plate, index }) => (
          <g
            key={steps[index]?.id}
            className="ek-plate"
            data-state={active === 0 ? "rest" : active - 1 === index ? "active" : "idle"}
            transform={`translate(${CX} ${plateY(index, state).toFixed(2)})`}
          >
            <Plate />
          </g>
        ))}
      {active > 0
        ? steps[active - 1]?.notes.map((note) => (
            <Annotation
              key={`${active}-${note.label}`}
              note={note}
              plateTop={plateY(active - 1, active)}
            />
          ))
        : null}
    </svg>
  );
}

const ROW = 36;
const EDGE = 56;

/** Where a step sits in the list: collected at the top, centred while current, or waiting below. */
function stepTop(index: number, active: number) {
  const current = active - 1;

  if (index === current) return "calc(50% - 4.5rem)";
  if (index < current) return `${EDGE + index * ROW}px`;

  const waiting = steps.length - 1 - index;

  return `calc(100% - ${EDGE + (waiting + 1) * ROW}px)`;
}

function StepItem({
  step,
  index,
  active,
}: {
  readonly step: Step;
  readonly index: number;
  readonly active: number;
}) {
  const current = active - 1 === index;

  return (
    <div
      className="absolute inset-x-0 ps-10 transition-[top] duration-700 ease-out-expo"
      style={{ top: stepTop(index, active) }}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-[0.2em] -left-[7px] grid size-[15px] place-items-center rounded-full border bg-fd-background transition-colors",
          current ? "border-(--step) text-(--step)" : "border-(--ek-line-strong)",
        )}
      >
        <span
          className={cn(
            "size-[7px] rounded-full",
            current ? "animate-ek-pulse bg-(--step)" : "bg-fd-muted-foreground/50",
          )}
        />
      </span>
      <p className="font-mono text-[13px] tracking-[0.08em] uppercase">
        <span className="text-fd-muted-foreground/70 tabular-nums">0{index + 1}</span>{" "}
        <span className={current ? "text-fd-foreground" : "text-fd-muted-foreground"}>
          {step.label}
        </span>
      </p>
      {current ? (
        <div
          key={step.id}
          className="flex animate-ek-rise flex-col gap-3 pt-3 [animation-delay:120ms]"
        >
          <h3 className="text-4xl font-light tracking-[-0.03em] text-fd-foreground md:text-5xl">
            {step.title}
          </h3>
          <p className="max-w-[40ch] text-lg leading-relaxed text-fd-muted-foreground">
            {step.body}
          </p>
          {index === steps.length - 1 ? (
            <div className="pt-3">
              <ButtonLink
                to="/docs/$"
                params={{ _splat: "sdk/why-ensforge" }}
                variant="ghost"
                label="Why ensforge"
                location="section"
                cta="how_it_fits_why"
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Intro({ className }: { readonly className?: string }) {
  return (
    <div className={cn("flex flex-col gap-5", className)}>
      <Heading>How ensforge fits in.</Heading>
      <Lede>
        It sits between your code and ENS on Ethereum: one client on viem, actions that know how ENS
        works, and every name answered the same way.
      </Lede>
    </div>
  );
}

export function HowItFits() {
  const section = useRef<HTMLElement>(null);
  const [state, setState] = useState(0);
  const active = Math.round(state);
  const reached = useRef(new Set<string>());
  useSectionView(section, "how_it_fits");

  // Each step counts once per page view, however often the reader scrolls back over it.
  useEffect(() => {
    const step = steps[active - 1];
    if (!step || reached.current.has(step.id)) return;

    reached.current.add(step.id);
    track("how_it_fits_step_reached", { step_id: step.id, index: active - 1 });
  }, [active]);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;

      const element = section.current;
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      const progress = clamp(-rect.top / Math.max(travel, 1));

      // Overshoot slightly so the last step settles before the pinned section scrolls away, and
      // ease within each step so plates snap between states instead of tracking the scroll 1:1.
      const raw = progress * (STATES - 1) * 1.08;
      const whole = Math.min(Math.floor(raw), STATES - 1);
      const eased = whole + smooth(0.3, 0.75, raw - whole);

      setState(Math.min(eased, STATES - 1));
    };

    // Coalesce scroll and resize events into at most one update per animation frame.
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const current = active > 0 ? steps[active - 1] : undefined;

  // The rail's bright head rests on the current step's marker and drifts with the scroll
  // between steps, so it follows the reader without running past the step being read.
  const fill =
    active === 0
      ? `calc((50% - 4rem) * ${Math.min(state * 2, 1).toFixed(3)})`
      : `calc(50% - 4rem + ${((state - active) * 28).toFixed(2)}%)`;

  return (
    <section
      ref={section}
      id="how_it_fits"
      data-section=""
      aria-label="How ensforge fits into an app"
      className={cn("relative border-t border-(--ek-line)", `ek-step-${Math.max(active - 1, 0)}`)}
      style={{ height: `${STATES * 90}svh` }}
    >
      <div className="sticky top-15 h-[calc(100svh-3.75rem)] overflow-hidden">
        <Container className="grid h-full max-w-[1400px] grid-rows-[minmax(0,1.1fr)_auto] lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:grid-rows-1">
          <div className="relative order-2 py-8 lg:order-1 lg:h-full lg:py-0">
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 hidden w-px bg-(--ek-line) lg:block"
            >
              <span className="ek-rail-fill absolute inset-x-0 top-0" style={{ height: fill }} />
            </span>
            <div className="relative hidden h-full lg:block">
              <Intro
                className={cn(
                  "absolute inset-x-0 top-[calc(50%-10rem)] ps-10 transition-[opacity,translate] duration-500 ease-out-expo",
                  active === 0 ? "opacity-100" : "pointer-events-none -translate-y-4 opacity-0",
                )}
              />
              {steps.map((step, index) => (
                <StepItem key={step.id} step={step} index={index} active={active} />
              ))}
            </div>
            <div className="flex flex-col gap-3 lg:hidden" aria-live="polite">
              {current ? (
                <>
                  <p className="font-mono text-xs tracking-[0.08em] text-(--step) uppercase">
                    0{active} {current.label}
                  </p>
                  <h3 className="text-3xl font-light tracking-[-0.03em]">{current.title}</h3>
                  <p className="leading-relaxed text-fd-muted-foreground">{current.body}</p>
                </>
              ) : (
                <Intro />
              )}
            </div>
          </div>
          <div className="ek-dotted relative order-1 flex min-h-0 items-center justify-center border-(--ek-line) lg:order-2 lg:border-s">
            <StackVisual state={state} active={active} />
          </div>
        </Container>
      </div>
    </section>
  );
}
