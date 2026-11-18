import { assert, describe } from "@effect/vitest";
import { Arbitrary, Effect, Schema, Array as Arr, Record as Rec } from "effect";

import { Abis } from "@ensforge/contracts";
import { Fuse, Name, Role } from "@ensforge/sdk";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { onProfile } from "@ensforge/test-integration/support/lane";
import { hexToBigInt, isAddress } from "viem";

import { holds } from "./check.ts";

describe("bitmaps against the contracts", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect("Role.from and Role.has agree with EnhancedAccessControl.hasRoles", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const devnet = yield* Devnet;
        const chain = yield* Chain;
        const registry = {
          address: devnet.contract("v2.ethRegistry"),
          abi: Abis.v2.permissionedRegistry,
        } as const;
        // A name its owner and a delegate hold different roles on.
        const delegated = fixtures.byId("v2.roles");
        const tokenId = yield* chain.read({
          ...registry,
          functionName: "findTokenId",
          args: [Name.parse(delegated.name).label],
        });
        const resource = yield* chain.read({
          ...registry,
          functionName: "getResource",
          args: [tokenId],
        });
        const { alice, bob } = devnet.accounts;
        const delegate = delegated.facts["delegate"];
        if (typeof delegate !== "string" || !isAddress(delegate)) {
          assert.fail("v2.roles has no delegate");
        }
        const accounts = [alice, bob, delegate] as const;
        const registryRoles = Rec.keys(Role.registry);
        const cases = Arbitrary.all({
          // A subset of the roles, as a keep/drop mask.
          roles: Arbitrary.map(
            Arbitrary.array(Arbitrary.schema(Schema.Boolean), {
              minLength: registryRoles.length,
              maxLength: registryRoles.length,
            }),
            (keep) => Arr.filter(registryRoles, (_, index) => keep[index] === true),
          ),
          account: Arbitrary.schema(Schema.Literals([0, 1, 2])),
        });

        yield* holds(cases, ({ roles, account }) =>
          Effect.gen(function* () {
            const holder = accounts[account];
            const [tokenRoles, rootRoles, onChain] = yield* Effect.all(
              [
                chain.read({ ...registry, functionName: "roles", args: [resource, holder] }),
                chain.read({ ...registry, functionName: "roles", args: [0n, holder] }),
                chain.read({
                  ...registry,
                  functionName: "hasRoles",
                  args: [resource, Role.from(roles), holder],
                }),
              ],
              { concurrency: 1 },
            );
            return Role.has(tokenRoles | rootRoles, roles) === onChain;
          }),
        );
      }),
    );

    it.effect("Fuse.from and Fuse.has agree with NameWrapper.allFusesBurned", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const devnet = yield* Devnet;
        const chain = yield* Chain;
        const wrapper = { address: devnet.contract("v1.nameWrapper"), abi: Abis.v1.nameWrapper };
        const wrapped = Arr.filter(
          fixtures.all,
          (fixture) => fixture.tags["kind"] === "v1-wrapped",
        );
        const fuseNames = Rec.keys(Fuse.decode(0));
        const cases = Arbitrary.all({
          fuses: Arbitrary.map(
            Arbitrary.array(Arbitrary.schema(Schema.Boolean), {
              minLength: fuseNames.length,
              maxLength: fuseNames.length,
            }),
            (keep) => Arr.filter(fuseNames, (_, index) => keep[index] === true),
          ),
          name: Arbitrary.schema(
            Schema.Number.check(
              Schema.isInt(),
              Schema.isBetween({ minimum: 0, maximum: wrapped.length - 1 }),
            ),
          ),
        });

        yield* holds(cases, ({ fuses, name }) =>
          Effect.gen(function* () {
            const node = Name.namehash((wrapped[name] ?? wrapped[0])?.name ?? "");
            const [, burned] = yield* chain.read({
              ...wrapper,
              functionName: "getData",
              args: [hexToBigInt(node)],
            });
            const onChain = yield* chain.read({
              ...wrapper,
              functionName: "allFusesBurned",
              args: [node, Fuse.from(fuses)],
            });
            return Arr.every(fuses, (fuse) => Fuse.has(burned, fuse)) === onChain;
          }),
        );
      }),
    );
  });
});
