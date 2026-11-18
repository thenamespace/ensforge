/** Each mark's glyph on the 100 × 100 artboard (see `BrandLogo`), filled unless `stroke` is set. */
export const glyphs = {
  /** An anvil: the horn and face, then the waist flaring into the base. */
  ensforge: { d: "M8 33L30 26H90V39H38ZM42 43H66L59 55L72 63V72H28V63L41 55Z" },
  /** `@ensforge/sdk`: `</>`, the code you write with it. */
  sdk: {
    d: "M31 30L11 50L31 70H42L22 50L42 30ZM69 30L89 50L69 70H58L78 50L58 30ZM55 27H63L45 73H37Z",
  },
  /** `@ensforge/contracts`: an isometric block, the deployed contracts everything reads. */
  contracts: { d: "M50 16L80 33L50 50L20 33ZM18 38L47 55V86L18 69ZM53 55L82 38V69L53 86Z" },
  /** `@ensforge/react`: an atom of sharp orbits around a core. */
  react: {
    d: "M12 50L30 39L70 39L88 50L70 61L30 61ZM31 17.1L49.5 27.2L69.5 61.8L69 82.9L50.5 72.8L30.5 38.2ZM69 17.1L69.5 38.2L49.5 72.8L31 82.9L30.5 61.8L50.5 27.2Z",
    stroke: 5,
    core: "M50 43L57 50L50 57L43 50Z",
  },
  /** `@ensforge/hca`: a key, for the account the user holds. */
  hca: {
    d: "M32 30L49 40V60L32 70L15 60V40ZM32 41L25 45V55L32 59L39 55V45ZM49 45H88V55H49ZM70 55H79V66H70ZM81 55H88V63H81Z",
  },
} as const;
