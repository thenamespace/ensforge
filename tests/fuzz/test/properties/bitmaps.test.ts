import { describe } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";

import { Abis } from "@ensforge/contracts";
import { Fuse, Name, Role } from "@ensforge/sdk";
import { Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { onProfile } from "@ensforge/test-integration/support/chain";
import type { Address } from "viem";

import { holds } from "./check.ts";

/** A subset of `names`, as a random keep/drop mask. */
const subsets = <const N extends string>(names: readonly N[]) =>
  Arbitrary.map(
    Arbitrary.array(Arbitrary.schema(Schema.Boolean), {
      minLength: names.length,
      maxLength: names.length,
    }),
    (keep) => names.filter((_, index) => keep[index] === true),
  );

const registryRoles = Object.keys(Role.registry) as readonly (keyof typeof Role.registry)[];
const fuseNames = Object.keys(Fuse.decode(0)) as readonly Fuse.Name[];

describe("bitmaps against the contracts", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect("Role.from and Role.has agree with EnhancedAccessControl.hasRoles", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const devnet = yield* Devnet;
        const registry = devnet.contracts["v2.ethRegistry"] as Address;
        const abi = Abis.v2.permissionedRegistry;
        const read = <A>(functionName: string, args: readonly unknown[]) =>
          Effect.promise(
            () =>
              devnet.client.readContract({
                address: registry,
                abi,
                functionName,
                args,
              } as never) as Promise<A>,
          );
        // A name its owner and a delegate hold different roles on.
        const delegated = fixtures.byId("v2.roles");
        const tokenId = yield* read<bigint>("findTokenId", [
          delegated.name.slice(0, -".eth".length),
        ]);
        const resource = yield* read<bigint>("getResource", [tokenId]);
        const { alice, bob } = devnet.accounts;
        const accounts = [alice, bob, String(delegated.facts["delegate"]) as Address];
        const cases = Arbitrary.all({
          roles: subsets(registryRoles),
          account: Arbitrary.schema(Schema.Literals([0, 1, 2])),
        });

        yield* holds(cases, ({ roles, account }) =>
          Effect.gen(function* () {
            const holder = accounts[account] as Address;
            const [tokenRoles, rootRoles, onChain] = yield* Effect.all([
              read<bigint>("roles", [resource, holder]),
              read<bigint>("roles", [0n, holder]),
              read<boolean>("hasRoles", [resource, Role.from(roles), holder]),
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
        const wrapper = devnet.contracts["v1.nameWrapper"] as Address;
        const read = <A>(functionName: string, args: readonly unknown[]) =>
          Effect.promise(
            () =>
              devnet.client.readContract({
                address: wrapper,
                abi: Abis.v1.nameWrapper,
                functionName,
                args,
              } as never) as Promise<A>,
          );
        const wrapped = fixtures.all.filter((fixture) => fixture.tags["kind"] === "v1-wrapped");
        const cases = Arbitrary.all({
          fuses: subsets(fuseNames),
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
            const [, burned] = yield* read<readonly [Address, number, bigint]>("getData", [
              BigInt(node),
            ]);
            const onChain = yield* read<boolean>("allFusesBurned", [node, Fuse.from(fuses)]);
            return fuses.every((fuse) => Fuse.has(burned, fuse)) === onChain;
          }),
        );
      }),
    );
  });
});
