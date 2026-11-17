import { describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Abis, Deployments } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk/effect";
import * as Ensforge from "@ensforge/sdk/internal/client/Ensforge";
import { expectFailure, scriptedTransport } from "@ensforge/test-harness";
import { createPublicClient, encodeErrorResult, encodeFunctionData, namehash } from "viem";
import { mainnet } from "viem/chains";

describe("resolver.resolve", () => {
  it.effect("does not follow an off-chain lookup when the client disables CCIP-Read", () =>
    Effect.gen(function* () {
      // The Universal Resolver asks for an off-chain lookup of its own.
      const lookup = encodeErrorResult({
        abi: Abis.shared.errors,
        errorName: "OffchainLookup",
        args: [
          Deployments.mainnet.v2.contracts.universalResolver,
          ["https://gateway.example/{sender}/{data}"],
          "0x",
          "0x12345678",
          "0x",
        ],
      });
      const { transport } = scriptedTransport(({ method }) => {
        if (method !== "eth_call") return undefined;
        throw Object.assign(new Error("execution reverted"), { code: 3, data: lookup });
      });
      const ens = Ensforge.create({
        publicClient: createPublicClient({ chain: mainnet, transport }),
        ccipRead: false,
        batch: { multicall: false },
      });
      const data = encodeFunctionData({
        abi: Abis.shared.addrResolver,
        functionName: "addr",
        args: [namehash("nick.eth")],
      });

      yield* expectFailure(Actions.resolver.resolve(ens, { name: "nick.eth", data }), {
        _tag: "ConfigError",
        code: "CCIP_READ_DISABLED",
      });
    }),
  );
});
