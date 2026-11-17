import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import type { Errors, Plan, Write } from "@ensforge/sdk";
import { Action, type Client, requireAddress } from "@ensforge/sdk/extension";
import { encodeFunctionData } from "viem";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import { requireHca } from "../../../internal/deployment.js";
import { onePlan, signerOf } from "../../../internal/input.js";
import type { revokeUpgradeSetRoles as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.hcaAdmin.revokeUpgradeSetRoles`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, Errors.AnyError | HcaError> {
  const deployment = yield* requireHca(client);
  const signer = yield* signerOf(client, options.account);
  const grantee = yield* requireAddress(options.grantee, "grantee");

  return onePlan(client, {
    operation: "hcaAdmin.revokeUpgradeSetRoles",
    account: signer,
    description: "Revoke HCA upgrade-set roles",
    calls: [
      {
        to: deployment.contracts.upgradeSet,
        data: encodeFunctionData({
          abi: Abis.v2.permissionedAddressSet,
          functionName: "revokeRootRoles",
          args: [options.roles, grantee],
        }),
        value: 0n,
      },
    ],
  });
});

const write = Action.write("hcaAdmin.revokeUpgradeSetRoles", plan);

/** @internal Implementation of `Actions.hcaAdmin.revokeUpgradeSetRoles`. */
export const revokeUpgradeSetRoles = write.send;

/** @internal Implementation of `Actions.hcaAdmin.revokeUpgradeSetRolesSync`. */
export const revokeUpgradeSetRolesSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.hcaAdmin.revokeUpgradeSetRoles`. */
export const revokeUpgradeSetRolesMethods = write.methods;
