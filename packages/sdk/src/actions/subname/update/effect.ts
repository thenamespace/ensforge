import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData, hexToBigInt, zeroAddress, type Address } from "viem";

import type { Client } from "../../../client/types.js";
import { ConfigError } from "../../../errors/classes/ConfigError.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import { NameStateError } from "../../../errors/classes/NameStateError.js";
import { UnsupportedError } from "../../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { addressOf } from "../../../internal/address.js";
import { notRegistered, requireAddress, singleStepPlan } from "../../../internal/name/write.js";
import { explainUpdate } from "../../../internal/permission/subname.js";
import { loadSubname, type LoadedSubname } from "../../../internal/subname/load.js";
import { updateRoute } from "../../../internal/subname/v1-route.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { update as Promises } from "./index.js";

/** ENSv2: resolver and expiry on the subregistry; ownership moves with `name.transfer`. */
const v2Calls = (
  { child }: LoadedSubname,
  changes: { readonly resolver: Address | undefined; readonly expiry: bigint | undefined },
): Plan.Call[] => {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a v2 or wrapped name's state always carries this field; `Name.State` types it as nullable for every protocol
  const registry = child.state.registry as Address;
  const labelId = hexToBigInt(child.data.parts.labelhash);
  return [
    ...(changes.resolver === undefined
      ? []
      : [
          {
            to: registry,
            data: encodeFunctionData({
              abi: Abis.v2.permissionedRegistry,
              functionName: "setResolver",
              args: [labelId, changes.resolver],
            }),
            value: 0n,
          },
        ]),
    ...(changes.expiry === undefined
      ? []
      : [
          {
            to: registry,
            data: encodeFunctionData({
              abi: Abis.v2.permissionedRegistry,
              functionName: "renew",
              args: [labelId, changes.expiry],
            }),
            value: 0n,
          },
        ]),
  ];
};

/** @internal Builds the plan of `Actions.subname.update`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  if (
    options.owner === undefined &&
    options.resolver === undefined &&
    options.expiry === undefined
  ) {
    return yield* Effect.fail(
      new InvalidInputError({
        code: "INVALID_RECORD_VALUE",
        field: "changes",
        input: options.name,
        shortMessage: "Nothing to update: pass `owner`, `resolver` or `expiry`.",
      }),
    );
  }

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
    const { updateCall } = yield* Effect.promise(
      () => import("../../../internal/namespace/l2/index.js"),
    );
    return singleStepPlan(subname.target.client, {
      operation: "subname.update",
      account: options.account,
      description: "Update subname",
      calls: [yield* updateCall(subname, options)],
    });
  }
  if (subname.child.state.status === "available") {
    return yield* notRegistered(
      client,
      subname.child,
      `${subname.child.data.parts.name} does not exist.`,
    );
  }
  // An emancipated child loses its owner when it expires: the NameWrapper no longer holds it, and
  // only recreating it from the parent brings it back.
  const { state } = subname.child;
  if (state.wrapped && state.status === "expired" && state.owner === null) {
    return yield* Effect.fail(
      new NameStateError({
        code: "NAME_EXPIRED",
        shortMessage: `${subname.child.data.parts.name} has expired and has no owner.`,
        hint: "Recreate it with subname.create.",
      }),
    );
  }
  const owner =
    options.owner === undefined ? undefined : yield* requireAddress(options.owner, "owner");
  const resolver =
    options.resolver === undefined
      ? undefined
      : options.resolver === null
        ? zeroAddress
        : yield* requireAddress(options.resolver, "resolver");

  let route: { readonly calls: readonly Plan.Call[]; readonly warnings: readonly Plan.Warning[] };
  if (subname.child.state.protocol === "v2") {
    if (owner !== undefined) {
      return yield* Effect.fail(
        new UnsupportedError({
          code: "UNSUPPORTED_PROTOCOL",
          protocol: "v2",
          feature: "changing an ENSv2 subname's owner from its parent",
          hint: "The owner transfers it with name.transfer; the parent can remove and recreate it.",
        }),
      );
    }
    route = { calls: v2Calls(subname, { resolver, expiry: options.expiry }), warnings: [] };
  } else {
    route = yield* updateRoute(client, subname, signer, {
      owner,
      resolver,
      expiry: options.expiry,
    });
  }

  return singleStepPlan(client, {
    operation: "subname.update",
    account: options.account,
    description: "Update subname",
    ...route,
  });
});

const write = Action.write("subname.update", plan, { contractKind: "registry" }, explainUpdate);

/** @internal Implementation of `Actions.subname.update`. */
export const update = write.send;

/** @internal Implementation of `Actions.subname.updateSync`. */
export const updateSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.subname.update`. */
export const updateMethods = write.methods;
