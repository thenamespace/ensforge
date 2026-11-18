import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Abis, Roles } from "@ensforge/contracts";
import { Name } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import {
  decodeFunctionData,
  hexToBigInt,
  namehash,
  numberToHex,
  zeroAddress,
  type Address,
} from "viem";

import { Clients } from "../support/clients.ts";
import { ethEntry } from "../support/contracts.ts";
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
      "grants root roles with grantRootRoles, regenerating no token",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { alice, carol } = (yield* Devnet).accounts;
          const chain = yield* Chain;
          const ens = (yield* Clients).make({ account: alice });
          const child = fixtures.byId("v2.subnames");
          const registry = String(child.facts["parentRegistry"]);
          const sub = Name.parse(child.name).parent ?? assert.fail("a subname has a parent");
          const before = (yield* Actions.name.get(ens, { name: sub })).tokenId;

          yield* chain.isolated(
            Effect.gen(function* () {
              // A regeneration role, granted at the root rather than on a name.
              const { plan } = yield* Actions.role.grantSync(ens, {
                grantee: carol,
                roles: ["setSubregistry"],
                target: "registry",
                root: true,
                contract: registry,
              });
              // `grantRoles` on the root resource reverts EACRootResourceNotAllowed.
              assert.strictEqual(
                decodeFunctionData({
                  abi: Abis.v2.permissionedRegistry,
                  data: plan.calls[0]?.data ?? "0x",
                }).functionName,
                "grantRootRoles",
              );
              assert.isEmpty(plan.warnings);
              assert.strictEqual(
                (yield* Actions.role.get(ens, {
                  account: carol,
                  target: "registry",
                  root: true,
                  contract: registry,
                })).rootRoles,
                Roles.registry.setSubregistry,
              );
              assert.strictEqual((yield* Actions.name.get(ens, { name: sub })).tokenId, before);
            }),
          );
        }),
      { meta: { cases: ["W26", "W32"] } },
    );

    it.effect(
      "refuses a 16th holder of a role, and still transfers the name",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const { alice, user } = devnet.accounts;
          const chain = yield* Chain;
          const ens = (yield* Clients).make({ account: alice });
          const { name } = fixtures.byId("v2.roles");
          const tokenId = (yield* ethEntry(name)).tokenId;

          yield* chain.isolated(
            Effect.gen(function* () {
              // Alice and carol hold setResolver; thirteen more fill its count of fifteen.
              for (let holder = 1; holder <= 13; holder++) {
                yield* chain.write({
                  account: alice,
                  address: devnet.contract("v2.ethRegistry"),
                  abi: Abis.v2.permissionedRegistry,
                  functionName: "grantRoles",
                  args: [tokenId, Roles.registry.setResolver, numberToHex(holder, { size: 20 })],
                });
              }

              const error = yield* expectFailure(
                Actions.role.grant(ens, {
                  grantee: numberToHex(14, { size: 20 }),
                  roles: ["setResolver"],
                  target: "registry",
                  name,
                }),
                { _tag: "InvalidInputError", code: "INVALID_ROLES" },
              );
              assert.strictEqual(error.context.revert?.errorName, "EACMaxAssignees");

              yield* Actions.name.transferSync(ens, { name, to: user, unsafe: true });
              assert.strictEqual((yield* ethEntry(name)).owner, user);
            }),
          );
        }),
      { meta: { cases: ["W27"] } },
    );

    it.effect(
      "lets an operator act with the owner's roles, which revoking cannot take away",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { carol, operator, user } = (yield* Devnet).accounts;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { name } = fixtures.byId("v2.operator");
          const rolesOf = (account: Address) =>
            Actions.role
              .get(clients.reader, { account, target: "registry", name })
              .pipe(Effect.map((held) => held.roles));

          // The operator holds no roles of its own; the registry blends in the owner's.
          assert.strictEqual(yield* rolesOf(operator), yield* rolesOf(carol));
          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.role.grantSync(clients.make({ account: operator }), {
                grantee: user,
                roles: ["setResolver"],
                target: "registry",
                name,
              });
              assert.strictEqual(yield* rolesOf(user), Roles.registry.setResolver);

              yield* Actions.role.revokeSync(clients.make({ account: carol }), {
                holder: operator,
                roles: ["setResolver"],
                target: "registry",
                name,
              });
              assert.strictEqual(yield* rolesOf(operator), yield* rolesOf(carol));
            }),
          );
        }),
      { meta: { cases: ["W28"] } },
    );

    it.effect(
      "grants roles through any version of a regenerated token ID",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { alice, carol } = (yield* Devnet).accounts;
          const chain = yield* Chain;
          const ens = (yield* Clients).make({ account: alice });
          const regenerated = fixtures.byId("v2.regenerated");

          yield* chain.isolated(
            Effect.gen(function* () {
              const { plan } = yield* Actions.role.grantSync(ens, {
                grantee: carol,
                roles: ["setResolver"],
                target: "registry",
                name: regenerated.name,
              });
              // ensforge sends the label's first ID, not the current one; the registry takes any.
              const { args } = decodeFunctionData({
                abi: Abis.v2.permissionedRegistry,
                data: plan.calls[0]?.data ?? "0x",
              });
              assert.strictEqual(args?.[0], Name.toTokenId(regenerated.name));
              assert.notStrictEqual(args?.[0], BigInt(String(regenerated.facts["tokenId"])));
              const held = yield* Actions.role.get(ens, {
                account: carol,
                target: "registry",
                name: regenerated.name,
              });
              assert.include(held.names, "setResolver");
            }),
          );
        }),
      { meta: { cases: ["W36"] } },
    );

    it.effect(
      "refuses role grants to no account, and child registries to owners without the role",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { alice } = (yield* Devnet).accounts;
          const chain = yield* Chain;
          const ens = (yield* Clients).make({ account: alice });
          const name = fixtures.byId("v2.registered").name;

          yield* expectFailure(
            Actions.role.grant(ens, {
              grantee: zeroAddress,
              roles: ["setResolver"],
              target: "registry",
              name,
            }),
            { _tag: "InvalidInputError", code: "INVALID_ADDRESS" },
          );
          // Owning the token is not enough: attaching a subregistry needs setSubregistry.
          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.role.revokeSync(ens, {
                holder: alice,
                roles: ["setSubregistry"],
                target: "registry",
                name,
              });
              yield* expectFailure(Actions.subname.create(ens, { name: `kid.${name}` }), {
                _tag: "UnauthorizedError",
                code: "MISSING_ROLES",
              });
            }),
          );
        }),
      { meta: { cases: ["W33", "W34"] } },
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
