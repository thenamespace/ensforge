/** Each mark's glyph on the 100 × 100 artboard (see `BrandLogo`). */
export const glyphs = {
  /** An anvil: horn and face, then the pinched waist on a base with two feet. */
  ensforge: "M10 31L30 28H84L88 32V45H40L30 41ZM50 50H74L70 58L83 64V73H67V69H57V73H41V64L54 58Z",
  /** `@ensforge/sdk`: the hammer, the tool everything else is worked with. */
  sdk: "M20 28H30V48H20L16 44V32ZM34 28H78L84 34V42L78 48H34ZM46 52H56L58 80H44Z",
  /** `@ensforge/contracts`: stacked ingots, the material the rest is made from. */
  contracts: "M36 37H64L68 52H32ZM15 57H45L49 72H11ZM55 57H85L89 72H51Z",
  /** `@ensforge/react`: the atom's core; its faceted orbits are `reactOrbits`. */
  react: "M50 43L57 50L50 57L43 50Z",
  /** `@ensforge/hca`: a shield with a keyhole, for the account the user holds. */
  hca: "M50 19L79 28V49L50 81L21 49V28ZM50 34L57 41L53.5 44.5V58H46.5V44.5L43 41Z",
} as const;

/** `@ensforge/react`'s three octagonal orbits, drawn as a 4.5-unit outline around its core. */
export const reactOrbits =
  "M84.2 55L64.2 62L35.8 62L15.8 55L15.8 45L35.8 38L64.2 38L84.2 45ZM62.8 82.1L46.7 68.3L32.5 43.7L28.6 22.9L37.2 17.9L53.3 31.7L67.5 56.3L71.4 77.1ZM28.6 77.1L32.5 56.3L46.7 31.7L62.8 17.9L71.4 22.9L67.5 43.7L53.3 68.3L37.2 82.1Z";
