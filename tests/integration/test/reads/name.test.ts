import { assert, describe } from "@effect/vitest";
import { Effect, Array as Arr } from "effect";

import { Duration } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Devnet, profileNames } from "@ensforge/test-devnet";
import { allFixtures, factAddress, Fixtures, seededOn } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import { labelhash, namehash } from "viem";

import { Clients } from "../support/clients.ts";
import {
  atStage,
  belowPremigrated,
  premigrated,
  stageOf,
  unclaimed,
  v1Dns,
  v1Eth,
  v1Reserved,
  v1Sub,
  v2Eth,
  v2Sub,
  type NameExpectation,
} from "../support/expect.ts";
import { onProfile } from "../support/lane.ts";

/** What `name.get` must report for every fixture's name. */
const expected: Readonly<Record<string, NameExpectation>> = {
  "v1.unwrapped": v1Eth(["M:A2", "O19"], "alice"),
  "v1.unwrapped.manager": v1Eth(["M:A3"], "alice"),
  "v1.unwrapped.transferred": v1Eth(["O03"], "bob"),
  "v1.unwrapped.registrar-only": v1Eth(["O04"], "alice"),
  "v1.unwrapped.legacy-controller": v1Eth([], "alice"),
  "v1.unwrapped.grace": v1Eth(["M:A5"], null, "grace"),
  "v1.unwrapped.premium": v1Eth([], null, "expired"),
  "v1.unwrapped.expired": v1Eth(["M:A6", "O05"], null, "expired"),
  "v1.subname": v1Sub(["M:A4", "H24"], "bob"),
  "v1.subname.deleted": unclaimed(["O12"]),
  "v1.old-registry": v1Sub(["O01"], "alice"),
  "v1.old-registry.migrated": v1Sub(["O02"], "bob"),
  "v1.wrapped": v1Eth(["M:A7"], "alice", "registered", "v1-wrapped"),
  "v1.wrapped.locked": v1Eth(["M:A8"], "alice", "registered", "v1-wrapped"),
  "v1.wrapped.locked.cannot-transfer": v1Eth([], "alice", "registered", "v1-wrapped"),
  "v1.wrapped.locked.cannot-set-resolver": v1Eth([], "alice", "registered", "v1-wrapped"),
  "v1.wrapped.locked.cannot-set-ttl": v1Eth([], "alice", "registered", "v1-wrapped"),
  "v1.wrapped.locked.cannot-create-subdomain": v1Eth([], "alice", "registered", "v1-wrapped"),
  "v1.wrapped.locked.cannot-burn-fuses": v1Eth([], "alice", "registered", "v1-wrapped"),
  "v1.wrapped.locked.all": v1Eth([], "alice", "registered", "v1-wrapped"),
  "v1.wrapped.approved": v1Eth([], "alice", "registered", "v1-wrapped"),
  "v1.wrapped.locked.cannot-approve": v1Eth([], "alice", "registered", "v1-wrapped"),
  "v1.wrapped.sub": v1Sub(["M:A9"], "bob", "registered", "v1-wrapped"),
  "v1.wrapped.sub.emancipated": v1Sub(["M:A10"], "bob", "registered", "v1-wrapped"),
  "v1.wrapped.sub.locked": v1Sub(["M:A11"], "bob", "registered", "v1-wrapped"),
  "v1.wrapped.sub.can-extend": v1Sub([], "bob", "registered", "v1-wrapped"),
  // An expired emancipated child has no owner; a parent-controlled one keeps it (W09).
  "v1.wrapped.sub.expired-emancipated": v1Sub(["W05"], null, "expired", "v1-wrapped"),
  "v1.wrapped.sub.expired": v1Sub(["W09", "M:A12"], "bob", "expired", "v1-wrapped"),
  // In the registrar's grace period the wrapper still holds the token.
  "v1.wrapped.grace": v1Eth(["M:A13", "W07"], "alice", "grace", "v1-wrapped"),
  "v1.wrapped.expired": v1Eth(["W08"], null, "expired", "v1-wrapped"),
  // Registrar renewed past the wrapper: registered, but the wrapper reports no owner until resynced.
  "v1.wrapped.desynced": v1Eth(["O07", "O08"], null, "registered", "v1-wrapped"),
  "v1.wrapped.sub.unwrapped-parent": v1Sub(["O10"], "bob", "registered", "v1-wrapped"),
  "v1.unwrapped.sub.wrapped-parent": v1Sub(["O11"], "bob"),
  "v1.wrapped.implicit-unwrap": v1Eth(["O06"], "bob"),
  "v2.registered": v2Eth(["M:A14"], "alice"),
  "v2.grace": v2Eth(["M:A15", "O15"], null, "grace"),
  "v2.expired": v2Eth(["M:A16", "O15"], null, "expired"),
  "v2.re-registered": v2Eth(["M:A17", "O17"], "bob"),
  "v2.subnames": v2Sub(["M:A18"], "bob"),
  "v2.unregistered": unclaimed(["M:A19", "O16"]),
  "v2.unregistered.renewed": {
    cases: ["O14"],
    kind: "v2-reserved",
    status: "reserved",
    owner: null,
    reachable: true,
    available: false,
    renewable: false,
  },
  "v2.reserved.lapsed": unclaimed(["O13"]),
  "v2.roles": v2Eth(["M:A24"], "alice"),
  "v2.regenerated": v2Eth(["M:A25"], "alice"),
  "v2.operator": v2Eth([], "carol"),
  // A premigration reservation leaves ENSv1 in charge until the name migrates.
  "v2.reserved": v1Reserved(["M:A23", "O18", "O30"], "alice"),
  "v2.linked": v2Sub(["O20"], "bob"),
  "v2.replaced-subregistry": unclaimed(["O23"]),
  "resolver.none": v1Eth([], "alice"),
  "resolver.eoa": v1Eth([], "alice"),
  "resolver.not-a-resolver": v1Eth([], "alice"),
  "resolver.reverting": v1Eth([], "alice"),
  "resolver.gas-burner": v1Eth([], "alice"),
  "resolver.returndata-bomb": v1Eth([], "alice"),
  "resolver.public-resolver-v2.unknown": v1Eth([], "alice"),
  "resolver.no-erc165": v1Eth([], "alice"),
  "resolver.empty-answer": v1Eth([], "alice"),
  "resolver.malformed-answer": v1Eth([], "alice"),
  "resolver.unsupported-profile": v1Eth([], "alice"),
  "resolver.offchain": v1Eth([], "alice"),
  "resolver.spoofed-offchain-lookup": v1Eth([], "alice"),
  "resolver.wildcard": v1Eth([], "alice"),
  "resolver.frozen-2019": v1Eth([], "alice"),
  "resolver.2020": v1Eth([], "alice"),
  "records.v1": v1Eth([], "alice"),
  "records.btc-taproot": v1Eth([], "alice"),
  "records.contenthash.ipfs": v1Eth([], "alice"),
  "records.contenthash.ipns": v1Eth([], "alice"),
  "records.contenthash.swarm": v1Eth([], "alice"),
  "records.contenthash.onion3": v1Eth([], "alice"),
  "records.contenthash.arweave": v1Eth([], "alice"),
  "records.contenthash.unknown": v1Eth([], "alice"),
  "records.huge-text": v1Eth([], "alice"),
  "records.avatar.https": v1Eth([], "alice"),
  "records.avatar.erc721-owned": v1Eth([], "alice"),
  "records.avatar.erc1155": v1Eth([], "alice"),
  "records.avatar.data-svg": v1Eth([], "alice"),
  "records.avatar.unknown-scheme": v1Eth([], "alice"),
  "records.avatar.erc721-not-owned": v1Eth([], "bob"),
  "records.v2": v2Eth([], "bob"),
  "records.v2.default": v2Eth([], "carol"),
  "records.v2.linked": v2Eth([], "bob"),
  "records.v2.partial-roles": v2Eth([], "bob"),
  "primary.addr-reverse": v1Eth([], "alice"),
  "primary.default-reverse": v1Eth([], "bob"),
  "primary.both": v1Eth([], "carol"),
  "primary.mismatch": v1Eth([], "alice"),
  "primary.not-normalized": v1Eth([], "approved"),
  "primary.contract": v1Eth([], "user"),
  "primary.reverse-2017": v1Eth([], "user2"),
  "primary.reverse-2020": v1Eth([], "user"),
  "primary.at-registration": v1Eth([], "nameOwner"),
  "hierarchy.label-63": v1Sub(["H02"], "bob"),
  "hierarchy.label-64": v1Sub(["H02"], "bob"),
  "hierarchy.label-255": v1Sub(["H01"], "bob"),
  "hierarchy.label-with-dot": v1Sub(["H04", "M:C6"], "bob"),
  "hierarchy.label-literal-hex": v1Sub(["H05"], "bob"),
  "hierarchy.label-invalid-utf8": v1Sub(["H06"], "bob"),
  "hierarchy.label-unknown": v1Sub(["M:C6"], "bob"),
  "hierarchy.label-unnormalized": v1Sub(["L32", "M:C8"], "bob"),
  "hierarchy.depth-33": v1Sub(["H13"], "alice"),
  "dns.imported": v1Dns(["M:C4"], "alice"),
  "dns.imported.wrapped": v1Dns(["D15"], "bob", "v1-wrapped"),
  "dns.synced-tld": v2Sub(["D17", "M:C2"], "owner"),
  "registration.price.3cp": v2Eth([], "alice"),
  "registration.price.4cp": v2Eth([], "alice"),
  "registration.price.5cp": v2Eth([], "alice"),
  "registration.price.emoji-zwj": v2Eth([], "alice"),
  "registration.v2-premium": v2Eth([], null, "expired"),
  "registration.v2-renewed-in-grace": v2Eth(["T09"], "alice"),
  "registration.v1-renewed-by-renewer": v1Reserved(["G12"], "alice"),
  "migration.unwrapped": v2Eth(["M:A20"], "alice", "registered", "v2-migrated"),
  "migration.wrapped-unlocked": v2Eth(["M:A21"], "alice", "registered", "v2-migrated"),
  "migration.locked": v2Eth(["M:A22"], "alice", "registered", "v2-migrated"),
  "account.v1-operator": v1Eth([], "alice"),
  "account.resolver-delegate": v1Eth([], "alice"),
  "account.hca": v1Eth([], "alice"),
  "account.eip7702": v1Eth([], "alice"),
};

