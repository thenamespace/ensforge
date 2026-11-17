import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { standaloneSingleOwnerHcaV2Abi } from "@ensforge/contracts/v2/experimental/hca";
import { Rpc, requireAddress } from "@ensforge/core/extension";
import { Action, type Client } from "@ensforge/core/extension";

import { accountInput } from "../../../internal/input.js";
import type { getUpgrade as Promises } from "./index.js";

/** @internal Implementation of `Actions.hca.getUpgrade`. */
export const getUpgrade = Effect.fn("ensforge.hca.getUpgrade")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
  const implementation = yield* requireAddress(options.implementation, "implementation");
  const account = yield* accountInput(client, options);
  const current = account.implementation;
  const inUpgradeSet = yield* Rpc.readContract(client, {
    address: account.upgradeSet,
    abi: Abis.v2.permissionedAddressSet,
    functionName: "includes",
    args: [implementation],
  });
  const predecessorAllowed =
    current === null
      ? false
      : yield* Rpc.readContract(client, {
          address: implementation,
          abi: standaloneSingleOwnerHcaV2Abi,
          functionName: "canUpgradeFrom",
          args: [current],
        }).pipe(Effect.orElseSucceed(() => false));

  return { allowed: inUpgradeSet && predecessorAllowed, current, inUpgradeSet, predecessorAllowed };
}, Action.withContext("hca.getUpgrade"));
