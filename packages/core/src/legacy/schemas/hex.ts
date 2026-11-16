import { Schema } from "effect";

export const Hex = Schema.TemplateLiteral(["0x", Schema.String]).pipe(
  Schema.check(
    Schema.isPattern(/^0x(?:[0-9a-fA-F]{2})*$/, {
      message: "Expected byte-aligned hexadecimal data",
    }),
  ),
);

export type Hex = typeof Hex.Type;
