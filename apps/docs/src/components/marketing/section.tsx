import { type ComponentProps, type CSSProperties, type ReactNode, useRef } from "react";

import { cn } from "@/lib/cn";

import { useSectionView } from "./hooks";

/** Stagger index for `[data-reveal]` elements. */
export const revealStyle = (index: number) => ({ "--reveal-index": index }) as CSSProperties;

/** Page-width container shared by every marketing section. */
export function Container({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-[1240px] px-5 md:px-8", className)} {...props} />;
}

interface SectionProps extends ComponentProps<"section"> {
  /** Draws the hairline rule across the full viewport at the top of the section. */
  readonly rule?: boolean;
}

/** Full-bleed band, separated from its neighbours by a hairline rule. */
export function Section({ rule = true, className, id, ...props }: SectionProps) {
  const ref = useRef<HTMLElement>(null);
  useSectionView(ref, id);

  return (
    <section
      ref={ref}
      {...(id ? { id, "data-section": "" } : {})}
      className={cn("relative", rule && "border-t border-(--ek-line)", className)}
      {...props}
    />
  );
}

/**
 * Section label written as a code comment, `// 01 Packages`: the same voice as effect.website
 * and as comments in the snippets, so the page reads like the source it describes.
 */
export function Eyebrow({
  index,
  children,
  className,
}: {
  readonly index?: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-2 font-mono text-xs text-fd-muted-foreground",
        className,
      )}
    >
      <span aria-hidden="true" className="text-ek-accent">
        {"//"}
      </span>
      {index ? <span className="tabular-nums">{index}</span> : null}
      <span className="text-fd-foreground/80">{children}</span>
    </p>
  );
}

/** Light, tightly tracked display heading. */
export function Heading({
  as: Tag = "h2",
  className,
  ...props
}: ComponentProps<"h2"> & { readonly as?: "h1" | "h2" | "h3" }) {
  return (
    <Tag
      className={cn(
        "font-light tracking-[-0.035em] text-balance text-fd-foreground",
        Tag === "h1"
          ? "text-[44px] leading-[1.02] sm:text-6xl md:text-[76px]"
          : "text-[32px] leading-[1.08] md:text-[44px]",
        className,
      )}
      {...props}
    />
  );
}

export function Lede({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "max-w-[56ch] text-[17px] leading-relaxed font-light text-pretty text-fd-muted-foreground md:text-lg",
        className,
      )}
      {...props}
    />
  );
}

/** Section header: eyebrow, heading and an optional lede, revealed on scroll. */
export function SectionHeader({
  index,
  eyebrow,
  title,
  lede,
  className,
  children,
  wide = false,
}: {
  /** Let the lede run the full width (one line on desktop). */
  readonly wide?: boolean;
  readonly index?: string;
  readonly eyebrow: ReactNode;
  readonly title: ReactNode;
  readonly lede?: ReactNode;
  readonly className?: string;
  readonly children?: ReactNode;
}) {
  return (
    <div
      className={cn("flex flex-col gap-5 md:flex-row md:items-end md:justify-between", className)}
    >
      <div className={cn("flex flex-col gap-5", wide ? "max-w-none" : "max-w-3xl")} data-reveal>
        <Eyebrow {...(index ? { index } : {})}>{eyebrow}</Eyebrow>
        <Heading>{title}</Heading>
        {lede ? <Lede className={wide ? "max-w-none" : undefined}>{lede}</Lede> : null}
      </div>
      {children}
    </div>
  );
}
