import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Abis, Deployments } from "@ensforge/contracts";
import { standaloneSingleOwnerHcaV2Abi } from "@ensforge/contracts/v2/experimental/hca";
import type { Client } from "@ensforge/sdk/extension";
import { expectFailure } from "@ensforge/test-harness";
import { decodeFunctionData, type Address } from "viem";

import * as Actions from "#/actions/effect";

import { contracts, hcaAddress, hcaOf, makeClient } from "../fixtures";

const other: Address = "0x00000000000000000000000000000000000000bb";
const invalidAddress = { _tag: "InvalidInputError", code: "INVALID_ADDRESS" };

const defined = <value>(value: value | undefined): value => {
  assert.isDefined(value);
  return value as value;
};

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

  it.effect("fails on a chain without an HCA deployment", () => {
    const { hca: _, ...v2 } = Deployments.sepolia.v2;
    const { client } = makeClient({ deployment: { ...Deployments.sepolia, v2 } });
    return expectFailure(Actions.hca.predictAddress(client, {}), {
      _tag: "HcaError",
      code: "HCA_UNAVAILABLE",
    });
  });
});

describe("hca input validation", () => {
  const bad = "0x1234";
  const cases: readonly (readonly [string, (client: Client) => Effect.Effect<unknown, unknown>])[] =
    [
      ["predictAddress.owner", (client) => Actions.hca.predictAddress(client, { owner: bad })],
      ["get.address", (client) => Actions.hca.get(client, { address: bad })],
      ["get.owner", (client) => Actions.hca.get(client, { owner: bad })],
      [
        "getUpgrade.implementation",
        (client) => Actions.hca.getUpgrade(client, { implementation: bad }),
      ],
      [
        "authorizeSession.sessionKey",
        (client) =>
          Actions.hca.authorizeSession(client, { sessionKey: bad, resolver: other, validUntil: 1 }),
      ],
      [
        "authorizeSession.resolver",
        (client) =>
          Actions.hca.authorizeSession(client, { sessionKey: other, resolver: bad, validUntil: 1 }),
      ],
      [
        "upgrade.implementation",
        (client) => Actions.hca.upgrade.prepare(client, { implementation: bad }),
      ],
      [
        "withdrawDeposit.to",
        (client) => Actions.hca.withdrawDeposit.prepare(client, { to: bad, amount: 1n }),
      ],
      [
        "grantUpgradeSetRoles.grantee",
        (client) =>
          Actions.hcaAdmin.grantUpgradeSetRoles.prepare(client, { grantee: bad, roles: 1n }),
      ],
      [
        "revokeUpgradeSetRoles.grantee",
        (client) =>
          Actions.hcaAdmin.revokeUpgradeSetRoles.prepare(client, { grantee: bad, roles: 1n }),
      ],
      [
        "setDeploymentApproval.implementation",
        (client) =>
          Actions.hcaAdmin.setDeploymentApproval.prepare(client, {
            implementation: bad,
            approved: true,
          }),
      ],
      [
        "setUpgradeApproval.implementation",
        (client) =>
          Actions.hcaAdmin.setUpgradeApproval.prepare(client, {
            implementation: bad,
            approved: true,
          }),
      ],
      [
        "transferGovernance.newOwner",
        (client) => Actions.hcaAdmin.transferGovernance.prepare(client, { newOwner: bad }),
      ],
      [
        "getGovernance.implementation",
        (client) => Actions.hcaAdmin.getGovernance(client, { implementation: bad }),
      ],
    ];

  it.effect.each(cases)("rejects an invalid %s", ([, run]) =>
    Effect.gen(function* () {
      const { client } = makeClient();
      yield* expectFailure(run(client), invalidAddress);
    }),
  );
});

describe("hca write preconditions", () => {
  it.effect("revokeSessions needs a deployed HCA", () =>
    expectFailure(Actions.hca.revokeSessions.prepare(makeClient().client, {}), {
      _tag: "HcaError",
      code: "HCA_NOT_VERIFIED",
    }),
  );

  it.effect("revokeSessions calls the HCA itself, never through it", () =>
    Effect.gen(function* () {
      const plan = yield* Actions.hca.revokeSessions.prepare(
        makeClient({ deployed: true }).client,
        {},
      );
      const [call] = plan.calls;
      assert.strictEqual(defined(call).to, hcaAddress);
      assert.strictEqual(
        decodeFunctionData({ abi: standaloneSingleOwnerHcaV2Abi, data: defined(call).data })
          .functionName,
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
      const implementation = other;
      const { client } = makeClient({
        deployed,
        stubs: [
          {
            address: contracts.upgradeSet,
            abi: Abis.v2.permissionedAddressSet,
            functions: { includes: () => included },
          },
          {
            address: implementation,
            abi: standaloneSingleOwnerHcaV2Abi,
            functions: { canUpgradeFrom: () => predecessor },
          },
        ],
      });
      yield* expectFailure(Actions.hca.upgrade.prepare(client, { implementation }), {
        _tag: "HcaError",
        code: "HCA_UPGRADE_NOT_ALLOWED",
      });
    }),
  );

  it.effect("withdrawDeposit runs from the HCA without forwarding value", () =>
    Effect.gen(function* () {
      const plan = yield* Actions.hca.withdrawDeposit.prepare(
        makeClient({ deployed: true }).client,
        {
          to: other,
          amount: 5n,
        },
      );
      const [outer] = plan.calls;
      const decoded = decodeFunctionData({
        abi: standaloneSingleOwnerHcaV2Abi,
        data: defined(outer).data,
      });
      assert.strictEqual(defined(outer).value, 0n);
      assert.strictEqual(decoded.functionName, "executeByOwner");
      const [[inner]] = decoded.args as unknown as readonly [
        readonly { target: Address; callData: `0x${string}` }[],
      ];
      assert.strictEqual(defined(inner).target, hcaAddress);
      assert.deepStrictEqual(
        decodeFunctionData({ abi: standaloneSingleOwnerHcaV2Abi, data: defined(inner).callData })
          .args,
        [other, 5n],
      );
    }),
  );
});
