import { Schema } from "effect";

import { isAddress, type Address } from "viem";

import { Namehash } from "./hash.js";
import { NormalizedName } from "./name.js";
import { EnsProtocol } from "./protocol.js";

export const EthereumAddress = Schema.declare<Address>(
  (value): value is Address => typeof value === "string" && isAddress(value),
  {
    identifier: "EthereumAddress",
    description: "A valid Ethereum address",
  },
);

export type EthereumAddress = typeof EthereumAddress.Type;

const uint256 = Schema.makeFilter<bigint>((value) =>
  value >= 0n && value < 1n << 256n ? true : "Expected a uint256 registry resource",
);

export const RegistryResource = Schema.BigInt.pipe(
  Schema.check(uint256),
  Schema.brand("RegistryResource"),
);

export type RegistryResource = typeof RegistryResource.Type;

export const CanonicalNameIdentity = Schema.Struct({
  name: NormalizedName,
  namehash: Namehash,
  chainId: Schema.Int.pipe(
    Schema.check(Schema.isGreaterThanOrEqualTo(0, { message: "Expected a non-negative chain ID" })),
  ),
  registry: EthereumAddress,
  protocol: EnsProtocol,
  resource: Schema.optional(RegistryResource),
});

export type CanonicalNameIdentity = typeof CanonicalNameIdentity.Type;
