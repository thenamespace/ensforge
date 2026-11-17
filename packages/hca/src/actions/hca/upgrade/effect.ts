import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { standaloneSingleOwnerHcaV2Abi } from "@ensforge/contracts/v2/experimental/hca";
import type { Errors, Plan, Write } from "@ensforge/sdk";
import { Rpc, requireAddress } from "@ensforge/sdk/extension";
import { Action, type Client } from "@ensforge/sdk/extension";
import { encodeFunctionData } from "viem";

import { HcaError } from "../../../errors/classes/HcaError.js";
import { readAccount } from "../../../internal/account.js";
import { onePlan, signerOf } from "../../../internal/input.js";
import type { upgrade as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.hca.upgrade`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, Errors.AnyError | HcaError> {
  const implementation = yield* requireAddress(options.implementation, "implementation");
  const owner = yield* signerOf(client, options.account);
  const account = yield* readAccount(client, { owner });
  const inUpgradeSet = yield* Rpc.readContract(client, {
    address: account.upgradeSet,
    abi: Abis.v2.permissionedAddressSet,
    functionName: "includes",
    args: [implementation],
  });
  const predecessorAllowed =
    account.implementation === null
      ? false
      : yield* Rpc.readContract(client, {
          address: implementation,
          abi: standaloneSingleOwnerHcaV2Abi,
          functionName: "canUpgradeFrom",
          args: [account.implementation],
        }).pipe(Effect.orElseSucceed(() => false));
  if (!account.deployed || !inUpgradeSet || !predecessorAllowed) {
    return yield* Effect.fail(new HcaError({ code: "HCA_UPGRADE_NOT_ALLOWED" }));
  }
  return onePlan(client, {
    operation: "hca.upgrade",
    account: owner,
    description: "Upgrade your HCA",
    calls: [
      {
        to: account.address,
        data: encodeFunctionData({
          abi: standaloneSingleOwnerHcaV2Abi,
          functionName: "upgradeToAndCall",
          args: [implementation, "0x"],
        }),
        value: 0n,
      },
    ],
  });
});

const write = Action.write("hca.upgrade", plan);

/** @internal Implementation of `Actions.hca.upgrade`. */
export const upgrade = write.send;

/** @internal Implementation of `Actions.hca.upgradeSync`. */
export const upgradeSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.hca.upgrade`. */
export const upgradeMethods = write.methods;
