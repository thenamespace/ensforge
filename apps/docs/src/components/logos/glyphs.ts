/** Each mark's glyph on the 100 × 100 artboard (see `BrandLogo`). */
export const glyphs = {
  /** An anvil: the horn, the waist and the base. */
  ensforge: "M16 30H80L71 40H38ZM43 44H63L58 51H43ZM31 55H77L68 65H22Z",
  /** `@ensforge/sdk`: the hammer every other package is used through. */
  sdk: "M28 29H78L69 40H28ZM49 44H60L48 71H37Z",
  /** `@ensforge/contracts`: blocks, the deployed contracts everything reads. */
  contracts: "M33 31H52L45 40H26ZM58 31H77L70 40H51ZM28 44H72L65 53H21ZM33 57H65L58 66H26Z",
  /** `@ensforge/react`: a bolt, for reads that react to every change. */
  react: "M57 22L36 51H50L42 78L66 46H52L62 22Z",
  /** `@ensforge/hca`: a shield, for the account the user holds. */
  hca: "M26 28H78L71 37H19ZM29 41H72L65 50H22ZM33 54H63L44 72Z",
} as const;
