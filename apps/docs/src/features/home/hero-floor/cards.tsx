import type { CSSProperties, ReactNode } from "react";

import { CheckIcon } from "lucide-react";

import { cn } from "@/lib/cn";

import { avatarSrc } from "../avatars";
import { type Accent, type CardId, type FloorCard, PLANE } from "./layout";

/**
 * The component cards lying on the hero floor: small, crisp mockups of what ensforge reads and
 * writes. Each is plain HTML laid onto the floor plane with a CSS matrix, so its text stays
 * sharp. Names, addresses and records are real mainnet values.
 */

const accentColor: Record<Accent, string> = {
  blue: "var(--ens-blue)",
  sky: "var(--ens-sky)",
  green: "var(--ens-contracts)",
  magenta: "var(--ens-react)",
  yellow: "var(--ens-hca)",
};

function Avatar({ name, size }: { readonly name: string; readonly size: number }) {
  const src = avatarSrc(name);

  return src ? (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className="shrink-0 rounded-full border border-(--card-accent)"
    />
  ) : (
    <span
      className="shrink-0 rounded-full border border-(--card-accent)"
      style={{ width: size, height: size }}
    />
  );
}

function Shell({
  accent,
  label,
  children,
}: {
  readonly accent: Accent;
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div
      className="flex size-full flex-col gap-2 rounded-lg border border-(--ek-line-strong) bg-fd-card px-3 py-2.5 font-mono text-[10px] leading-tight text-fd-muted-foreground"
      style={{ "--card-accent": accentColor[accent] }}
    >
      <p className="flex items-center gap-1.5 text-[8.5px] tracking-[0.12em] text-(--card-accent) uppercase">
        <span className="size-1.5 rounded-full bg-(--card-accent)" />
        {label}
      </p>
      {children}
    </div>
  );
}

function Row({ name, value }: { readonly name: string; readonly value: string }) {
  return (
    <p className="grid grid-cols-[76px_1fr] gap-2">
      <span>{name}</span>
      <span className="truncate text-fd-foreground">{value}</span>
    </p>
  );
}

const content: Record<CardId, () => ReactNode> = {
  profile: () => (
    <Shell accent="sky" label="profile">
      <div className="flex items-center gap-2">
        <Avatar name="nick.eth" size={26} />
        <div>
          <p className="text-[12px] font-semibold text-fd-foreground">nick.eth</p>
          <p>0xb8c2…67d5</p>
        </div>
      </div>
      <Row name="com.github" value="arachnid" />
      <Row name="com.twitter" value="nicksdjohnson" />
      <Row name="url" value="ens.domains" />
    </Shell>
  ),
  primary: () => (
    <Shell accent="blue" label="primary name">
      <div className="flex items-center justify-between gap-2">
        <span className="text-fd-foreground">0xd8dA…6045</span>
        <span className="text-(--card-accent)">⇄</span>
        <span className="flex items-center gap-1.5 text-fd-foreground">
          <Avatar name="vitalik.eth" size={16} />
          vitalik.eth
        </span>
      </div>
      <p>verified both ways</p>
    </Shell>
  ),
  migrate: () => (
    <Shell accent="blue" label="ensv1 → ensv2">
      <div className="flex items-center gap-2">
        <Avatar name="nick.eth" size={16} />
        <span className="text-[11px] text-fd-foreground">nick.eth</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="rounded border border-(--ek-line-strong) px-1.5 py-0.5">v1</span>
        <span className="text-(--card-accent)">→</span>
        <span className="rounded border border-(--card-accent) px-1.5 py-0.5 text-fd-foreground">
          v2
        </span>
        <span className="ms-auto">v2-migrated</span>
      </div>
    </Shell>
  ),
  records: () => (
    <Shell accent="magenta" label="records · envoy1084.eth">
      <p>
        <span className="text-(--card-accent)">+ </span>url{" "}
        <span className="text-fd-foreground">envoy1084.xyz</span>
      </p>
      <p>
        <span className="text-(--card-accent)">+ </span>com.github{" "}
        <span className="text-fd-foreground">envoy1084</span>
      </p>
      <p>
        <span className="text-(--card-accent)">+ </span>contenthash{" "}
        <span className="text-fd-foreground">ipfs://…</span>
      </p>
      <p className="mt-auto">3 changes · one plan</p>
    </Shell>
  ),
  batch: () => (
    <Shell accent="yellow" label="hca · one execution">
      {["setText(url)", "setAddr(eth)", "setContenthash"].map((write) => (
        <p key={write} className="flex items-center gap-1.5 text-fd-foreground">
          <CheckIcon aria-hidden="true" className="size-3 text-(--card-accent)" />
          {write}
        </p>
      ))}
      <p className="mt-auto">3 writes · 1 signature</p>
    </Shell>
  ),
  subname: () => (
    <Shell accent="green" label="subname">
      <p className="text-fd-foreground">base.eth</p>
      <div className="flex items-center gap-1.5 ps-2">
        <span className="text-(--card-accent)">└</span>
        <Avatar name="jesse.base.eth" size={16} />
        <span className="text-[11px] text-fd-foreground">jesse.base.eth</span>
      </div>
      <p className="ps-6">0x2211…7DA9</p>
    </Shell>
  ),
  register: () => (
    <Shell accent="green" label="register">
      <p className="text-[12px] font-semibold text-fd-foreground">yourname.eth</p>
      <Row name="duration" value="1 year" />
      <Row name="price" value="$5 / year" />
      <p className="mt-auto text-(--card-accent)">available</p>
    </Shell>
  ),
};

/** Lays one card onto the floor plane, its corner at plane point (u, v). */
const placement = (card: FloorCard): CSSProperties => ({
  width: card.w,
  height: card.h,
  transform: `matrix(${PLANE.ux}, ${PLANE.uy}, ${PLANE.vx}, ${PLANE.vy}, ${card.u * PLANE.ux + card.v * PLANE.vx}, ${card.u * PLANE.uy + card.v * PLANE.vy})`,
});

export function FloorCards({
  cards,
  className,
}: {
  readonly cards: readonly FloorCard[];
  readonly className?: string;
}) {
  return (
    <div aria-hidden="true" className={cn("pointer-events-none", className)}>
      {cards.map((card, index) => (
        <div
          key={card.id}
          className="absolute top-1/2 left-1/2 origin-top-left animate-ek-rise motion-reduce:animate-none"
          style={{ ...placement(card), animationDelay: `${300 + index * 80}ms` }}
        >
          {content[card.id]()}
        </div>
      ))}
    </div>
  );
}
