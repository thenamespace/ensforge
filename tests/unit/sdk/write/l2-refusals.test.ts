import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Deployments } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk/effect";
import { expectFailure } from "@ensforge/test-harness";
import type { Address } from "viem";

import { clientFor, resolverA, signer } from "../actions/world.js";

// Writes on names ENS does not hold say where the name lives. The scripted client reaches no L2.

/** `name` served by `resolver`, set on its ancestor `parent`. */
const served = (name: string, parent: string, resolver: Address) =>
  clientFor({
    name,
    names: { [parent]: { v1: { owner: signer, resolver } } },
    found: { resolver, offset: BigInt(name.length - parent.length) },
    extended: [resolver],
    served: { [resolver]: "offchain" },
  });

describe("writes on names outside ENS", () => {
  it.effect("refuses an off-chain provider's name, naming the provider", () =>
    Effect.gen(function* () {
      const coinbase = Deployments.offchainProviders.coinbase;
      const [resolver] = coinbase.resolvers;
      const { ens } = served("jesse.cb.id", "cb.id", resolver);

      const error = yield* expectFailure(
        Actions.record.set(ens, { name: "jesse.cb.id", texts: { url: "x" } }),
        { _tag: "NameStateError", code: "NAME_EXTERNAL" },
      );
      assert.strictEqual(
        error.shortMessage,
        "jesse.cb.id is served by Coinbase from its own database. ensforge can read it, not write it.",
      );
    }),
  );

  it.effect("refuses an unknown resolver's name with the general message", () =>
    Effect.gen(function* () {
      const { ens } = served("x.other.eth", "other.eth", resolverA);

      const error = yield* expectFailure(
        Actions.resolver.set(ens, { name: "x.other.eth", resolver: resolverA }),
        { _tag: "NameStateError", code: "NAME_EXTERNAL" },
      );
      assert.include(error.shortMessage, "its parent's resolver serves it");
    }),
  );

  it.effect("names the L2 of an L2 name, and needs the L2 for the writes it supports", () =>
    Effect.gen(function* () {
      const { basenames } = Deployments.mainnet.namespaces;
      const { ens } = served("jesse.base.eth", "base.eth", basenames.l1Resolver);

      const refused = yield* expectFailure(
        Actions.name.setManager(ens, { name: "jesse.base.eth", manager: resolverA }),
        { _tag: "NameStateError", code: "NAME_EXTERNAL" },
      );
      // A chain the client does not reach has no name to show.
      assert.strictEqual(
        refused.shortMessage,
        "jesse.base.eth lives on chain 8453 in Basenames. ensforge can change its records, resolver, TTL, subnames, owner and approvals, not this.",
      );
      assert.strictEqual(refused.context.chainId, 8453);
      yield* expectFailure(
        Actions.record.set(ens, { name: "jesse.base.eth", texts: { url: "x" } }),
        { _tag: "ConfigError", code: "CHAIN_NOT_CONFIGURED" },
      );
    }),
  );

  it.effect("needs the L2 for delegates and subnames of an L2 name", () =>
    Effect.gen(function* () {
      const { basenames } = Deployments.mainnet.namespaces;
      const { ens } = served("jesse.base.eth", "base.eth", basenames.l1Resolver);
      const unreachable = { _tag: "ConfigError", code: "CHAIN_NOT_CONFIGURED" } as const;

      yield* expectFailure(
        Actions.approval.getDelegate(ens, { name: "jesse.base.eth", delegate: resolverA }),
        unreachable,
      );
      yield* expectFailure(
        Actions.approval.setDelegate(ens, {
          name: "jesse.base.eth",
          delegate: resolverA,
          approved: true,
        }),
        unreachable,
      );
      yield* expectFailure(
        Actions.subname.update(ens, { name: "pay.jesse.base.eth", owner: resolverA }),
        unreachable,
      );
      yield* expectFailure(
        Actions.subname.remove(ens, { name: "pay.jesse.base.eth" }),
        unreachable,
      );
    }),
  );
});
