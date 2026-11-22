import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData, hexToBigInt, type Address } from "viem";

import type { Client } from "../../../client/types.js";
import { ConfigError } from "../../../errors/classes/ConfigError.js";
import { NameStateError } from "../../../errors/classes/NameStateError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { addressOf } from "../../../internal/address.js";
import { notRegistered, singleStepPlan } from "../../../internal/name/write.js";
import { explainRemoval } from "../../../internal/permission/subname.js";
import { loadSubname, type LoadedSubname } from "../../../internal/subname/load.js";
import { removeRoute } from "../../../internal/subname/v1-route.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { remove as Promises } from "./index.js";

/** ENSv2 unregisters the child, which also clears its resolver and subregistry. */
const v2RemoveCall = ({ child }: LoadedSubname): Plan.Call => ({
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a v2 or wrapped name's state always carries this field; `Name.State` types it as nullable for every protocol
  to: child.state.registry as Address,
  data: encodeFunctionData({
    abi: Abis.v2.permissionedRegistry,
    functionName: "unregister",
    args: [hexToBigInt(child.data.parts.labelhash)],
  }),
  value: 0n,
});

/** @internal Builds the plan of `Actions.subname.remove`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  const signer = addressOf(options.account) ?? client.account;
  if (signer === undefined) {
    return yield* Effect.fail(new ConfigError({ code: "WALLET_NOT_CONFIGURED" }));
  }

  const subname = yield* loadSubname(client, options.name);
  if (subname.route === "l2") {
    if (subname.childState.status !== "registered") {
      return yield* Effect.fail(
        new NameStateError({
          code: "NAME_NOT_REGISTERED",
          shortMessage: `${subname.child.data.parts.name} does not exist.`,
          context: { chainId: subname.target.location.chainId },
        }),
      );
    }
    const { removeCall: l2RemoveCall } = yield* Effect.promise(
      () => import("../../../internal/namespace/l2/index.js"),
    );
    return singleStepPlan(subname.target.client, {
      operation: "subname.remove",
      account: options.account,
      description: "Remove subname",
      calls: [yield* l2RemoveCall(subname, signer)],
    });
  }
  if (subname.child.state.status === "available") {
    return yield* notRegistered(
      client,
      subname.child,
      `${subname.child.data.parts.name} does not exist.`,
    );
  }

  const route =
    subname.child.state.protocol === "v2"
      ? { calls: [v2RemoveCall(subname)], warnings: [] }
      : yield* removeRoute(client, subname, signer);
  return singleStepPlan(client, {
    operation: "subname.remove",
    account: options.account,
    description: "Remove subname",
    ...route,
  });
});

const write = Action.write("subname.remove", plan, { contractKind: "registry" }, explainRemoval);

/** @internal Implementation of `Actions.subname.remove`. */
export const remove = write.send;

/** @internal Implementation of `Actions.subname.removeSync`. */
export const removeSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.subname.remove`. */
export const removeMethods = write.methods;
