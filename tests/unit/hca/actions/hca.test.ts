import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect } from "effect";

import { Abis, Deployments } from "@ensforge/contracts";
import {
  standaloneHcaFactoryV2Abi,
  standaloneSingleOwnerHcaV2Abi,
} from "@ensforge/contracts/v2/experimental/hca";
import type { HcaError, HcaSession } from "@ensforge/hca";
import { Actions } from "@ensforge/hca/effect";
import type { Errors } from "@ensforge/sdk";
import { expectFailure } from "@ensforge/test-harness";
import { decodeFunctionData, zeroHash, type Address } from "viem";

import { contracts, hcaAddress, hcaOf, makeClient, owner } from "../fixtures";

// A success type of `unknown` would turn `expectFailure`'s flipped error channel into `unknown`.
type FailingAction = readonly [
  string,
  Effect.Effect<object | bigint | string | boolean, Errors.AnyError | HcaError>,
];

const other: Address = "0x00000000000000000000000000000000000000bb";

describe("hca.predictAddress", () => {
  it.effect.each([
    ["the signer", {}, hcaAddress],
    ["another owner", { owner: other }, hcaOf(other)],
  ] as const)("derives the HCA of %s through the factory's CREATE2", ([, options, expected]) =>
    Effect.gen(function* () {
      const { client } = makeClient();
      const predicted = yield* Actions.hca.predictAddress(client, options);
      assert.strictEqual(predicted, expected);
    }),
  );
});

describe("hca without a deployment", () => {
  const { hca: _, ...v2 } = Deployments.sepolia.v2;
  const { client } = makeClient({ deployment: { ...Deployments.sepolia, v2 }, wallet: true });
  const session: HcaSession = {
    chainId: 11155111,
    hca: hcaAddress,
    owner,
    sessionKey: other,
    terms: {
      sessionNonce: 0n,
      validUntil: 4_000_000_000,
      resolver: other,
      refundToken: other,
      maxRefundExchangeRate: 1n,
      maxRefundGasOverhead: 1n,
      maxRefundAmount: 1n,
    },
    permissionId: zeroHash,
    sessionDigest: zeroHash,
    chains: [],
    ownerSignature: "0x",
    signingDomain: "smart-session",
  };

  it.effect.each<FailingAction>([
    ["hca.predictAddress", Actions.hca.predictAddress(client, {})],
    ["hca.get", Actions.hca.get(client, {})],
    ["hca.getDeposit", Actions.hca.getDeposit(client, {})],
    ["hca.getUpgrade", Actions.hca.getUpgrade(client, { implementation: other })],
    ["hca.verify", Actions.hca.verify(client, {})],
    ["hca.getSession", Actions.hca.getSession(client, { session })],
    ["hca.checkSessionCalls", Actions.hca.checkSessionCalls(client, { session, calls: [] })],
    [
      "hca.authorizeSession",
      Actions.hca.authorizeSession(client, { sessionKey: other, resolver: other, validUntil: 1 }),
    ],
    ["hca.deploy", Actions.hca.deploy.prepare(client, {})],
    ["hca.execute", Actions.hca.execute.prepare(client, { calls: [{ to: other }] })],
    ["hca.addDeposit", Actions.hca.addDeposit.prepare(client, { amount: 1n })],
    ["hca.withdrawDeposit", Actions.hca.withdrawDeposit.prepare(client, { to: other, amount: 1n })],
    ["hca.revokeSessions", Actions.hca.revokeSessions.prepare(client, {})],
    ["hca.upgrade", Actions.hca.upgrade.prepare(client, { implementation: other })],
    ["hcaAdmin.getGovernance", Actions.hcaAdmin.getGovernance(client, {})],
    [
      "hcaAdmin.grantUpgradeSetRoles",
      Actions.hcaAdmin.grantUpgradeSetRoles.prepare(client, { grantee: other, roles: 1n }),
    ],
    [
      "hcaAdmin.revokeUpgradeSetRoles",
      Actions.hcaAdmin.revokeUpgradeSetRoles.prepare(client, { grantee: other, roles: 1n }),
    ],
    ["hcaAdmin.renounceGovernance", Actions.hcaAdmin.renounceGovernance.prepare(client, {})],
    [
      "hcaAdmin.setDeploymentApproval",
      Actions.hcaAdmin.setDeploymentApproval.prepare(client, {
        implementation: other,
        approved: true,
      }),
    ],
    [
      "hcaAdmin.setUpgradeApproval",
      Actions.hcaAdmin.setUpgradeApproval.prepare(client, {
        implementation: other,
        approved: true,
      }),
    ],
    [
      "hcaAdmin.transferGovernance",
      Actions.hcaAdmin.transferGovernance.prepare(client, { newOwner: other }),
    ],
  ])("%s fails on a chain without an HCA deployment", ([, action]) =>
    expectFailure(action, { _tag: "HcaError", code: "HCA_UNAVAILABLE" }),
  );
});

