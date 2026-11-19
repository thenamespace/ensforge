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
 * Every mark is a solid, sharp-edged glyph on a 100 × 100 artboard, fitting 10–90 (an `outline`
 * adds mitered lines, as React's orbits); `mark` crops to 8–92.
 */
export function BrandLogo({
  variant = "mark",
  title,
  glyph,
  outline,
  ...props
}: LogoProps & { readonly glyph: string; readonly outline?: string }) {
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
      {outline === undefined ? null : (
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth={4.5}
          strokeLinejoin="miter"
          d={outline}
        />
      )}
      <path fill="currentColor" fillRule="evenodd" d={glyph} />
    </svg>
  );
}
