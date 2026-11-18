import type { SVGProps } from "react";

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

/**
 * The marks are drawn on a 100 × 100 artboard in one language: flat slabs sheared to the same
 * italic angle, white on the brand's black.
 */
export function BrandLogo({
  variant = "mark",
  title,
  glyph,
  ...props
}: LogoProps & { readonly glyph: string }) {
  const isBadge = variant === "badge";

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={isBadge ? "0 0 100 100" : "14 14 72 72"}
      color={logoColors.foreground}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {isBadge ? <rect width={100} height={100} fill={logoColors.background} /> : null}
      <path fill="currentColor" fillRule="evenodd" d={glyph} />
    </svg>
  );
}
