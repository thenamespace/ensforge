import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import type { Errors, Plan, Write } from "@ensforge/sdk";
import { requireAddress } from "@ensforge/sdk/extension";
import { Action, type Client } from "@ensforge/sdk/extension";
import { encodeFunctionData } from "viem";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import { requireHca } from "../../../internal/deployment.js";
import { onePlan, signerOf } from "../../../internal/input.js";
import type { grantUpgradeSetRoles as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.hcaAdmin.grantUpgradeSetRoles`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, Errors.AnyError | HcaError> {
  const deployment = yield* requireHca(client);
  const signer = yield* signerOf(client, options.account);
  const grantee = yield* requireAddress(options.grantee, "grantee");
  return onePlan(client, {
    operation: "hcaAdmin.grantUpgradeSetRoles",
    account: signer,
    description: "Grant HCA upgrade-set roles",
    calls: [
      {
        to: deployment.contracts.upgradeSet,
        data: encodeFunctionData({
          abi: Abis.v2.permissionedAddressSet,
          functionName: "grantRootRoles",
          args: [options.roles, grantee],
        }),
        value: 0n,
      },
    ],
  });
});

const write = Action.write("hcaAdmin.grantUpgradeSetRoles", plan);

/** @internal Implementation of `Actions.hcaAdmin.grantUpgradeSetRoles`. */
export const grantUpgradeSetRoles = write.send;

/** @internal Implementation of `Actions.hcaAdmin.grantUpgradeSetRolesSync`. */
export const grantUpgradeSetRolesSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.hcaAdmin.grantUpgradeSetRoles`. */
export const grantUpgradeSetRolesMethods = write.methods;
