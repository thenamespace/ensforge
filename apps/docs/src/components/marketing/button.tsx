import type { ComponentProps, MouseEventHandler, ReactNode } from "react";

import { Link, type LinkProps } from "@tanstack/react-router";

import { track } from "@/lib/analytics/client";
import type { Location } from "@/lib/analytics/events";
import { cn } from "@/lib/cn";
import { site } from "@/lib/site";

const variants = {
  primary:
    "bg-fd-primary text-fd-primary-foreground hover:bg-fd-primary/90 shadow-[0_0_0_1px_var(--ek-line-strong)]",
  ghost:
    "text-fd-foreground border border-(--ek-line-strong) hover:bg-fd-accent hover:border-fd-foreground/25",
} as const;

const base =
  "inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring";

interface ButtonContentProps {
  readonly label: string;
  readonly icon?: ReactNode;
  /** Where on the page the button sits, for analytics. */
  readonly location?: Location;
  /** Stable name of the call to action, for analytics. */
  readonly cta?: string;
}

function hrefOf({ to, params }: { readonly to?: unknown; readonly params?: unknown }) {
  if (typeof to !== "string") return "";

  const splat =
    typeof params === "object" && params !== null && "_splat" in params
      ? String(params._splat)
      : "";

  return to.replace("$", splat);
}

function hostOf(href: string) {
  try {
    return new URL(href, site.url).hostname;
  } catch {
    return "";
  }
}

function Content({ label, icon }: ButtonContentProps) {
  return (
    <>
      {label}
      {icon}
    </>
  );
}

export function ButtonLink({
  variant = "primary",
  label,
  icon,
  className,
  location = "section",
  cta,
  onClick,
  ...props
}: LinkProps &
  ButtonContentProps & {
    readonly variant?: keyof typeof variants;
    readonly className?: string;
    readonly onClick?: MouseEventHandler<HTMLAnchorElement>;
  }) {
  return (
    <Link
      className={cn(base, variants[variant], className)}
      title={label}
      onClick={(event) => {
        onClick?.(event);
        track("cta_clicked", {
          cta: cta ?? label,
          location,
          href: hrefOf(props),
        });
      }}
      {...props}
    >
      <Content label={label} {...(icon ? { icon } : {})} />
    </Link>
  );
}

export function ExternalButton({
  variant = "ghost",
  label,
  icon,
  className,
  location = "section",
  cta,
  href = "",
  onClick,
  ...props
}: ComponentProps<"a"> & ButtonContentProps & { readonly variant?: keyof typeof variants }) {
  return (
    <a
      title={label}
      className={cn(base, variants[variant], className)}
      target="_blank"
      rel="noreferrer"
      href={href}
      onClick={(event) => {
        onClick?.(event);

        track("outbound_link_clicked", { destination: href, host: hostOf(href), location });
        if (cta) track("cta_clicked", { cta, location, href });
      }}
      {...props}
    >
      <Content label={label} {...(icon ? { icon } : {})} />
    </a>
  );
}
