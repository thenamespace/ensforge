import { Schema } from "effect";

const uint32 = Schema.makeFilter<bigint>((value) =>
  value >= 0n && value <= 0xffff_ffffn ? true : "Expected a uint32 coin type",
);

export const CoinType = Schema.BigInt.pipe(Schema.check(uint32), Schema.brand("CoinType"));

export type CoinType = typeof CoinType.Type;
