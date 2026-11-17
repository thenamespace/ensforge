import { describe } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";

import { Abis } from "@ensforge/contracts";
import { Fuse, Name, Role } from "@ensforge/sdk";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { onProfile } from "@ensforge/test-integration/support/lane";
import { hexToBigInt, type Address } from "viem";

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
        const accounts = [alice, bob, delegated.facts["delegate"] as Address];
        const registryRoles = Object.keys(Role.registry) as (keyof typeof Role.registry)[];
        const cases = Arbitrary.all({
          // A subset of the roles, as a keep/drop mask.
          roles: Arbitrary.map(
            Arbitrary.array(Arbitrary.schema(Schema.Boolean), {
              minLength: registryRoles.length,
              maxLength: registryRoles.length,
            }),
            (keep) => registryRoles.filter((_, index) => keep[index]),
          ),
          account: Arbitrary.schema(Schema.Literals([0, 1, 2])),
        });

        yield* holds(cases, ({ roles, account }) =>
          Effect.gen(function* () {
            const holder = accounts[account] as Address;
            const [tokenRoles, rootRoles, onChain] = yield* Effect.all([
              chain.read({ ...registry, functionName: "roles", args: [resource, holder] }),
              chain.read({ ...registry, functionName: "roles", args: [0n, holder] }),
              chain.read({
                ...registry,
                functionName: "hasRoles",
                args: [resource, Role.from(roles), holder],
              }),
            ]);
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
        const wrapped = fixtures.all.filter((fixture) => fixture.tags["kind"] === "v1-wrapped");
        const fuseNames = Object.keys(Fuse.decode(0)) as Fuse.Name[];
        const cases = Arbitrary.all({
          fuses: Arbitrary.map(
            Arbitrary.array(Arbitrary.schema(Schema.Boolean), {
              minLength: fuseNames.length,
              maxLength: fuseNames.length,
            }),
            (keep) => fuseNames.filter((_, index) => keep[index]),
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
            return fuses.every((fuse) => Fuse.has(burned, fuse)) === onChain;
          }),
        );
      }),
    );
  });
});
