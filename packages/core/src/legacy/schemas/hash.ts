import { Schema } from "effect";

import { Hex } from "./hex.js";

export const Bytes32 = Hex.pipe(
  Schema.check(
    Schema.isPattern(/^0x[0-9a-fA-F]{64}$/, {
      message: "Expected a 32-byte hexadecimal value",
    }),
  ),
);

export type Bytes32 = typeof Bytes32.Type;

export const Namehash = Bytes32.pipe(Schema.brand("Namehash"));

export type Namehash = typeof Namehash.Type;

export const Labelhash = Bytes32.pipe(Schema.brand("Labelhash"));

export type Labelhash = typeof Labelhash.Type;
