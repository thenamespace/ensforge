import { describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk/effect";
import * as Ensforge from "@ensforge/sdk/internal/client/Ensforge";
import { expectFailure, scriptedTransport } from "@ensforge/test-harness";
import {
  createPublicClient,
  encodeErrorResult,
  encodeFunctionData,
  namehash,
  parseAbi,
} from "viem";
import { mainnet } from "viem/chains";

import { deployment } from "../world.js";

const universalResolver = deployment.v2.contracts.universalResolver;
const addrCall = encodeFunctionData({
  abi: parseAbi(["function addr(bytes32) view returns (address)"]),
  args: [namehash("nick.eth")],
});

// The Universal Resolver asks for an off-chain lookup of its own.
const offchainLookup = encodeErrorResult({
  abi: Abis.shared.errors,
  errorName: "OffchainLookup",
  args: [universalResolver, ["https://gateway.example/{sender}/{data}"], "0x", "0x12345678", "0x"],
} as never);

describe("resolver.resolve", () => {
  it.effect("does not follow an off-chain lookup when the client disables CCIP-Read", () =>
    Effect.gen(function* () {
      const { transport } = scriptedTransport(({ method }) => {
        if (method !== "eth_call") return undefined;
        throw Object.assign(new Error("execution reverted"), { code: 3, data: offchainLookup });
      });
      const ens = Ensforge.create({
        publicClient: createPublicClient({ chain: mainnet, transport }),
        ccipRead: false,
        batch: { multicall: false },
      });

      yield* expectFailure(Actions.resolver.resolve(ens, { name: "nick.eth", data: addrCall }), {
        _tag: "ConfigError",
        code: "CCIP_READ_DISABLED",
      });
    }),
  );
});
