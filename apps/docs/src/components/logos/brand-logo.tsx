import type { ReactNode, SVGProps } from "react";

export const logoColors = {
  background: "#070707",
  foreground: "#f8f8f8",
} as const;

export type LogoVariant = "mark" | "badge";

export interface LogoProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  /**
   * `mark` draws only the glyph in `currentColor` (white unless recolored), cropped to its
   * square. `badge` draws it on the brand's black square.
   *
   * @defaultValue "mark"
   */
  readonly variant?: LogoVariant;
  /** Accessible name. Omit for decorative usage. */
  readonly title?: string;
}

/** Filled shapes get a 3-unit corner radius from a same-color stroke with round joins. */
export const rounded = {
  fill: "currentColor",
  stroke: "currentColor",
  strokeWidth: 6,
  strokeLinejoin: "round",
} as const;

/** Lines drawn with round caps and joins, `width` units thick. */
export const line = (width: number) =>
  ({
    fill: "none",
    stroke: "currentColor",
    strokeWidth: width,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  }) as const;

/**
 * Every mark is drawn on a 100 × 100 artboard with the same corner radius and line weights;
 * the glyph fits 12–88, so `mark` crops to 8–92.
 */
export function BrandLogo({
  variant = "mark",
  title,
  children,
  ...props
}: LogoProps & { readonly children: ReactNode }) {
  const isBadge = variant === "badge";

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={isBadge ? "0 0 100 100" : "8 8 84 84"}
      color={logoColors.foreground}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {isBadge ? <rect width={100} height={100} fill={logoColors.background} /> : null}
      {children}
    </svg>
  );
}
