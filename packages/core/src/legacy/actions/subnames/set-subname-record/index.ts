import { Effect } from "effect";

import { isAddressEqual } from "viem";

import { defineAction } from "../../../action/action.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import type { CallExecutionResult } from "../../../write/types.js";
import { getNameState } from "../../name/get-name-state/index.js";
import { decodeOwnershipAddress } from "../../ownership/address.js";
import { setResolverAndRecords } from "../../resolution/set-resolver-and-records/index.js";
import { createSubname } from "../create-subname/index.js";
import { setSubnameExpiry, setSubnameManager, setSubnameResolver } from "../mutation.js";
import { resolveSubnameRoute } from "../route.js";
import type { SetSubnameRecordParameters, SetSubnameRecordResult, SubnameError } from "../types.js";

const setSubnameRecordEffect = Effect.fn("ensforge.setSubnameRecord")(function* (
  config: EnsforgeConfig,
  parameters: SetSubnameRecordParameters,
): Effect.fn.Return<SetSubnameRecordResult, SubnameError> {
  const route = yield* resolveSubnameRoute(config, parameters.name);
  const owner = yield* decodeOwnershipAddress(parameters.owner, "subname owner");

  const resolver =
    parameters.resolver === undefined
      ? null
      : yield* decodeOwnershipAddress(parameters.resolver, "subname resolver");

  const initial = yield* getNameState.effect(config, { name: route.name });
  const created = initial.available;

  const create = created
    ? yield* createSubname.effect(config, {
        name: route.name,
        owner: parameters.owner,
        ...(parameters.resolver === undefined ? {} : { resolver: parameters.resolver }),
        ...(parameters.ttl === undefined ? {} : { ttl: parameters.ttl }),
        ...(parameters.expiry === undefined ? {} : { expiry: parameters.expiry }),
        ...(parameters.fuses === undefined ? {} : { fuses: parameters.fuses }),
        ...(parameters.roles === undefined ? {} : { roles: parameters.roles }),
        ...(parameters.salt === undefined ? {} : { salt: parameters.salt }),
        ...(parameters.walletClient === undefined ? {} : { walletClient: parameters.walletClient }),
        ...(parameters.account === undefined ? {} : { account: parameters.account }),
        ...(parameters.mode === undefined ? {} : { mode: parameters.mode }),
        ...(parameters.confirmation === undefined ? {} : { confirmation: parameters.confirmation }),
        ...(parameters.resume === undefined ? {} : { resume: parameters.resume }),
      })
    : null;

  const mutations: Array<CallExecutionResult> = [];

  if (!created && parameters.expiry !== undefined && parameters.expiry !== initial.expiry) {
    mutations.push(
      yield* setSubnameExpiry.effect(config, { name: route.name, expiry: parameters.expiry }),
    );
  }

  const records = parameters.records ?? [];

  const resolverWrite =
    records.length > 0
      ? yield* setResolverAndRecords.effect(config, {
          name: route.name,
          records,
          ...(parameters.resolver === undefined ? {} : { resolver: parameters.resolver }),
          ...(parameters.walletClient === undefined
            ? {}
            : { walletClient: parameters.walletClient }),
          ...(parameters.account === undefined ? {} : { account: parameters.account }),
          ...(parameters.confirmation === undefined
            ? {}
            : { confirmation: parameters.confirmation }),
        })
      : null;

  if (
    !created &&
    records.length === 0 &&
    parameters.resolver !== undefined &&
    (initial.resolver === null || resolver === null || !isAddressEqual(initial.resolver, resolver))
  ) {
    mutations.push(
      yield* setSubnameResolver.effect(config, {
        name: route.name,
        resolver: parameters.resolver,
      }),
    );
  }

  if (!created && (initial.manager === null || !isAddressEqual(initial.manager, owner))) {
    mutations.push(
      yield* setSubnameManager.effect(config, { name: route.name, manager: parameters.owner }),
    );
  }

  const finalState = yield* getNameState.effect(config, { name: route.name });

  return {
    name: route.name,
    protocol: route.protocol,
    created,
    registry: finalState.registry,
    resolver: finalState.resolver,
    resolverWrite,
    create,
    mutations,
    finalState,
  };
});

export const setSubnameRecord = defineAction<
  SetSubnameRecordParameters,
  SetSubnameRecordResult,
  SubnameError
>(setSubnameRecordEffect);

export type {
  SetSubnameRecordParameters,
  SetSubnameRecordResult,
  SubnameError as SetSubnameRecordError,
} from "../types.js";
