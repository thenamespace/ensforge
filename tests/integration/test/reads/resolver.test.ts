import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk/effect";
import { Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import { encodeAbiParameters, encodeFunctionData, namehash, type Address } from "viem";

import { Clients } from "../support/clients.ts";
import { onProfile } from "../support/lane.ts";

describe("resolver reads", () => {
  for (const profile of ["v1-live", "mainnet-shaped"] as const) {
    onProfile(profile)(profile, (it) => {
      it.effect(
        "describes each generation and kind of resolver",
        () =>
          Effect.gen(function* () {
            const fixtures = yield* Fixtures;
            const { reader } = yield* Clients;
            const resolverOf = (name: string) => Actions.resolver.get(reader, { name });
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
            yield* expectFailure(
              Actions.resolver.get(reader, { name: nameOf("resolver.none"), strict: true }),
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
            const { reader } = yield* Clients;

            // The error a strict read gives; a non-strict read gives nulls.
            for (const [id, code] of Object.entries({
              "resolver.none": "RESOLVER_NOT_FOUND",
              "resolver.eoa": "RESOLVER_NOT_FOUND",
              "resolver.not-a-resolver": "RESOLVER_PROFILE_UNSUPPORTED",
              "resolver.reverting": "RESOLVER_PROFILE_UNSUPPORTED",
              "resolver.gas-burner": "RESOLVER_PROFILE_UNSUPPORTED",
              "resolver.returndata-bomb": "RESOLVER_PROFILE_UNSUPPORTED",
              "resolver.empty-answer": "RESOLVER_PROFILE_UNSUPPORTED",
              "resolver.malformed-answer": "RESOLVER_PROFILE_UNSUPPORTED",
              "resolver.unsupported-profile": "RESOLVER_PROFILE_UNSUPPORTED",
            })) {
              const name = fixtures.byId(id).name;
              const records = yield* Actions.record.get(reader, {
                name,
                texts: ["url"],
                addresses: ["eth", "btc"],
              });
              assert.deepStrictEqual(
                [records.texts, records.addresses],
                [{ url: null }, { eth: null, btc: null }],
                id,
              );
              const expected = {
                _tag: code === "RESOLVER_NOT_FOUND" ? "NotFoundError" : "UnsupportedError",
                code,
              };
              yield* expectFailure(
                Actions.record.get(reader, { name, addresses: ["eth"], strict: true }),
                expected,
              );
              yield* expectFailure(
                Actions.record.getAddress(reader, { name, strict: true }),
                expected,
              );
              yield* expectFailure(
                Actions.record.getText(reader, { name, key: "url", strict: true }),
                expected,
              );
              yield* expectFailure(
                Actions.record.getContentHash(reader, { name, strict: true }),
                expected,
              );
              yield* expectFailure(
                Actions.record.getAvatar(reader, { name, strict: true }),
                expected,
              );
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
            const { reader } = yield* Clients;
            const name = fixtures.byId("resolver.no-erc165").name;

            assert.strictEqual(
              yield* Actions.record.getAddress(reader, { name, strict: true }),
              devnet.accounts.alice,
            );
            const records = yield* Actions.record.get(reader, {
              name,
              texts: ["url"],
              addresses: ["eth", "btc"],
            });
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
            const { reader } = yield* Clients;
            const wildcard = fixtures.byId("resolver.wildcard");
            // The fixture resolvers answer `addr(bytes32)`; ensforge's record reads use other
            // profiles.
            const resolve = (name: string) =>
              Actions.resolver.resolve(reader, {
                name,
                data: encodeFunctionData({
                  abi: Abis.shared.addrResolver,
                  functionName: "addr",
                  args: [namehash(name)],
                }),
              });

            // The parent's resolver is called with the child's own node. After the launch the
            // ENSv1 bridge serves premigrated ENSv1 names; before it, their own resolvers do.
            assert.deepStrictEqual(yield* resolve(String(wildcard.facts["wildcardChild"])), {
              data: encodeAbiParameters([{ type: "address" }], [accounts.bob]),
              resolver:
                profile === "mainnet-shaped"
                  ? devnet.contract("v2.ensV1Resolver")
                  : (wildcard.facts["resolver"] as Address),
            });
            assert.strictEqual(
              (yield* resolve(String(wildcard.facts["exact"]))).data,
              encodeAbiParameters([{ type: "address" }], [accounts.carol]),
            );
            // A resolver without ERC-165 is still called (an old resolver).
            assert.strictEqual(
              (yield* resolve(fixtures.byId("resolver.no-erc165").name)).data,
              encodeAbiParameters([{ type: "address" }], [accounts.alice]),
            );
          }),
        { meta: { cases: ["M:B9", "R01", "R03", "R04", "R11", "H25"] } },
      );

      it.effect("links records only on PermissionedResolvers", () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { reader } = yield* Clients;

          yield* expectFailure(
            Actions.resolver.getLink(reader, { name: fixtures.byId("records.v1").name }),
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
          const { reader } = yield* Clients;
          const nameOf = (id: string) => fixtures.byId(id).name;

          assert.deepInclude(yield* Actions.resolver.get(reader, { name: nameOf("records.v2") }), {
            kind: "permissioned-resolver",
            authorization: "roles",
          });
          assert.deepInclude(
            yield* Actions.resolver.get(reader, {
              name: nameOf("resolver.public-resolver-v2.unknown"),
            }),
            { kind: "public-resolver-v2" },
          );

          const [target, linked, unlinked] = yield* Effect.all([
            Actions.resolver.getLink(reader, { name: nameOf("records.v2") }),
            Actions.resolver.getLink(reader, { name: nameOf("records.v2.linked") }),
            Actions.resolver.getLink(reader, { name: nameOf("records.v2.default") }),
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
          const { reader } = yield* Clients;
          const servingOf = (id: string) =>
            Actions.resolver
              .get(reader, { name: fixtures.byId(id).name })
              .pipe(Effect.map((resolver) => resolver?.serving));

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
          const { reader } = yield* Clients;
          const name = fixtures.byId("resolver.registry-reverts").name;
          yield* expectFailure(Actions.record.get(reader, { name, addresses: ["eth"] }), {
            _tag: "GatewayError",
            code: "OFFCHAIN_LOOKUP_INVALID",
          });
        }),
      { meta: { cases: ["M:B16", "R19", "R20"] } },
    );
  });
});
