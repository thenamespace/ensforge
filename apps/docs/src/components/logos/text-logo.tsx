import type { SVGProps } from "react";

export const logoColors = {
  background: "#070707",
  foreground: "#f8f8f8",
} as const;

export type LogoVariant = "mark" | "badge";

export interface LogoProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  /**
   * `mark` draws only the glyph in `currentColor` on a transparent background.
   * `badge` draws the glyph on the brand's black square.
   *
   * @defaultValue "mark"
   */
  readonly variant?: LogoVariant;
  /** Accessible name. Omit for decorative usage. */
  readonly title?: string;
}

/**
 * Placeholder mark: the given letters set in the mono face on a square artboard. It stands in
 * for the drawn ensforge and package logos until they exist.
 */
export function TextLogo({
  variant = "mark",
  title,
  text,
  ...props
}: LogoProps & { readonly text: string }) {
  const isBadge = variant === "badge";

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {isBadge ? <rect width={24} height={24} fill={logoColors.background} /> : null}
      <rect
        x={1.5}
        y={1.5}
        width={21}
        height={21}
        rx={5}
        fill="none"
        stroke={isBadge ? logoColors.foreground : "currentColor"}
        strokeWidth={1.5}
      />
      <text
        x={12}
        y={12}
        dominantBaseline="central"
        textAnchor="middle"
        fontFamily="JetBrains Mono Variable, ui-monospace, monospace"
        fontSize={text.length > 1 ? 9.5 : 12}
        fontWeight={700}
        fill={isBadge ? logoColors.foreground : "currentColor"}
      >
        {text}
      </text>
    </svg>
  );
}
