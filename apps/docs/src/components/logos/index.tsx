import { type LogoProps, TextLogo } from "./text-logo";

export { type LogoProps, type LogoVariant, logoColors } from "./text-logo";

export function EnsforgeLogo(props: LogoProps) {
  return <TextLogo text="ef" {...props} />;
}

export function SdkLogo(props: LogoProps) {
  return <TextLogo text="S" {...props} />;
}

export function ContractsLogo(props: LogoProps) {
  return <TextLogo text="C" {...props} />;
}

export function ReactLogo(props: LogoProps) {
  return <TextLogo text="R" {...props} />;
}

export function HcaLogo(props: LogoProps) {
  return <TextLogo text="H" {...props} />;
}
