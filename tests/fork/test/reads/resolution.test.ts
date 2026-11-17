import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Actions } from "@ensforge/sdk/effect";
import { Devnet } from "@ensforge/test-devnet";
import { expectFailure } from "@ensforge/test-harness";
import { Clients } from "@ensforge/test-integration/support/clients";

import { onFork } from "../support/fork.ts";

// Real names at the pinned fork blocks (`forkBlocks`): their facts are fixed until a pin moves.

describe("fork resolution", () => {
  onFork("mainnet")("mainnet", (it) => {
    it.effect("resolves ENSv2 names, ENSv1 names behind the bridge, and their primary names", () =>
      Effect.gen(function* () {
        const { reader } = yield* Clients;

        assert.deepInclude(yield* Actions.resolver.get(reader, { name: "nick.eth" }), {
          kind: "permissioned-resolver",
          inherited: false,
        });
        assert.strictEqual(
          yield* Actions.record.getAddress(reader, { name: "nick.eth" }),
          "0xb8c2C29ee19D8307cb7255e1Cd9CbDE883A267d5",
        );

        // Not migrated: ENSv2 serves it through the ENSv1 bridge, from its 2023 PublicResolver.
        assert.deepInclude(yield* Actions.resolver.get(reader, { name: "vitalik.eth" }), {
          address: "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63",
          kind: "public-resolver",
        });
        assert.strictEqual(
          yield* Actions.primaryName.get(reader, {
            address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
          }),
          "vitalik.eth",
        );
      }),
    );

    it.effect(
      "reads only the profiles an old resolver without multicall supports, behind the bridge",
      () =>
        Effect.gen(function* () {
          const { deployments } = yield* Devnet;
          const { reader } = yield* Clients;
          const resolver = "0x1da022710dF5002339274AaDEe8D58218e9D6AB5";
          const records = yield* Actions.record.get(reader, {
            name: "jessesum.eth",
            texts: ["url", "avatar"],
            addresses: ["eth", "btc"],
            contentHash: true,
          });

          // Records report the resolver that answered (the ENSv1 bridge); `resolver.get` the
          // ENSv1 resolver behind it.
          assert.strictEqual(records.resolver, deployments.v2?.migration.ensV1Resolver);
          assert.deepInclude(yield* Actions.resolver.get(reader, { name: "jessesum.eth" }), {
            address: resolver,
            kind: "public-resolver",
          });
          assert.strictEqual(records.addresses.eth, "0x8c4Eb6988A199DAbcae0Ce31052b3f3aC591787e");
          assert.deepStrictEqual(records.texts, { url: null, avatar: null });
        }),
      { meta: { cases: ["R12", "F02"] } },
    );

    it.effect(
      "follows CCIP-Read for off-chain names under an on-chain parent",
      () =>
        Effect.gen(function* () {
          const { reader } = yield* Clients;

          assert.deepInclude(yield* Actions.resolver.get(reader, { name: "jesse.base.eth" }), {
            kind: "extended",
            inherited: true,
          });
          assert.strictEqual(
            yield* Actions.record.getAddress(reader, { name: "jesse.base.eth" }),
            "0x2211d1D0020DAEA8039E46Cf1367962070d77DA9",
          );
          assert.strictEqual(
            yield* Actions.record.getAddress(reader, { name: "raffy.eth" }),
            "0x51050ec063d393217B436747617aD1C2285Aeeee",
          );
        }),
      { meta: { cases: ["F03"] } },
    );

    it.effect(
      "unwraps the Universal Resolver's ResolutionError for DNS names (KL-14)",
      () =>
        Effect.gen(function* () {
          const { reader } = yield* Clients;

          assert.deepInclude(yield* Actions.resolver.get(reader, { name: "ens.domains" }), {
            kind: "dns",
            inherited: true,
          });
          // No DNSSEC proof verifies since the root KSK rollover; the inner error comes back.
          const failure = yield* expectFailure(
            Actions.record.getAddress(reader, { name: "ens.domains" }),
            { _tag: "DnsError", code: "DNSSEC_PROOF_FAILED" },
          );
          assert.strictEqual(failure.context.revert?.errorName, "NoMatchingProof");
          assert.isNull(
            yield* Actions.record.getAddress(reader, { name: "ensforge-no-such-name-0.com" }),
          );
        }),
      { meta: { cases: ["D18", "R20", "M:F2"] } },
    );
  });

  onFork("sepolia")("sepolia", (it) => {
    it.effect(
      "resolves wrapped ENSv1 names and DNS names through the cut-over Universal Resolver",
      () =>
        Effect.gen(function* () {
          const { reader } = yield* Clients;

          assert.deepInclude(yield* Actions.name.get(reader, { name: "nick.eth" }), {
            status: "registered",
            wrapped: true,
          });
          assert.strictEqual(
            yield* Actions.record.getAddress(reader, { name: "nick.eth" }),
            "0xb8c2C29ee19D8307cb7255e1Cd9CbDE883A267d5",
          );

          assert.deepInclude(yield* Actions.resolver.get(reader, { name: "gregskril.com" }), {
            kind: "dns",
            inherited: true,
          });
          yield* expectFailure(Actions.record.getAddress(reader, { name: "gregskril.com" }), {
            _tag: "DnsError",
            code: "DNSSEC_PROOF_FAILED",
          });
        }),
      { meta: { cases: ["M:F3"] } },
    );
  });
});
