import { cn } from "@/lib/cn";

import type { Accent, CardSlot } from "./layout";
import type { StoryCard } from "./stories";

/**
 * The story cards: small upright UI cards floating above their pads on the hero floor, each
 * joined to its pad by a thin stem in the card's accent. When the story changes, each card's
 * content cross-fades while the cards themselves stay put.
 */

const accentColor: Record<Accent, string> = {
  blue: "var(--ens-blue)",
  sky: "var(--ens-sky)",
  green: "var(--ens-contracts)",
  magenta: "var(--ens-react)",
  yellow: "var(--ens-hca)",
};

function CardBody({ card }: { readonly card: StoryCard }) {
  return (
    <div className="ens-card-in flex size-full flex-col gap-1.5">
      <p className="text-[9px] tracking-[0.14em] text-(--card-accent) uppercase">● {card.label}</p>
      <p className="flex items-center gap-2 text-[13px] font-semibold text-fd-foreground">
        {card.avatar ? (
          <img
            src={card.avatar}
            alt=""
            width={20}
            height={20}
            loading="lazy"
            decoding="async"
            className="size-5 shrink-0 rounded-full"
          />
        ) : null}
        <span className="truncate">{card.name}</span>
      </p>
      {card.migrated ? (
        <p className="flex items-center gap-2">
          <span className="rounded border border-(--ek-line-strong) px-1.5">v1</span>
          <span className="h-px w-6 bg-(--card-accent)" />
          <span className="rounded border border-(--card-accent) px-1.5 text-(--card-accent)">
            v2
          </span>
        </p>
      ) : null}
      {card.rows.map(([key, value]) => (
        <p key={key} className="flex justify-between gap-3">
          <span className="truncate">{key}</span>
          <span className="shrink-0 text-fd-foreground">{value}</span>
        </p>
      ))}
      {card.footer ? <p className="mt-auto text-fd-muted-foreground/80">{card.footer}</p> : null}
    </div>
  );
}

export function StoryCards({
  slots,
  cards,
  storyId,
  className,
}: {
  readonly slots: readonly CardSlot[];
  /** One card per slot, in slot order. */
  readonly cards: readonly StoryCard[];
  /** Changes when the story does, so each card's content fades in anew. */
  readonly storyId: string;
  readonly className?: string;
}) {
  return (
    <div aria-hidden="true" className={cn("pointer-events-none", className)}>
      {slots.map((slot, index) => {
        const card = cards[index];
        if (!card) return null;

        const style = { "--card-accent": accentColor[card.accent] };
        const place = `${slot.pad[0]}:${slot.pad[1]}`;

        return (
          <div key={place} style={style}>
            <span
              className="ens-card-stem absolute w-px"
              style={{
                left: slot.padX,
                top: slot.top + slot.height,
                height: slot.padY - slot.top - slot.height,
              }}
            />
            <div
              className={cn(
                "absolute overflow-hidden rounded-[10px] border border-(--ek-line-strong) bg-fd-card px-3 py-2.5 font-mono text-[10.5px] leading-snug text-fd-muted-foreground",
                "border-t-(--card-accent) shadow-[0_12px_30px_-14px_#000] transition-[border-color] duration-700",
              )}
              style={{ left: slot.left, top: slot.top, width: slot.width, height: slot.height }}
            >
              <CardBody key={`${storyId}-${place}`} card={card} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
