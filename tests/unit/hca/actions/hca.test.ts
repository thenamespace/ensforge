import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Abis, Deployments } from "@ensforge/contracts";
import { standaloneSingleOwnerHcaV2Abi } from "@ensforge/contracts/v2/experimental/hca";
import { Actions } from "@ensforge/hca/effect";
import { expectFailure } from "@ensforge/test-harness";
import { decodeFunctionData, type Address, type Hex } from "viem";

import { contracts, hcaAddress, hcaOf, makeClient } from "../fixtures";

const other: Address = "0x00000000000000000000000000000000000000bb";

describe("hca.predictAddress", () => {
  it.effect.each([
    ["the signer", {}, hcaAddress],
    ["another owner", { owner: other }, hcaOf(other)],
  ] as const)("derives the HCA of %s through the factory's CREATE2", ([, options, expected]) =>
    Effect.gen(function* () {
      const { client } = makeClient();
      assert.strictEqual(yield* Actions.hca.predictAddress(client, options), expected);
    }),
  );

  it.effect("fails on a chain without an HCA deployment", () =>
    Effect.gen(function* () {
      const { hca: _, ...v2 } = Deployments.sepolia.v2;
      const { client } = makeClient({ deployment: { ...Deployments.sepolia, v2 } });

      yield* expectFailure(Actions.hca.predictAddress(client, {}), {
        _tag: "HcaError",
        code: "HCA_UNAVAILABLE",
      });
    }),
  );
});

describe("hca input validation", () => {
  const bad = "0x1234";
  const { client } = makeClient();

  it.effect.each<readonly [string, Effect.Effect<unknown, unknown>]>([
    ["predictAddress.owner", Actions.hca.predictAddress(client, { owner: bad })],
    ["get.address", Actions.hca.get(client, { address: bad })],
    ["get.owner", Actions.hca.get(client, { owner: bad })],
    ["getUpgrade.implementation", Actions.hca.getUpgrade(client, { implementation: bad })],
    [
      "authorizeSession.sessionKey",
      Actions.hca.authorizeSession(client, { sessionKey: bad, resolver: other, validUntil: 1 }),
    ],
    [
      "authorizeSession.resolver",
      Actions.hca.authorizeSession(client, { sessionKey: other, resolver: bad, validUntil: 1 }),
    ],
    ["upgrade.implementation", Actions.hca.upgrade.prepare(client, { implementation: bad })],
    ["withdrawDeposit.to", Actions.hca.withdrawDeposit.prepare(client, { to: bad, amount: 1n })],
    [
      "grantUpgradeSetRoles.grantee",
      Actions.hcaAdmin.grantUpgradeSetRoles.prepare(client, { grantee: bad, roles: 1n }),
    ],
    [
      "revokeUpgradeSetRoles.grantee",
      Actions.hcaAdmin.revokeUpgradeSetRoles.prepare(client, { grantee: bad, roles: 1n }),
    ],
    [
      "setDeploymentApproval.implementation",
      Actions.hcaAdmin.setDeploymentApproval.prepare(client, {
        implementation: bad,
        approved: true,
      }),
    ],
    [
      "setUpgradeApproval.implementation",
      Actions.hcaAdmin.setUpgradeApproval.prepare(client, {
        implementation: bad,
        approved: true,
      }),
    ],
    [
      "transferGovernance.newOwner",
      Actions.hcaAdmin.transferGovernance.prepare(client, { newOwner: bad }),
    ],
    [
      "getGovernance.implementation",
      Actions.hcaAdmin.getGovernance(client, { implementation: bad }),
    ],
  ])("rejects an invalid %s", ([, action]) =>
    expectFailure(action, { _tag: "InvalidInputError", code: "INVALID_ADDRESS" }),
  );
});

describe("hca write preconditions", () => {
  it.effect("revokeSessions needs a deployed HCA", () =>
    Effect.gen(function* () {
      const { client } = makeClient();

      yield* expectFailure(Actions.hca.revokeSessions.prepare(client, {}), {
        _tag: "HcaError",
        code: "HCA_NOT_VERIFIED",
      });
    }),
  );

  it.effect("revokeSessions calls the HCA itself, never through it", () =>
    Effect.gen(function* () {
      const { client } = makeClient({ deployed: true });

      const plan = yield* Actions.hca.revokeSessions.prepare(client, {});

      const [call] = plan.calls;
      assert.isDefined(call);
      assert.strictEqual(call.to, hcaAddress);
      assert.strictEqual(
        decodeFunctionData({ abi: standaloneSingleOwnerHcaV2Abi, data: call.data }).functionName,
        "revokeSessions",
      );
    }),
  );

  it.effect.each([
    ["undeployed", false, true, true],
    ["outside the upgrade set", true, false, true],
    ["not accepting the current implementation", true, true, false],
  ] as const)("upgrade refuses an HCA %s", ([, deployed, included, predecessor]) =>
    Effect.gen(function* () {
      const { client } = makeClient({
        deployed,
        stubs: [
          {
            address: contracts.upgradeSet,
            abi: Abis.v2.permissionedAddressSet,
            functions: { includes: () => included },
          },
          {
            address: other,
            abi: standaloneSingleOwnerHcaV2Abi,
            functions: { canUpgradeFrom: () => predecessor },
          },
        ],
      });

      yield* expectFailure(Actions.hca.upgrade.prepare(client, { implementation: other }), {
        _tag: "HcaError",
        code: "HCA_UPGRADE_NOT_ALLOWED",
      });
    }),
  );

  it.effect("withdrawDeposit runs from the HCA without forwarding value", () =>
    Effect.gen(function* () {
      const { client } = makeClient({ deployed: true });

      const plan = yield* Actions.hca.withdrawDeposit.prepare(client, { to: other, amount: 5n });

      const [outer] = plan.calls;
      assert.isDefined(outer);
      assert.strictEqual(outer.value, 0n);
      const decoded = decodeFunctionData({ abi: standaloneSingleOwnerHcaV2Abi, data: outer.data });
      assert.strictEqual(decoded.functionName, "executeByOwner");
      const [[inner]] = decoded.args as unknown as readonly [
        readonly { target: Address; callData: Hex }[],
      ];
      assert.isDefined(inner);
      assert.strictEqual(inner.target, hcaAddress);
      assert.deepStrictEqual(
        decodeFunctionData({ abi: standaloneSingleOwnerHcaV2Abi, data: inner.callData }).args,
        [other, 5n],
      );
    }),
  );
});
