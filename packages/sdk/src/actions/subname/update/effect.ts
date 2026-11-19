import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData, hexToBigInt, zeroAddress, type Address } from "viem";

import type { Client } from "../../../client/types.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import { NameStateError } from "../../../errors/classes/NameStateError.js";
import { UnsupportedError } from "../../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import {
  notRegistered,
  requireAddress,
  requireV1Contracts,
  singleStepPlan,
} from "../../../internal/name/write.js";
import { explainUpdate } from "../../../internal/permission/subname.js";
import { loadSubname, type LoadedSubname } from "../../../internal/subname/load.js";
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

/**
 * ENSv1: owner and resolver are rewritten from the parent with `setSubnodeRecord`, keeping what
 * is not changed; a wrapped child's expiry is extended with `extendExpiry`. An unwrapped parent
 * rewrites the child in the registry, which unwraps a wrapped child.
 */
const v1Calls = Effect.fnUntraced(function* (
  client: Client,
  { parent, child, label, route }: LoadedSubname,
  changes: {
    readonly owner: Address | undefined;
    readonly resolver: Address | undefined;
    readonly expiry: bigint | undefined;
  },
): Effect.fn.Return<Plan.Call[], AnyError> {
  const contracts = yield* requireV1Contracts(client);
  const { state, data } = child;
  const owner = changes.owner ?? state.owner ?? zeroAddress;
  const resolver = changes.resolver ?? state.resolver ?? zeroAddress;
  const record = changes.owner !== undefined || changes.resolver !== undefined;

  if (!state.wrapped || (route === "v1" && record)) {
    if (changes.expiry !== undefined) {
      return yield* Effect.fail(
        new UnsupportedError({
          code: "UNSUPPORTED_PROTOCOL",
          protocol: "v1",
          feature: "expiry of unwrapped ENSv1 subnames",
        }),
      );
    }
    return [
      {
        to: contracts.registry,
        data: encodeFunctionData({
          abi: Abis.v1.ensRegistry,
          functionName: "setSubnodeRecord",
          args: [parent.data.parts.node, data.parts.labelhash, owner, resolver, state.ttl ?? 0n],
        }),
        value: 0n,
      },
    ];
  }

  return [
    ...(record
      ? [
          {
            to: contracts.nameWrapper,
            data: encodeFunctionData({
              abi: Abis.v1.nameWrapper,
              functionName: "setSubnodeRecord",
              args: [
                parent.data.parts.node,
                label,
                owner,
                resolver,
                state.ttl ?? 0n,
                0,
                changes.expiry ?? state.expiry ?? 0n,
              ],
            }),
            value: 0n,
          },
        ]
      : []),
    ...(changes.expiry !== undefined && !record
      ? [
          {
            to: contracts.nameWrapper,
            data: encodeFunctionData({
              abi: Abis.v1.nameWrapper,
              functionName: "extendExpiry",
              args: [parent.data.parts.node, data.parts.labelhash, changes.expiry],
            }),
            value: 0n,
          },
        ]
      : []),
  ];
});

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

  const subname = yield* loadSubname(client, options.name);
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

  let calls: Plan.Call[];
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
    calls = v2Calls(subname, { resolver, expiry: options.expiry });
  } else {
    calls = yield* v1Calls(client, subname, { owner, resolver, expiry: options.expiry });
  }

  return singleStepPlan(client, {
    operation: "subname.update",
    account: options.account,
    description: "Update subname",
    calls,
  });
});

const write = Action.write("subname.update", plan, { contractKind: "registry" }, explainUpdate);

/** @internal Implementation of `Actions.subname.update`. */
export const update = write.send;

/** @internal Implementation of `Actions.subname.updateSync`. */
export const updateSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.subname.update`. */
export const updateMethods = write.methods;
