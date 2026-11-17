import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Devnet, type DevnetInstance, type ProfileName } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectRejection } from "@ensforge/test-harness";
import { encodeAbiParameters, encodeFunctionData, namehash, parseAbi, type Address } from "viem";

import { call, ensforge, onProfile } from "../support/chain.ts";

// The fixture resolvers answer `addr(bytes32)`; ensforge's record reads use other profiles.
const addrCall = (name: string) =>
  encodeFunctionData({
    abi: parseAbi(["function addr(bytes32) view returns (address)"]),
    args: [namehash(name)],
  });
const answer = (address: Address) => encodeAbiParameters([{ type: "address" }], [address]);

/** Misbehaving resolvers: the error a strict read gives (a non-strict read gives nulls). */
const misbehaving = {
  "resolver.none": "RESOLVER_NOT_FOUND",
  "resolver.eoa": "RESOLVER_NOT_FOUND",
  "resolver.not-a-resolver": "RESOLVER_PROFILE_UNSUPPORTED",
  "resolver.reverting": "RESOLVER_PROFILE_UNSUPPORTED",
  "resolver.gas-burner": "RESOLVER_PROFILE_UNSUPPORTED",
  "resolver.returndata-bomb": "RESOLVER_PROFILE_UNSUPPORTED",
  "resolver.empty-answer": "RESOLVER_PROFILE_UNSUPPORTED",
  "resolver.malformed-answer": "RESOLVER_PROFILE_UNSUPPORTED",
  "resolver.unsupported-profile": "RESOLVER_PROFILE_UNSUPPORTED",
} as const;

/** After the launch the ENSv1 bridge serves premigrated ENSv1 names; before it, their own resolvers do. */
const servedBy = (devnet: DevnetInstance, profile: ProfileName, own: unknown) =>
  (profile === "mainnet-shaped" ? devnet.contracts["v2.ensV1Resolver"] : own) as Address;

