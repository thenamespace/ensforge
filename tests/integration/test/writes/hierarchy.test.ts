import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { nameWrapperFuses as fuse } from "@ensforge/contracts/v1";
import { Actions } from "@ensforge/sdk/effect";
import { Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import { zeroAddress, type Address } from "viem";

import { ensforge, isolated, onProfile } from "../support/chain.ts";
import { v1Owners } from "./support.ts";

describe("subnames, wrapper and registries", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect(
      "creates, updates and removes ENSv1 subnames",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const { alice, carol } = devnet.accounts;
          const ens = ensforge(devnet, { account: alice });
          const child = `new.${fixtures.byId("records.v1").name}`;

          yield* isolated(
            devnet,
            Effect.gen(function* () {
              yield* Actions.subname.createSync(ens, { name: child });
              assert.strictEqual((yield* v1Owners(devnet, child)).registry, alice);
              yield* Actions.subname.updateSync(ens, { name: child, owner: carol });
              assert.strictEqual((yield* v1Owners(devnet, child)).registry, carol);
              yield* Actions.subname.removeSync(ens, { name: child });
              assert.strictEqual((yield* v1Owners(devnet, child)).registry, zeroAddress);
            }),
          );
        }),
      { meta: { cases: ["M:A4", "O12"] } },
    );

    it.effect(
      "follows NameWrapper fuse rules for children",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const { alice, carol } = devnet.accounts;
          const ens = ensforge(devnet, { account: alice });
          const fusesOf = (name: string) =>
            v1Owners(devnet, name).pipe(Effect.map(({ wrapped }) => wrapped?.[1] ?? 0));

          // A parent-controlled child changes hands at its parent's word.
          const controlled = fixtures.byId("v1.wrapped.sub").name;
          yield* isolated(
            devnet,
            Effect.gen(function* () {
              yield* Actions.subname.updateSync(ens, { name: controlled, owner: carol });
              assert.strictEqual((yield* v1Owners(devnet, controlled)).wrapped?.[0], carol);
            }),
          );
          // An emancipated child cannot be taken back.
          yield* expectFailure(
            Actions.subname.remove(ens, { name: fixtures.byId("v1.wrapped.sub.emancipated").name }),
            {
              _tag: "UnauthorizedError",
              code: "FUSE_BURNED",
            },
          );
          // Emancipating a child needs a locked parent (W02).
          yield* expectFailure(
            Actions.subname.create(ens, {
              name: `new.${fixtures.byId("v1.wrapped").name}`,
              fuses: ["parentCannotControl"],
            }),
            { _tag: "UnauthorizedError", code: "FUSE_BURNED" },
          );
          // CANNOT_CREATE_SUBDOMAIN on the parent.
          yield* expectFailure(
            Actions.subname.create(ens, {
              name: `x.${fixtures.byId("v1.wrapped.locked.cannot-create-subdomain").name}`,
            }),
            { _tag: "UnauthorizedError", code: "FUSE_BURNED" },
          );
          // A locked parent emancipates its new child.
          const locked = fixtures.byId("v1.wrapped.locked").name;
          yield* isolated(
            devnet,
            Effect.gen(function* () {
              const child = `free.${locked}`;
              yield* Actions.subname.createSync(ens, {
                name: child,
                owner: carol,
                fuses: ["parentCannotControl"],
              });
              assert.strictEqual(
                (yield* fusesOf(child)) & fuse.parentCannotControl,
                fuse.parentCannotControl,
              );
            }),
          );
        }),
      { meta: { cases: ["M:A9", "M:A10", "W02", "W05"] } },
    );

    it.effect(
      "wraps, burns fuses, and refuses what burned fuses forbid",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const { alice } = devnet.accounts;
          const ens = ensforge(devnet, { account: alice });
          const fusesOf = (name: string) =>
            v1Owners(devnet, name).pipe(Effect.map(({ wrapped }) => wrapped?.[1] ?? 0));

          const plain = fixtures.byId("records.v1").name;
          yield* isolated(
            devnet,
            Effect.gen(function* () {
              yield* Actions.wrapper.wrapSync(ens, { name: plain, fuses: ["cannotUnwrap"] });
              const { wrapped } = yield* v1Owners(devnet, plain);
              assert.strictEqual(wrapped?.[0], alice);
              assert.strictEqual(
                (wrapped?.[1] ?? 0) & (fuse.cannotUnwrap | fuse.parentCannotControl),
                fuse.cannotUnwrap | fuse.parentCannotControl,
              );
            }),
          );
          const wrappedName = fixtures.byId("v1.wrapped").name;
          yield* isolated(
            devnet,
            Effect.gen(function* () {
              yield* Actions.wrapper.unwrapSync(ens, { name: wrappedName });
              assert.strictEqual((yield* v1Owners(devnet, wrappedName)).registry, alice);
            }),
          );
          const locked = fixtures.byId("v1.wrapped.locked").name;
          yield* isolated(
            devnet,
            Effect.gen(function* () {
              yield* Actions.wrapper.setFusesSync(ens, { name: locked, fuses: ["cannotTransfer"] });
              assert.strictEqual(
                (yield* fusesOf(locked)) & fuse.cannotTransfer,
                fuse.cannotTransfer,
              );
            }),
          );
          yield* expectFailure(Actions.wrapper.unwrap(ens, { name: locked }), {
            _tag: "UnauthorizedError",
            code: "FUSE_BURNED",
          });
          yield* expectFailure(
            Actions.wrapper.setFuses(ens, {
              name: fixtures.byId("v1.wrapped.locked.cannot-burn-fuses").name,
              fuses: ["cannotTransfer"],
            }),
            { _tag: "UnauthorizedError", code: "FUSE_BURNED" },
          );
        }),
      { meta: { cases: ["M:A7", "M:A8", "W04"] } },
    );

    it.effect(
      "extends an emancipated child's expiry, up to its parent's",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const ens = ensforge(devnet, { account: devnet.accounts.alice });
          const child = fixtures.byId("v1.wrapped.sub.emancipated").name;
          const parent = child.slice(child.indexOf(".") + 1);
          const expiryOf = (name: string) =>
            v1Owners(devnet, name).pipe(Effect.map(({ wrapped }) => wrapped?.[2] ?? 0n));

          yield* isolated(
            devnet,
            Effect.gen(function* () {
              // Renewing the parent through ETHRenewerV1 extends its wrapper expiry too.
              yield* Actions.registration.renewSync(ens, { names: parent, duration: 31_536_000n });
              const before = yield* expiryOf(child);
              const limit = yield* expiryOf(parent);
              assert.isTrue(limit > before + 86_400n, "the parent outlives the child");

              yield* Actions.wrapper.setChildFusesSync(ens, {
                name: child,
                expiry: before + 86_400n,
              });
              assert.strictEqual(yield* expiryOf(child), before + 86_400n);
              yield* Actions.wrapper.setChildFusesSync(ens, {
                name: child,
                expiry: limit + 86_400n,
              });
              assert.strictEqual(yield* expiryOf(child), limit);
            }),
          );
        }),
      { meta: { cases: ["W03", "W14", "G12"] } },
    );

    it.effect(
      "creates ENSv2 subnames, deploying a registry where the parent has none",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const { alice, carol } = devnet.accounts;
          const ens = ensforge(devnet, { account: alice });
          const parent = fixtures.byId("v2.registered").name;

          yield* isolated(
            devnet,
            Effect.gen(function* () {
              const { plan } = yield* Actions.subname.createSync(ens, {
                name: `kid.${parent}`,
                owner: carol,
              });
              assert.deepStrictEqual(
                plan.steps.map((step) => step.id),
                ["deploy", "create"],
              );
              const registry = (yield* Actions.registry.get(ens, { name: parent }))?.address;
              if (registry === undefined) return assert.fail("no registry");
              const owner = yield* Effect.promise(() =>
                devnet.client.readContract({
                  address: registry,
                  abi: Abis.v2.permissionedRegistry,
                  functionName: "findOwner",
                  args: ["kid"],
                }),
              );
              assert.strictEqual(owner, carol);

              yield* Actions.subname.removeSync(ens, { name: `kid.${parent}` });
              assert.strictEqual(
                (yield* Actions.name.get(ens, { name: `kid.${parent}` })).status,
                "available",
              );
            }),
          );
        }),
      { meta: { cases: ["M:A18"] } },
    );

    it.effect(
      "deploys a registry and attaches it under a name",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const ens = ensforge(devnet, { account: devnet.accounts.alice });
          const name = fixtures.byId("v2.registered").name;

          yield* isolated(
            devnet,
            Effect.gen(function* () {
              const { registry } = yield* Actions.registry.deploySync(ens, { attachTo: name });
              const attached = yield* Actions.registry.get(ens, { name });
              assert.deepInclude(attached, {
                address: registry as Address,
                kind: "user",
                canonicalName: name,
              });
            }),
          );
        }),
      { meta: { cases: ["M:A18"] } },
    );
  });
});
