import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { Name } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import * as Ensforge from "@ensforge/sdk/internal/client/Ensforge";
import { primaryNameCoinType, reverseName } from "@ensforge/sdk/internal/internal/reverse/coin";
import { expectFailure, scriptedTransport } from "@ensforge/test-harness";
import { createPublicClient, encodeErrorResult, zeroAddress, type Hex } from "viem";
import { mainnet } from "viem/chains";

import { clientFor, other } from "../world.js";

const revert = (errorName: string, args: readonly unknown[]) =>
  encodeErrorResult({ abi: Abis.shared.errors, errorName, args } as never);

/** `primaryName.get` against a Universal Resolver that reverts with `data`. */
const readReverting = (data: Hex, strict: boolean) => {
  const { transport } = scriptedTransport(({ method }) => {
    if (method !== "eth_call") return undefined;
    throw Object.assign(new Error("execution reverted"), { code: 3, data });
  });
  const ens = Ensforge.create({
    publicClient: createPublicClient({
      chain: mainnet,
      transport: (options) => transport({ ...options, retryCount: 0 }),
    }),
    batch: { multicall: false },
  });
  return Actions.primaryName.get(ens, { address: other, strict });
};

describe("primaryName.get", () => {
  // Reverse names are keyed by EVM addresses: the default reverse resolver answers other coins
  // with `UnreachableName`, and the Universal Resolver finds no resolver for coin 0.
  it.effect(
    "refuses coins that are not EVM chains before reading anything",
    () =>
      Effect.gen(function* () {
        const { ens, calls } = clientFor({ name: "alice.eth" });

        for (const [address, coin] of [
          [other, "btc"],
          [zeroAddress, 0n],
          [other, 2n ** 32n],
        ] as const) {
          yield* expectFailure(Actions.primaryName.get(ens, { address, coin }), {
            _tag: "InvalidInputError",
            code: "INVALID_COIN_TYPE",
          });
        }
        assert.deepStrictEqual(calls, []);
      }),
    { meta: { cases: ["P06", "P29", "K11"] } },
  );

  // ENSIP-19: Ethereum and its testnets read `addr.reverse` (coin 60); an L2 testnet reads its own
  // chain's namespace, Base Sepolia's `80014a34.reverse`.
  it.effect(
    "reads each chain's reverse namespace",
    () =>
      Effect.gen(function* () {
        const label = other.slice(2).toLowerCase();

        assert.strictEqual(
          reverseName(other, yield* primaryNameCoinType(undefined)),
          `${label}.addr.reverse`,
        );
        assert.strictEqual(
          reverseName(other, yield* primaryNameCoinType({ chainId: 84_532 })),
          `${label}.80014a34.reverse`,
        );
        assert.strictEqual(
          reverseName(other, yield* primaryNameCoinType("default")),
          `${label}.default.reverse`,
        );
      }),
    { meta: { cases: ["P28"] } },
  );

  // The Universal Resolver reverts with the name it found no resolver for, or the profile the
  // resolver lacked; only the reverse name's own failures mean no primary name was set.
  it.effect("tells a primary name that does not resolve from an unset one, with strict", () =>
    Effect.gen(function* () {
      for (const [label, data, code] of [
        [
          "reverse name without a resolver",
          revert("ResolverNotFound", [Name.dnsEncode(reverseName(other, 60n))]),
          "PRIMARY_NAME_NOT_SET",
        ],
        [
          "reverse resolver without name()",
          revert("UnsupportedResolverProfile", ["0x691f3431"]),
          "PRIMARY_NAME_NOT_SET",
        ],
        [
          "reverse resolver reverting without data",
          revert("ResolverError", ["0x"]),
          "PRIMARY_NAME_NOT_SET",
        ],
        [
          "primary name without a resolver",
          revert("ResolverNotFound", [Name.dnsEncode("nick.eth")]),
          "PRIMARY_NAME_MISMATCH",
        ],
        [
          "primary name behind the ENSv1 bridge without a resolver",
          revert("ResolverError", [revert("UnreachableName", [Name.dnsEncode("nick.eth")])]),
          "PRIMARY_NAME_MISMATCH",
        ],
        [
          "primary name's resolver without code",
          revert("ResolverNotContract", [Name.dnsEncode("nick.eth"), other]),
          "PRIMARY_NAME_MISMATCH",
        ],
        [
          "primary name's resolver without addr()",
          revert("UnsupportedResolverProfile", ["0x3b3b57de"]),
          "PRIMARY_NAME_MISMATCH",
        ],
        [
          "primary name's resolver without addr(bytes32,uint256)",
          revert("UnsupportedResolverProfile", ["0xf1cb7e06"]),
          "PRIMARY_NAME_MISMATCH",
        ],
      ] as const) {
        const error = yield* expectFailure(readReverting(data, true), {
          _tag: "NotFoundError",
          code,
        });
        assert.isDefined(error.cause, label);
        assert.isNull(yield* readReverting(data, false), label);
      }
    }),
  );
});