describe("hca input validation", () => {
  const bad = "0x1234";
  const { client } = makeClient();

  it.effect.each<FailingAction>([
    ["predictAddress.owner", Actions.hca.predictAddress(client, { owner: bad })],
    ["get.address", Actions.hca.get(client, { address: bad })],
    ["get.owner", Actions.hca.get(client, { owner: bad })],
    ["getDeposit.address", Actions.hca.getDeposit(client, { address: bad })],
    ["getDeposit.owner", Actions.hca.getDeposit(client, { owner: bad })],
    ["verify.address", Actions.hca.verify(client, { address: bad })],
    ["verify.owner", Actions.hca.verify(client, { owner: bad })],
    ["addDeposit.address", Actions.hca.addDeposit.prepare(client, { address: bad, amount: 1n })],
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

describe("hca verification", () => {
  // The signer's HCA is deployed but answers for another owner and account kind.
  const { client } = makeClient({
    deployed: true,
    stubs: [
      {
        address: hcaAddress,
        abi: standaloneSingleOwnerHcaV2Abi,
        functions: {
          ownerAndSessionNonce: () => [other, 0n],
          accountId: () => "something-else",
          getImplementation: () => contracts.standaloneImplementation,
        },
      },
    ],
  });

  it.effect.each<FailingAction>([
    ["hca.verify", Actions.hca.verify(client, {})],
    ["hca.execute", Actions.hca.execute.prepare(client, { calls: [{ to: other }] })],
  ])("%s refuses an HCA that fails verification", ([, action]) =>
    Effect.gen(function* () {
      const error = yield* expectFailure(action, { _tag: "HcaError", code: "HCA_NOT_VERIFIED" });

      assert.deepStrictEqual(error.details, ["owner-mismatch", "unknown-account", "not-certified"]);
    }),
  );
});

describe("hca write preconditions", () => {
  // A session signed for an undeployed HCA becomes usable once anyone deploys it.
  it.effect.each([
    ["a deployed HCA", true, ["revokeSessions"], []],
    [
      "an undeployed HCA, deploying it first",
      false,
      ["deploy", "revokeSessions"],
      ["HCA_DEPLOYED"],
    ],
  ] as const)(
    "revokeSessions revokes on %s, from the owner itself",
    ([, deployed, calls, warnings]) =>
      Effect.gen(function* () {
        const { client } = makeClient({ deployed });

        const plan = yield* Actions.hca.revokeSessions.prepare(client, {});

        assert.deepStrictEqual(
          Arr.map(plan.calls, (call) => [
            call.to,
            decodeFunctionData({
              abi: [...standaloneSingleOwnerHcaV2Abi, ...standaloneHcaFactoryV2Abi],
              data: call.data,
            }).functionName,
          ]),
          Arr.map(calls, (functionName) => [
            functionName === "deploy" ? contracts.standaloneFactory : hcaAddress,
            functionName,
          ]),
        );
        assert.deepStrictEqual(plan.steps[0]?.from, "signer");
        assert.deepStrictEqual<readonly string[]>(
          Arr.map(plan.warnings, (warning) => warning.code),
          warnings,
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
      if (decoded.functionName !== "executeByOwner") return;
      const [[inner]] = decoded.args;
      assert.isDefined(inner);
      assert.strictEqual(inner.target, hcaAddress);
      assert.deepStrictEqual(
        decodeFunctionData({ abi: standaloneSingleOwnerHcaV2Abi, data: inner.callData }).args,
        [other, 5n],
      );
    }),
  );
});
