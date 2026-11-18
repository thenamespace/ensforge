import { BrandLogo, line, type LogoProps, rounded } from "./brand-logo";

export { type LogoProps, type LogoVariant, logoColors } from "./brand-logo";

/** The ensforge anvil's two pieces, filled with `rounded` (the OG renderer draws them too). */
export const anvilPaths = [
  "M15 33H31V49C23 49 17 43 15 33Z",
  "M43 31H85V49H72C71 56 73 61 80 63H83V73H45V63H48C55 61 57 56 56 49H43Z",
] as const;

/** ensforge: an anvil, its horn set apart from the face, waist and base. */
export function EnsforgeLogo(props: LogoProps) {
  return (
    <BrandLogo {...props}>
      {anvilPaths.map((d) => (
        <path key={d} {...rounded} d={d} />
      ))}
    </BrandLogo>
  );
}

/** `@ensforge/sdk`: `</>`, the code written with it. */
export function SdkLogo(props: LogoProps) {
  return (
    <BrandLogo {...props}>
      <path {...line(10)} d="M34 32L18 50L34 68M66 32L82 50L66 68M57 28L43 72" />
    </BrandLogo>
  );
}

/** `@ensforge/contracts`: an isometric block, the deployed contracts everything reads. */
export function ContractsLogo(props: LogoProps) {
  return (
    <BrandLogo {...props}>
      <path
        {...rounded}
        d="M50 20.5L70.4 32.3L50 44.1L29.6 32.3ZM76.4 42.7L76.4 66.3L56 78.1L56 54.5ZM23.6 42.7L44 54.5L44 78.1L23.6 66.3Z"
      />
    </BrandLogo>
  );
}

/** `@ensforge/react`: an atom, the React mark. */
export function ReactLogo(props: LogoProps) {
  return (
    <BrandLogo {...props}>
      {[0, 60, 120].map((angle) => (
        <ellipse
          key={angle}
          {...line(7)}
          cx={50}
          cy={50}
          rx={37}
          ry={13}
          transform={`rotate(${angle} 50 50)`}
        />
      ))}
      <circle fill="currentColor" cx={50} cy={50} r={7} />
    </BrandLogo>
  );
}

/** `@ensforge/hca`: a key, for the account the user holds. */
export function HcaLogo(props: LogoProps) {
  return (
    <BrandLogo {...props}>
      <circle {...line(10)} cx={29} cy={50} r={13} />
      <path {...line(10)} d="M42 50H83M72 50V61M83 50V58" />
    </BrandLogo>
  );
}
