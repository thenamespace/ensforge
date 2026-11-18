/** Each mark's glyph on the 100 × 100 artboard (see `BrandLogo`). */
export const glyphs = {
  /** An anvil: horn and face, then the pinched waist on a base with two feet. */
  ensforge: "M10 31L30 28H84L88 32V45H40L30 41ZM50 50H74L70 58L83 64V73H67V69H57V73H41V64L54 58Z",
  /** `@ensforge/sdk`: the hammer, the tool everything else is worked with. */
  sdk: "M20 28H30V48H20L16 44V32ZM34 28H78L84 34V42L78 48H34ZM46 52H56L58 80H44Z",
  /** `@ensforge/contracts`: stacked ingots, the material the rest is made from. */
  contracts: "M36 37H64L68 52H32ZM15 57H45L49 72H11ZM55 57H85L89 72H51Z",
  /** `@ensforge/react`: a bolt, for reads that react to every change. */
  react: "M59 16L32 54H48L41 84L69 44H53L64 16Z",
  /** `@ensforge/hca`: a shield with a keyhole, for the account the user holds. */
  hca: "M50 19L79 28V49L50 81L21 49V28ZM50 34L57 41L53.5 44.5V58H46.5V44.5L43 41Z",
} as const;