describe("name.get", () => {
  for (const profile of profileNames) {
    onProfile(profile)(profile, (it) => {
      // A name whose parent registry reverts is a typed error, not a state; `v2-only` knows no
      // ENSv1, so only names that live in ENSv2 are read there.
      const definitions = Arr.filter(
        allFixtures,
        (fixture) =>
          seededOn(fixture, profile) &&
          fixture.id !== "resolver.registry-reverts" &&
          (profile !== "v2-only" || fixture.tags["kind"] === "v2-native"),
      );

      for (const definition of definitions) {
        const expectation = expected[definition.id];
        it.effect(
          definition.id,
          () =>
            Effect.gen(function* () {
              if (expectation === undefined) {
                assert.fail(`no expectation for ${definition.id}`);
              }
              const fixture = (yield* Fixtures).byId(definition.id);
              const { accounts } = yield* Devnet;
              const { reader } = yield* Clients;
              const wanted =
                fixture.facts["premigrated"] === true
                  ? premigrated(expectation)
                  : fixture.facts["belowPremigrated"] === true
                    ? belowPremigrated(expectation)
                    : expectation;
              const stage = stageOf(profile);

              const state = yield* Actions.name.get(reader, { name: fixture.name });

              assert.deepStrictEqual(
                {
                  kind: state.kind,
                  status: state.status,
                  owner: state.owner,
                  wrapped: state.wrapped,
                  migrated: state.migrated,
                  reachable: state.reachable,
                  available: state.available,
                  renewable: state.renewable,
                },
                {
                  kind: wanted.kind,
                  status: wanted.status,
                  owner: wanted.owner === null ? null : accounts[wanted.owner],
                  wrapped: wanted.wrapped ?? false,
                  migrated: wanted.migrated ?? false,
                  reachable: atStage(wanted.reachable, stage),
                  available: atStage(wanted.available, stage),
                  renewable: atStage(wanted.renewable, stage),
                },
              );
            }),
          { meta: { cases: [...(expectation?.cases ?? [])] } },
        );
      }

      it.effect(
        "a name never registered is available",
        () =>
          Effect.gen(function* () {
            const { reader } = yield* Clients;

            const neverRegistered = yield* Actions.name.get(reader, {
              name: "never-registered.eth",
            });
            assert.deepInclude(neverRegistered, {
              kind: "available",
              status: "available",
              owner: null,
              expiry: null,
              available: true,
              renewable: false,
            });
          }),
        { meta: { cases: ["M:A1"] } },
      );
    });
  }

  onProfile("mainnet-shaped")("fields", (it) => {
    it.effect(
      "registrant, manager and expiry of ENSv1 names",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const { reader } = yield* Clients;
          const plain = fixtures.byId("v1.unwrapped");
          const expiry = BigInt(String(plain.facts["expiry"]));

          const managed = yield* Actions.name.get(reader, {
            name: fixtures.byId("v1.unwrapped.manager").name,
          });
          assert.include(managed, { registrant: accounts.alice, manager: accounts.bob });
          const transferred = yield* Actions.name.get(reader, {
            name: fixtures.byId("v1.unwrapped.transferred").name,
          });
          assert.include(transferred, { registrant: accounts.bob, manager: accounts.alice });
          const orphan = yield* Actions.name.get(reader, {
            name: fixtures.byId("v1.unwrapped.registrar-only").name,
          });
          assert.include(orphan, { registrant: accounts.alice, manager: null, resolver: null });

          const state = yield* Actions.name.get(reader, { name: plain.name });
          assert.strictEqual(state.expiry, expiry);
          assert.strictEqual(state.gracePeriodEnd, expiry + Duration.days(90));
          assert.strictEqual(state.tokenId, BigInt(labelhash("v1-plain")));
        }),
      { meta: { cases: ["M:A3", "O03", "O04"] } },
    );

    it.effect(
      "token ID, resource, registry and expiry of ENSv2 names",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { reader } = yield* Clients;
          const plain = fixtures.byId("v2.registered");
          const regenerated = fixtures.byId("v2.regenerated");
          const deep = fixtures.byId("v2.subnames");
          const expiry = BigInt(String(plain.facts["expiry"]));

          const state = yield* Actions.name.get(reader, { name: plain.name });
          assert.strictEqual(state.expiry, expiry);
          assert.strictEqual(state.gracePeriodEnd, expiry + Duration.days(28));

          const current = yield* Actions.name.get(reader, { name: regenerated.name });
          assert.strictEqual(current.tokenId, BigInt(String(regenerated.facts["tokenId"])));
          assert.strictEqual(current.resource, BigInt(String(regenerated.facts["resource"])));

          const sub = yield* Actions.name.get(reader, { name: deep.name });
          assert.strictEqual(sub.registry, deep.facts["registry"]);
        }),
      { meta: { cases: ["M:A25", "W24", "M:A18"] } },
    );

    it.effect(
      "wrapped names report the wrapper's token and expiry",
      () =>
        Effect.gen(function* () {
          const wrapped = (yield* Fixtures).byId("v1.wrapped");
          const { reader } = yield* Clients;

          const state = yield* Actions.name.get(reader, { name: wrapped.name });
          assert.strictEqual(state.tokenId, BigInt(namehash(wrapped.name)));
          assert.strictEqual(state.expiry, BigInt(String(wrapped.facts["expiry"])));
        }),
      { meta: { cases: ["M:A7"] } },
    );

    // A name only a parent's wildcard (or off-chain) resolver answers is in no registry: it is
    // available, and `inheritedResolver` says what resolves it.
    it.effect(
      "a wildcard subname is available and has no expiry, yet resolves",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { reader } = yield* Clients;
          const wildcard = fixtures.byId("resolver.wildcard");
          const name = String(wildcard.facts["wildcardChild"]);
          const stateOf = (target: string) => Actions.name.get(reader, { name: target });

          const state = yield* stateOf(name);
          assert.deepInclude(state, {
            available: true,
            owner: null,
            expiry: null,
            gracePeriodEnd: null,
            resolver: null,
            inheritedResolver: factAddress(wildcard.facts, "resolver"),
          });
          const address = yield* Actions.record.getAddress(reader, { name });
          assert.strictEqual(address, wildcard.facts["wildcardAddress"]);

          // A name with no resolver anywhere, and a registered name with its own.
          const none = yield* stateOf(fixtures.byId("resolver.none").name);
          assert.deepInclude(none, {
            status: "registered",
            resolver: null,
            inheritedResolver: null,
          });
          const own = yield* stateOf(fixtures.byId("records.v1").name);
          assert.isNotNull(own.resolver);
          assert.isNull(own.inheritedResolver);
        }),
      { meta: { cases: ["X15", "M:B13"] } },
    );

    it.effect(
      "a DNS TLD synced into ENSv2 never expires",
      () =>
        Effect.gen(function* () {
          const synced = (yield* Fixtures).byId("dns.synced-tld");
          const { reader } = yield* Clients;

          const syncedName = yield* Actions.name.get(reader, { name: synced.name });
          assert.deepInclude(syncedName, {
            status: "registered",
            expiry: null,
            gracePeriodEnd: null,
          });
        }),
      { meta: { cases: ["D17"] } },
    );

    // A non-`.eth` name wrapped without its parent setting an expiry has wrapper expiry 0.
    it.effect(
      "a wrapped name whose expiry was never set has none, rather than 1970",
      () =>
        Effect.gen(function* () {
          const wrapped = (yield* Fixtures).byId("dns.imported.wrapped");
          const { reader } = yield* Clients;

          const importedName = yield* Actions.name.get(reader, { name: wrapped.name });
          assert.deepInclude(importedName, {
            kind: "v1-wrapped",
            status: "registered",
            expiry: null,
            gracePeriodEnd: null,
          });
        }),
      { meta: { cases: ["T13"] } },
    );

    it.effect(
      "reads top-level names from the root registry",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const { reader } = yield* Clients;
          const root = devnet.contract("v2.rootRegistry");

          const states = yield* Effect.forEach(
            ["eth", "reverse", "arpa", "org"],
            (name) => Actions.name.get(reader, { name }),
            { concurrency: 1 },
          );
          assert.deepStrictEqual(
            Arr.map(states, (state) => [state.name, state.status, state.registry]),
            [
              ["eth", "registered", root],
              ["reverse", "registered", root],
              // The devnet's root registry holds no `arpa`.
              ["arpa", "available", root],
              // A DNS TLD the TemporaryDNSRegistrar synced.
              ["org", "registered", root],
            ],
          );
          assert.strictEqual((yield* Actions.registry.get(reader, { name: "eth" }))?.kind, "eth");
        }),
      { meta: { cases: ["M:C2"] } },
    );

    it.effect(
      "a name whose parent registry reverts fails with a typed error",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { reader } = yield* Clients;

          yield* expectFailure(
            Actions.name.get(reader, { name: fixtures.byId("resolver.registry-reverts").name }),
            { _tag: "ContractRevertError", code: "CONTRACT_REVERTED" },
          );
        }),
      { meta: { cases: ["M:B16"] } },
    );

    it.effect(
      "normalizes input and rejects names that cannot be normalized",
      () =>
        Effect.gen(function* () {
          const { reader } = yield* Clients;

          const upper = yield* Actions.name.get(reader, { name: "V1-PLAIN.ETH" });
          assert.strictEqual(upper.name, "v1-plain.eth");
          for (const name of ["a..eth", "", ".", "nick\u200c.eth"]) {
            yield* expectFailure(Actions.name.get(reader, { name }), {
              _tag: "InvalidInputError",
              code: "INVALID_NAME",
            });
          }
        }),
      { meta: { cases: ["L30", "L31", "M:C1", "M:C7"] } },
    );
  });
});

describe("name.getLabel", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect(
      "recovers ENSv2 labels from the LabelStore and leaves unknown ones null",
      () =>
        Effect.gen(function* () {
          const { reader } = yield* Clients;

          const label = yield* Actions.name.getLabel(reader, { labelhash: labelhash("v2-plain") });
          assert.strictEqual(label, "v2-plain");
          const unrevealedLabel = yield* Actions.name.getLabel(reader, {
            labelhash: labelhash("never revealed by ensforge"),
          });
          assert.isNull(unrevealedLabel);
        }),
      { meta: { cases: ["H10", "M:C6"] } },
    );
  });
});
