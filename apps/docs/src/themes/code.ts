import githubLightDefault from "@shikijs/themes/github-light-default";
import vesper from "@shikijs/themes/vesper";
import type { ThemeRegistration } from "shiki";

/**
 * Vesper: near-monochrome with mint strings and peach accents, a close match for the zinc
 * surfaces and emerald ring. Pure white is softened to zinc-200 so code doesn't glare.
 */
export const ensforgeDark: ThemeRegistration = {
  ...vesper,
  name: "ensforge-dark",
  colors: {
    ...vesper.colors,
    "editor.background": "#111113",
    "editor.foreground": "#e4e4e7",
  },
  colorReplacements: {
    "#fff": "#e4e4e7",
    "#ffffff": "#e4e4e7",
    "#8b8b8b94": "#71717a",
  },
};

/** GitHub Light Default on the site's zinc-50 card surface. */
export const ensforgeLight: ThemeRegistration = {
  ...githubLightDefault,
  name: "ensforge-light",
  colors: {
    ...githubLightDefault.colors,
    "editor.background": "#fafafa",
  },
};
