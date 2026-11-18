import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData, hexToBigInt, zeroAddress, type Address } from "viem";

import type { Client } from "../../../client/types.js";
import { ConfigError } from "../../../errors/classes/ConfigError.js";
import { NameStateError } from "../../../errors/classes/NameStateError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { addressOf, sameAddress } from "../../../internal/address.js";
import { requireV1Contracts, singleStepPlan } from "../../../internal/name/write.js";
import { explainFor } from "../../../internal/permission/check.js";
import { loadSubname, type LoadedSubname } from "../../../internal/subname/load.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { remove as Promises } from "./index.js";

/**
 * The call that removes the child. ENSv2 unregisters it, which also clears its resolver and
 * subregistry. ENSv1 sets owner and resolver to zero, from the parent when the signer controls
 * the parent, otherwise as the child's owner. An unwrapped parent clears the child in the
 * registry, which unwraps a wrapped child.
 */
const removeCall = Effect.fnUntraced(function* (
  client: Client,
  { parent, child, label, route }: LoadedSubname,
  signer: Address,
): Effect.fn.Return<Plan.Call, AnyError> {
  const { node, labelhash } = child.data.parts;
  if (child.state.protocol === "v2") {
    return {
      to: child.state.registry as Address,
      data: encodeFunctionData({
        abi: Abis.v2.permissionedRegistry,
        functionName: "unregister",
        args: [hexToBigInt(labelhash)],
      }),
      value: 0n,
    };
  }

  const contracts = yield* requireV1Contracts(client);
  const fromParentRegistry = sameAddress(parent.data.v1?.registryOwner, signer);
  if (child.state.wrapped && !(route === "v1" && fromParentRegistry)) {
    return sameAddress(parent.state.owner, signer)
      ? {
          to: contracts.nameWrapper,
          data: encodeFunctionData({
            abi: Abis.v1.nameWrapper,
            functionName: "setSubnodeRecord",
            args: [parent.data.parts.node, label, zeroAddress, zeroAddress, 0n, 0, 0n],
          }),
          value: 0n,
        }
      : {
          to: contracts.nameWrapper,
          data: encodeFunctionData({
            abi: Abis.v1.nameWrapper,
            functionName: "setRecord",
            args: [node, zeroAddress, zeroAddress, 0n],
          }),
          value: 0n,
        };
  }
  return fromParentRegistry
    ? {
        to: contracts.registry,
        data: encodeFunctionData({
          abi: Abis.v1.ensRegistry,
          functionName: "setSubnodeRecord",
          args: [parent.data.parts.node, labelhash, zeroAddress, zeroAddress, 0n],
        }),
        value: 0n,
      }
    : {
        to: contracts.registry,
        data: encodeFunctionData({
          abi: Abis.v1.ensRegistry,
          functionName: "setRecord",
          args: [node, zeroAddress, zeroAddress, 0n],
        }),
        value: 0n,
      };
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
  if (subname.child.state.status === "available") {
    return yield* Effect.fail(
      new NameStateError({
        code: "NAME_NOT_REGISTERED",
        shortMessage: `${subname.child.data.parts.name} does not exist.`,
      }),
    );
  }

  return singleStepPlan(client, {
    operation: "subname.remove",
    account: options.account,
    description: "Remove subname",
    calls: [yield* removeCall(client, subname, signer)],
  });
});

const write = Action.write(
  "subname.remove",
  plan,
  { contractKind: "registry" },
  explainFor(
    (options: { readonly name: string }) => options.name.slice(options.name.indexOf(".") + 1),
    () => ["removeSubname" as const],
  ),
);

/** @internal Implementation of `Actions.subname.remove`. */
export const remove = write.send;

/** @internal Implementation of `Actions.subname.removeSync`. */
export const removeSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.subname.remove`. */
export const removeMethods = write.methods;