describe("resolver reads", () => {
  for (const profile of ["v1-live", "mainnet-shaped"] as const) {
    onProfile(profile)(profile, (it) => {
      it.effect(
        "describes each generation and kind of resolver",
        () =>
          Effect.gen(function* () {
            const fixtures = yield* Fixtures;
            const devnet = yield* Devnet;
            const ens = ensforge(devnet);
            const resolverOf = (name: string) => call(() => ens.resolver.get({ name }));
            const nameOf = (id: string) => fixtures.byId(id).name;

            assert.deepInclude(yield* resolverOf(nameOf("records.v1")), {
              kind: "public-resolver",
              authorization: "owner",
              version: 0n,
            });
            assert.deepInclude(yield* resolverOf(nameOf("resolver.2020")), {
              kind: "public-resolver",
              authorization: "owner",
            });
            // Bound to the registry ENS replaced in 2020: readable, not writable.
            assert.deepInclude(yield* resolverOf(nameOf("resolver.frozen-2019")), {
              kind: "public-resolver",
              authorization: "none",
            });
            // A gas burner and a returndata bomb are checked within EIP-165's gas bound.
            for (const id of [
              "resolver.eoa",
              "resolver.no-erc165",
              "resolver.gas-burner",
              "resolver.returndata-bomb",
            ]) {
              assert.deepInclude(yield* resolverOf(nameOf(id)), {
                kind: "custom",
                inherited: false,
              });
            }
            assert.deepInclude(yield* resolverOf(nameOf("resolver.unsupported-profile")), {
              kind: "extended",
            });

            const wildcard = fixtures.byId("resolver.wildcard");
            assert.deepInclude(yield* resolverOf(String(wildcard.facts["wildcardChild"])), {
              address: wildcard.facts["resolver"] as Address,
              inherited: true,
              kind: "extended",
            });

            // The `eth` resolver is not extended, so it does not serve names below it.
            assert.isNull(yield* resolverOf(nameOf("resolver.none")));
            yield* expectRejection(
              () => ens.resolver.get({ name: nameOf("resolver.none"), strict: true }),
              { _tag: "NotFoundError", code: "RESOLVER_NOT_FOUND" },
            );
          }),
        {
          meta: {
            cases: ["M:B2", "M:B9", "M:B13", "M:B14", "R02", "R05", "R11", "R12", "R13", "R14"],
          },
        },
      );

      it.effect(
        "reads misbehaving resolvers as missing records, and fails strict reads with a typed error",
        () =>
          Effect.gen(function* () {
            const fixtures = yield* Fixtures;
            const ens = ensforge(yield* Devnet);

            for (const [id, code] of Object.entries(misbehaving)) {
              const name = fixtures.byId(id).name;
              const records = yield* call(() =>
                ens.record.get({ name, texts: ["url"], addresses: ["eth", "btc"] }),
              );
              assert.deepStrictEqual(
                [records.texts, records.addresses],
                [{ url: null }, { eth: null, btc: null }],
                id,
              );
              const expected = {
                _tag: code === "RESOLVER_NOT_FOUND" ? "NotFoundError" : "UnsupportedError",
                code,
              };
              yield* expectRejection(
                () => ens.record.get({ name, addresses: ["eth"], strict: true }),
                expected,
              );
              yield* expectRejection(() => ens.record.getAddress({ name, strict: true }), expected);
              yield* expectRejection(
                () => ens.record.getText({ name, key: "url", strict: true }),
                expected,
              );
              yield* expectRejection(
                () => ens.record.getContentHash({ name, strict: true }),
                expected,
              );
              yield* expectRejection(() => ens.record.getAvatar({ name, strict: true }), expected);
            }
          }),
        {
          meta: {
            cases: [
              "M:B13",
              "M:B14",
              "M:B15",
              "M:B17",
              "R05",
              "R06",
              "R07",
              "R08",
              "R09",
              "R13",
              "R14",
              "R15",
            ],
          },
        },
      );

      // Resolvers older than ENSIP-9 and ERC-165 still answer the legacy `addr(bytes32)`; the
      // Universal Resolver calls it as an old resolver, and so does every client.
      it.effect(
        "reads ETH from a resolver without ERC-165 through the legacy addr",
        () =>
          Effect.gen(function* () {
            const fixtures = yield* Fixtures;
            const devnet = yield* Devnet;
            const ens = ensforge(devnet);
            const name = fixtures.byId("resolver.no-erc165").name;

            assert.strictEqual(
              yield* call(() => ens.record.getAddress({ name, strict: true })),
              devnet.accounts.alice,
            );
            const records = yield* call(() =>
              ens.record.get({ name, texts: ["url"], addresses: ["eth", "btc"] }),
            );
            assert.deepStrictEqual(
              [records.texts, records.addresses],
              [{ url: null }, { eth: devnet.accounts.alice, btc: null }],
            );
          }),
        { meta: { cases: ["R11", "R12"] } },
      );

      it.effect(
        "resolves through the exact resolver first, then a parent's wildcard",
        () =>
          Effect.gen(function* () {
            const fixtures = yield* Fixtures;
            const devnet = yield* Devnet;
            const { accounts } = devnet;
            const ens = ensforge(devnet);
            const wildcard = fixtures.byId("resolver.wildcard");
            const resolve = (name: string) =>
              call(() => ens.resolver.resolve({ name, data: addrCall(name) }));

            // The parent's resolver is called with the child's own node.
            const child = String(wildcard.facts["wildcardChild"]);
            assert.deepStrictEqual(yield* resolve(child), {
              data: answer(accounts.bob),
              resolver: servedBy(devnet, profile, wildcard.facts["resolver"]),
            });
            assert.strictEqual(
              (yield* resolve(String(wildcard.facts["exact"]))).data,
              answer(accounts.carol),
            );
            // A resolver without ERC-165 is still called (an old resolver).
            assert.strictEqual(
              (yield* resolve(fixtures.byId("resolver.no-erc165").name)).data,
              answer(accounts.alice),
            );
          }),
        { meta: { cases: ["M:B9", "R01", "R03", "R04", "R11", "H25"] } },
      );

      it.effect("links records only on PermissionedResolvers", () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const ens = ensforge(yield* Devnet);
          yield* expectRejection(
            () => ens.resolver.getLink({ name: fixtures.byId("records.v1").name }),
            { _tag: "UnsupportedError", code: "RESOLVER_PROFILE_UNSUPPORTED" },
          );
        }),
      );
    });
  }

  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect(
      "describes ENSv2 resolvers and their record links",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const ens = ensforge(yield* Devnet);
          const nameOf = (id: string) => fixtures.byId(id).name;

          assert.deepInclude(yield* call(() => ens.resolver.get({ name: nameOf("records.v2") })), {
            kind: "permissioned-resolver",
            authorization: "roles",
          });
          assert.deepInclude(
            yield* call(() =>
              ens.resolver.get({ name: nameOf("resolver.public-resolver-v2.unknown") }),
            ),
            { kind: "public-resolver-v2" },
          );

          const [target, linked, unlinked] = yield* Effect.all([
            call(() => ens.resolver.getLink({ name: nameOf("records.v2") })),
            call(() => ens.resolver.getLink({ name: nameOf("records.v2.linked") })),
            call(() => ens.resolver.getLink({ name: nameOf("records.v2.default") })),
          ]);
          assert.strictEqual(linked?.recordId, target?.recordId);
          assert.isNull(unlinked);
        }),
      { meta: { cases: ["M:B4", "M:B5", "M:B7", "R22", "R26"] } },
    );

    it.effect(
      "tells which resolvers resolution still reaches",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const ens = ensforge(yield* Devnet);
          const servingOf = (id: string) =>
            call(() => ens.resolver.get({ name: fixtures.byId(id).name })).pipe(
              Effect.map((resolver) => resolver?.serving),
            );

          // Not premigrated: its ENSv1 resolver is kept but no longer resolves it.
          assert.isFalse(yield* servingOf("v1.unwrapped"));
          assert.isTrue(yield* servingOf("records.v1"));
          assert.isTrue(yield* servingOf("records.v2"));
        }),
      { meta: { cases: ["O19"] } },
    );

    it.effect(
      "fails with a typed error when a registry reverts during resolution",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const ens = ensforge(yield* Devnet);
          const name = fixtures.byId("resolver.registry-reverts").name;
          yield* expectRejection(() => ens.record.get({ name, addresses: ["eth"] }), {
            _tag: "GatewayError",
            code: "OFFCHAIN_LOOKUP_INVALID",
          });
        }),
      { meta: { cases: ["M:B16", "R19", "R20"] } },
    );
  });
});
