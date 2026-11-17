import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Abis, Roles } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { hexToBigInt, namehash, zeroAddress, type Address } from "viem";

import { Clients } from "../support/clients.ts";
import { onProfile } from "../support/lane.ts";

describe("access writes", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect(
      "sets and clears a primary name",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { alice } = (yield* Devnet).accounts;
          const chain = yield* Chain;
          const ens = (yield* Clients).make({ account: alice });
          const name = fixtures.byId("records.v1").name;

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.primaryName.setSync(ens, { name });
              assert.strictEqual(yield* Actions.primaryName.get(ens, { address: alice }), name);

              yield* Actions.primaryName.setSync(ens, { name: null });
              assert.isNull(yield* Actions.primaryName.get(ens, { address: alice, verify: false }));
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
          const chain = yield* Chain;
          const ens = (yield* Clients).make({ account: alice });
          const wrapped = fixtures.byId("v1.wrapped").name;
          const records = fixtures.byId("records.v1");
          const registryApproves = chain.read({
            address: devnet.contract("v1.registry"),
            abi: Abis.v1.ensRegistry,
            functionName: "isApprovedForAll",
            args: [alice, carol],
          });
          const tokenApproved = chain.read({
            address: devnet.contract("v1.nameWrapper"),
            abi: Abis.v1.nameWrapper,
            functionName: "getApproved",
            args: [hexToBigInt(namehash(wrapped))],
          });

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.approval.setOperatorSync(ens, {
                operator: carol,
                approved: true,
                contract: "registry",
              });
              yield* Actions.approval.setTokenSync(ens, { name: wrapped, to: carol });
              yield* Actions.approval.setDelegateSync(ens, {
                name: records.name,
                delegate: carol,
                approved: true,
              });

              assert.isTrue(yield* registryApproves);
              assert.strictEqual(yield* tokenApproved, carol);
              assert.isTrue(
                yield* chain.read({
                  address: records.facts["resolver"] as Address,
                  abi: Abis.v1.publicResolver,
                  functionName: "isApprovedFor",
                  args: [alice, namehash(records.name), carol],
                }),
              );

              yield* Actions.approval.setOperatorSync(ens, {
                operator: carol,
                approved: false,
                contract: "registry",
              });
              yield* Actions.approval.setTokenSync(ens, { name: wrapped, to: null });

              assert.isFalse(yield* registryApproves);
              assert.strictEqual(yield* tokenApproved, zeroAddress);
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
          const { alice, carol } = (yield* Devnet).accounts;
          const chain = yield* Chain;
          const ens = (yield* Clients).make({ account: alice });
          const name = fixtures.byId("v2.registered").name;
          // Read from the registry itself, not through ensforge.
          const carolHolds = Effect.flatMap(
            Actions.role.get(ens, { account: carol, target: "registry", name }),
            (roles) =>
              chain.read({
                address: roles.contract,
                abi: Abis.v2.permissionedRegistry,
                functionName: "hasRoles",
                args: [roles.resource, Roles.registry.setResolver, carol],
              }),
          );

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.role.grantSync(ens, {
                grantee: carol,
                roles: ["setResolver"],
                target: "registry",
                name,
              });
              assert.isTrue(yield* carolHolds);

              yield* Actions.role.revokeSync(ens, {
                holder: carol,
                roles: ["setResolver"],
                target: "registry",
                name,
              });
              assert.isFalse(yield* carolHolds);
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
          const { bob, carol } = (yield* Devnet).accounts;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const name = fixtures.byId("records.v2").name;
          const owner = clients.make({ account: bob });
          const grantee = clients.make({ account: carol });

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.permission.setRecordAccessSync(owner, {
                name,
                grantee: carol,
                records: { texts: ["url"] },
              });
              yield* Actions.record.setSync(grantee, {
                name,
                texts: { url: "https://carol.example" },
              });
              assert.strictEqual(
                yield* Actions.record.getText(owner, { name, key: "url" }),
                "https://carol.example",
              );
              const other = yield* Actions.permission.check(grantee, {
                name,
                operation: { setRecord: "text", key: "description" },
                account: carol,
              });
              assert.isFalse(other.allowed);

              yield* Actions.permission.setRecordAccessSync(owner, {
                name,
                grantee: carol,
                records: { texts: ["url"] },
                revoke: true,
              });
              const revoked = yield* Actions.permission.check(grantee, {
                name,
                operation: { setRecord: "text", key: "url" },
                account: carol,
              });
              assert.isFalse(revoked.allowed);
            }),
          );
        }),
      { meta: { cases: ["M:B6", "M:D7"] } },
    );
  });
});
