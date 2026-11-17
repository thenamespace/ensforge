import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Abis, Roles } from "@ensforge/contracts";
import { Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { hexToBigInt, namehash, zeroAddress, type Address } from "viem";

import { call, ensforge, isolated, onProfile } from "../support/chain.ts";

describe("access writes", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect(
      "sets and clears a primary name",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const { alice } = devnet.accounts;
          const ens = ensforge(devnet, { account: alice });
          const name = fixtures.byId("records.v1").name;

          yield* isolated(
            devnet,
            Effect.gen(function* () {
              yield* call(() => ens.primaryName.setSync({ name }));
              assert.strictEqual(yield* call(() => ens.primaryName.get({ address: alice })), name);
              yield* call(() => ens.primaryName.setSync({ name: null }));
              assert.isNull(
                yield* call(() => ens.primaryName.get({ address: alice, verify: false })),
              );
            }),
          );
        }),
      { meta: { cases: ["M:C3", "P02"] } },
    );

    it.effect(
      "grants and revokes ENSv1 operators, token approvals and delegates",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const { alice, carol } = devnet.accounts;
          const ens = ensforge(devnet, { account: alice });
          const read = <A>(
            address: Address,
            abi: readonly unknown[],
            functionName: string,
            args: readonly unknown[],
          ) =>
            Effect.promise(
              () =>
                devnet.client.readContract({
                  address,
                  abi: abi as never,
                  functionName: functionName as never,
                  args: args as never,
                }) as Promise<A>,
            );
          const wrapped = fixtures.byId("v1.wrapped").name;
          const records = fixtures.byId("records.v1");

          yield* isolated(
            devnet,
            Effect.gen(function* () {
              yield* call(() =>
                ens.approval.setOperatorSync({
                  operator: carol,
                  approved: true,
                  contract: "registry",
                }),
              );
              yield* call(() => ens.approval.setTokenSync({ name: wrapped, to: carol }));
              yield* call(() =>
                ens.approval.setDelegateSync({
                  name: records.name,
                  delegate: carol,
                  approved: true,
                }),
              );

              assert.isTrue(
                yield* read<boolean>(
                  devnet.contracts["v1.registry"] as Address,
                  Abis.v1.ensRegistry,
                  "isApprovedForAll",
                  [alice, carol],
                ),
              );
              assert.strictEqual(
                yield* read<Address>(
                  devnet.contracts["v1.nameWrapper"] as Address,
                  Abis.v1.nameWrapper,
                  "getApproved",
                  [hexToBigInt(namehash(wrapped))],
                ),
                carol,
              );
              assert.isTrue(
                yield* read<boolean>(
                  records.facts["resolver"] as Address,
                  Abis.v1.publicResolver,
                  "isApprovedFor",
                  [alice, namehash(records.name), carol],
                ),
              );

              yield* call(() =>
                ens.approval.setOperatorSync({
                  operator: carol,
                  approved: false,
                  contract: "registry",
                }),
              );
              yield* call(() => ens.approval.setTokenSync({ name: wrapped, to: null }));
              assert.isFalse(
                yield* read<boolean>(
                  devnet.contracts["v1.registry"] as Address,
                  Abis.v1.ensRegistry,
                  "isApprovedForAll",
                  [alice, carol],
                ),
              );
              assert.strictEqual(
                yield* read<Address>(
                  devnet.contracts["v1.nameWrapper"] as Address,
                  Abis.v1.nameWrapper,
                  "getApproved",
                  [hexToBigInt(namehash(wrapped))],
                ),
                zeroAddress,
              );
            }),
          );
        }),
      { meta: { cases: ["M:D4", "M:D5", "M:D6"] } },
    );

    it.effect(
      "grants and revokes ENSv2 roles",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const { alice, carol } = devnet.accounts;
          const ens = ensforge(devnet, { account: alice });
          const name = fixtures.byId("v2.registered").name;
          const holds = (account: Address) =>
            call(() => ens.role.get({ account, target: "registry", name })).pipe(
              Effect.flatMap((roles) =>
                Effect.promise(() =>
                  devnet.client.readContract({
                    address: roles.contract,
                    abi: Abis.v2.permissionedRegistry,
                    functionName: "hasRoles",
                    args: [roles.resource, Roles.registry.setResolver, account],
                  }),
                ),
              ),
            );

          yield* isolated(
            devnet,
            Effect.gen(function* () {
              yield* call(() =>
                ens.role.grantSync({
                  grantee: carol,
                  roles: ["setResolver"],
                  target: "registry",
                  name,
                }),
              );
              assert.isTrue(yield* holds(carol));
              yield* call(() =>
                ens.role.revokeSync({
                  holder: carol,
                  roles: ["setResolver"],
                  target: "registry",
                  name,
                }),
              );
              assert.isFalse(yield* holds(carol));
            }),
          );
        }),
      { meta: { cases: ["M:A24", "M:D7"] } },
    );

    it.effect(
      "gives an account access to chosen records only",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const { bob, carol } = devnet.accounts;
          const name = fixtures.byId("records.v2").name;
          const owner = ensforge(devnet, { account: bob });
          const grantee = ensforge(devnet, { account: carol });

          yield* isolated(
            devnet,
            Effect.gen(function* () {
              yield* call(() =>
                owner.permission.setRecordAccessSync({
                  name,
                  grantee: carol,
                  records: { texts: ["url"] },
                }),
              );
              yield* call(() =>
                grantee.record.setSync({ name, texts: { url: "https://carol.example" } }),
              );
              assert.strictEqual(
                yield* call(() => owner.record.getText({ name, key: "url" })),
                "https://carol.example",
              );
              const other = yield* call(() =>
                grantee.permission.check({
                  name,
                  operation: { setRecord: "text", key: "description" },
                  account: carol,
                }),
              );
              assert.isFalse(other.allowed);

              yield* call(() =>
                owner.permission.setRecordAccessSync({
                  name,
                  grantee: carol,
                  records: { texts: ["url"] },
                  revoke: true,
                }),
              );
              const revoked = yield* call(() =>
                grantee.permission.check({
                  name,
                  operation: { setRecord: "text", key: "url" },
                  account: carol,
                }),
              );
              assert.isFalse(revoked.allowed);
            }),
          );
        }),
      { meta: { cases: ["M:B6", "M:D7"] } },
    );
  });
});
