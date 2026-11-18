import { BrandLogo, type LogoProps } from "./brand-logo";
import { glyphs } from "./glyphs";

export { glyphs } from "./glyphs";
export { type LogoProps, type LogoVariant, logoColors } from "./brand-logo";

export function EnsforgeLogo(props: LogoProps) {
  return <BrandLogo glyph={glyphs.ensforge} {...props} />;
}

export function SdkLogo(props: LogoProps) {
  return <BrandLogo glyph={glyphs.sdk} {...props} />;
}

export function ContractsLogo(props: LogoProps) {
  return <BrandLogo glyph={glyphs.contracts} {...props} />;
}

export function ReactLogo(props: LogoProps) {
  return <BrandLogo glyph={glyphs.react} {...props} />;
}

export function HcaLogo(props: LogoProps) {
  return <BrandLogo glyph={glyphs.hca} {...props} />;
}
