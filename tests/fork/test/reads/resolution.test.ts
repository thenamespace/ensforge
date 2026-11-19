import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Actions } from "@ensforge/sdk/effect";
import { expectFailure } from "@ensforge/test-harness";
import { Clients } from "@ensforge/test-integration/support/clients";

import { onFork } from "../support/fork.ts";

// Real names at the pinned fork blocks (`forkBlocks`): their facts are fixed until a pin moves.

describe("fork resolution", () => {
  onFork("mainnet")("mainnet", (it) => {
    it.effect("resolves ENSv2 names, ENSv1 names behind the bridge, and their primary names", () =>
      Effect.gen(function* () {
        const { reader } = yield* Clients;

        const nickResolver = yield* Actions.resolver.get(reader, { name: "nick.eth" });
        assert.deepInclude(nickResolver, { kind: "permissioned-resolver", inherited: false });
        const nickAddress = yield* Actions.record.getAddress(reader, { name: "nick.eth" });
        assert.strictEqual(nickAddress, "0xb8c2C29ee19D8307cb7255e1Cd9CbDE883A267d5");

        // Not migrated: ENSv2 serves it through the ENSv1 bridge, from its 2023 PublicResolver.
        const vitalikResolver = yield* Actions.resolver.get(reader, { name: "vitalik.eth" });
        assert.deepInclude(vitalikResolver, {
          address: "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63",
          kind: "public-resolver",
        });
        const vitalikPrimaryName = yield* Actions.primaryName.get(reader, {
          address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
        });
        assert.strictEqual(vitalikPrimaryName, "vitalik.eth");
      }),
    );

    it.effect(
      "reads only the profiles an old resolver without multicall supports, behind the bridge",
      () =>
        Effect.gen(function* () {
          const { reader } = yield* Clients;
          const resolver = "0x1da022710dF5002339274AaDEe8D58218e9D6AB5";
          const records = yield* Actions.record.get(reader, {
            name: "jessesum.eth",
            texts: ["url", "avatar"],
            addresses: ["eth", "btc"],
            contentHash: true,
          });

          // Records and `resolver.get` report the ENSv1 resolver behind the ENSv1 bridge.
          assert.strictEqual(records.resolver, resolver);
          const jessesumResolver = yield* Actions.resolver.get(reader, { name: "jessesum.eth" });
          assert.deepInclude(jessesumResolver, { address: resolver, kind: "public-resolver" });
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

          const jesseResolver = yield* Actions.resolver.get(reader, { name: "jesse.base.eth" });
          assert.deepInclude(jesseResolver, { kind: "extended", inherited: true });
          const jesseAddress = yield* Actions.record.getAddress(reader, { name: "jesse.base.eth" });
          assert.strictEqual(jesseAddress, "0x2211d1D0020DAEA8039E46Cf1367962070d77DA9");
          const raffyAddress = yield* Actions.record.getAddress(reader, { name: "raffy.eth" });
          assert.strictEqual(raffyAddress, "0x51050ec063d393217B436747617aD1C2285Aeeee");
        }),
      { meta: { cases: ["F03"] } },
    );

    it.effect("classifies names that L2 and off-chain namespaces serve", () =>
      Effect.gen(function* () {
        const { reader } = yield* Clients;
        const stateOf = (name: string) => Actions.name.get(reader, { name });

        // Basenames (an L2 namespace this client cannot reach: it has no Base transport), Uniswap,
        // and Coinbase under `cb.id` (reached through ENSv2's DNS TLD resolver).
        const jesse = yield* stateOf("jesse.base.eth");
        const uni = yield* stateOf("test.uni.eth");
        const coinbase = yield* stateOf("jesse.cb.id");
        // ENSv2's resolver declares ENSIP-10 without serving labels its registry lacks; DNS names
        // without an ENS record are claimed with `dns.claim`.
        const missing = yield* stateOf("ensforge-no-such-name-0.nick.eth");
        const dns = yield* stateOf("ensforge-no-such-name-0.com");

        const external = { kind: "offchain", status: "external", available: false } as const;
        assert.deepInclude(jesse, {
          kind: "l2",
          status: "external",
          available: false,
          chainId: 8453,
          inheritedResolver: "0xde9049636F4a1dfE0a64d1bFe3155C0A14C54F31",
        });
        assert.deepInclude(jesse.namespace, { kind: "l2", id: "basenames", parent: "base.eth" });
        assert.deepInclude(uni, external);
        assert.deepInclude(coinbase, {
          ...external,
          inheritedResolver: "0x1934FC75aD10d7eEd51dc7A92773cAc96A06BE56",
        });
        assert.deepInclude(missing, { kind: "available", available: true });
        assert.deepInclude(dns, { kind: "available", available: true });
      }),
    );

    it.effect(
      "unwraps the Universal Resolver's ResolutionError for DNS names (KL-14, KL-29)",
      () =>
        Effect.gen(function* () {
          const { reader } = yield* Clients;

          const ensDomainsResolver = yield* Actions.resolver.get(reader, { name: "ens.domains" });
          assert.deepInclude(ensDomainsResolver, { kind: "dns", inherited: true });
          // No DNSSEC proof verifies since the root KSK rollover (KL-29); the inner error comes back.
          const failure = yield* expectFailure(
            Actions.record.getAddress(reader, { name: "ens.domains" }),
            { _tag: "DnsError", code: "DNSSEC_PROOF_FAILED" },
          );
          assert.strictEqual(failure.context.revert?.errorName, "NoMatchingProof");
          const unknownAddress = yield* Actions.record.getAddress(reader, {
            name: "ensforge-no-such-name-0.com",
          });
          assert.isNull(unknownAddress);
        }),
      { meta: { cases: ["D13", "D18", "R20", "M:F2"] } },
    );
  });

  onFork("sepolia")("sepolia", (it) => {
    it.effect(
      "resolves wrapped ENSv1 names and DNS names through the cut-over Universal Resolver",
      () =>
        Effect.gen(function* () {
          const { reader } = yield* Clients;

          const nickState = yield* Actions.name.get(reader, { name: "nick.eth" });
          assert.deepInclude(nickState, { status: "registered", wrapped: true });
          const nickAddress = yield* Actions.record.getAddress(reader, { name: "nick.eth" });
          assert.strictEqual(nickAddress, "0xb8c2C29ee19D8307cb7255e1Cd9CbDE883A267d5");

          const gregResolver = yield* Actions.resolver.get(reader, { name: "gregskril.com" });
          assert.deepInclude(gregResolver, { kind: "dns", inherited: true });
          yield* expectFailure(Actions.record.getAddress(reader, { name: "gregskril.com" }), {
            _tag: "DnsError",
            code: "DNSSEC_PROOF_FAILED",
          });
        }),
      { meta: { cases: ["M:F3"] } },
    );
  });
});
