import { assert, describe, it } from "@effect/vitest";
import { assertDefined } from "@effect/vitest/utils";
import { Effect } from "effect";

import { Actions, Duration } from "@ensforge/sdk";
import { Actions as EffectActions } from "@ensforge/sdk/effect";
import * as Ensforge from "@ensforge/sdk/internal/client/Ensforge";
import { expectFailure, expectRejection, noRpc, scriptedTransport } from "@ensforge/test-harness";
import { createClient } from "viem";
import { mainnet } from "viem/chains";

// Every action that takes an ENS name must reject an invalid one before touching the chain.
// Cases come from the generated action index, so a new action is covered (or must be listed
// below) automatically.

const address = "0x225f137127d9067788314bc7fcc1f36746a3c3B5";
const invalidName = "a..eth";

/** Actions whose options have no ENS name to validate. */
const withoutName = new Set([
  "approval.getOperator",
  "approval.setOperator",
  "event.decode",
  "indexer.getNamesByExpiry",
  "indexer.getNamesForAddress",
  "indexer.getNamespace",
  "indexer.getPrimaryName",
  "indexer.getRegistry",
  "indexer.getRegistryLabels",
  "indexer.getResolver",
  "indexer.getResolverLinks",
  "indexer.getResolverRoles",
  "indexer.getResolvers",
  "indexer.getStatus",
  "indexer.lookup",
  "indexer.search",
  "name.getLabel",
  "plan.get",
  "plan.list",
  "plan.reconcile",
  "plan.resume",
  "plan.send",
  "primaryName.get",
  "registration.getCommitmentStatus",
  "registration.getParameters",
  "registry.deploy",
]);

/** Valid values for an action's other required options, so only the name can be wrong. */
const otherOptions: Readonly<Record<string, object>> = {
  "approval.getDelegate": { delegate: address },
  "approval.setDelegate": { delegate: address, approved: true },
  "approval.setToken": { to: address },
  "dns.setRecords": { zonehash: null },
  "event.get": { fromBlock: 0n },
  "name.setManager": { manager: address },
  "name.transfer": { to: address },
  "permission.check": { operation: "setResolver" },
  "permission.setRecordAccess": { grantee: address },
  "primaryName.signClaim": { chainIds: [10] },
  "registration.commit": { duration: Duration.years(1) },
  "registration.getPrice": { duration: Duration.years(1) },
  "registration.register": { duration: Duration.years(1) },
  "registration.renew": { duration: Duration.years(1) },
  "resolver.resolve": { data: "0x3b3b57de" },
  "role.get": { account: address, target: "registry" },
  "role.grant": { grantee: address, roles: 1n, target: "registry" },
  "role.revoke": { holder: address, roles: 1n, target: "registry" },
  "subname.update": { owner: address },
  "wrapper.setChildFuses": { expiry: 1n },
};

type Fn = ((client: unknown, options: unknown) => unknown) & {
  readonly prepare?: (client: unknown, options: unknown) => Promise<unknown>;
};
type EffectFn = ((client: unknown, options: unknown) => Effect.Effect<unknown, unknown>) & {
  readonly prepare?: (client: unknown, options: unknown) => Effect.Effect<unknown, unknown>;
};

const cases = Object.entries(Actions).flatMap(([domain, group]) =>
  typeof group === "function"
    ? []
    : Object.entries(group as Record<string, Fn>).map(([action, fn]) => {
        const path = `${domain}.${action}`;
        const base = path.replace(/Sync$/, "");
        const effectFn = (EffectActions as unknown as Record<string, Record<string, EffectFn>>)[
          domain
        ]?.[action];
        return { path, base, fn, effectFn };
      }),
);

const named = cases.filter(({ base }) => !withoutName.has(base));
const invalid = { _tag: "InvalidInputError", code: "INVALID_NAME" };

describe("invalid names fail before any RPC", () => {
  it("lists only existing actions as exempt", () => {
    const bases = new Set(cases.map(({ base }) => base));
    assert.deepStrictEqual(
      [...withoutName, ...Object.keys(otherOptions)].filter((path) => !bases.has(path)),
      [],
    );
  });

  it.effect.each(named.map((entry) => [entry.path, entry] as const))(
    "%s",
    ([path, { base, fn, effectFn }]) =>
      Effect.gen(function* () {
        const { transport, calls } = scriptedTransport(noRpc);
        // An account, so writes that need a signer reach their name check.
        const ens = Ensforge.create({
          publicClient: createClient({ chain: mainnet, transport, account: address }),
        });
        const options = { name: invalidName, names: invalidName, ...otherOptions[base] };
        assertDefined(effectFn);

        const rejected = yield* expectRejection(
          () => fn(ens, options) as Promise<unknown>,
          invalid,
        );
        assert.strictEqual(
          (rejected as { context?: { operation?: string } }).context?.operation,
          path,
        );
        yield* expectFailure(effectFn(ens, options), invalid);

        const { prepare } = fn;
        if (prepare !== undefined) {
          yield* expectRejection(() => prepare(ens, options), invalid);
          assertDefined(effectFn.prepare);
          yield* expectFailure(effectFn.prepare(ens, options), invalid);
        }

        assert.deepStrictEqual(calls, []);
      }),
  );

  // Only `.eth` second-level names are sold, so `eth`, other TLDs and the root are not names here.
  it.effect(
    "registration actions refuse top-level names and the root",
    () =>
      Effect.gen(function* () {
        const { transport, calls } = scriptedTransport(noRpc);
        const ens = Ensforge.create({
          publicClient: createClient({ chain: mainnet, transport, account: address }),
        });
        const registration = EffectActions.registration;

        for (const name of ["eth", "com", ""]) {
          const options = { name, names: name, duration: Duration.years(1) };
          yield* expectFailure(registration.isAvailable(ens, options), invalid);
          yield* expectFailure(registration.getPrice(ens, options), invalid);
          yield* expectFailure(registration.getRenewalPrice(ens, options), invalid);
          yield* expectFailure(registration.commit(ens, options), invalid);
          yield* expectFailure(registration.register(ens, options), invalid);
          yield* expectFailure(registration.renew(ens, options), invalid);
        }
        assert.deepStrictEqual(calls, []);
      }),
    { meta: { cases: ["H14"] } },
  );
});
