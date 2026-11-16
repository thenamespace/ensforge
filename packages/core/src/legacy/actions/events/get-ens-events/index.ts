import { Effect } from "effect";

import { defineAction } from "../../../action/action.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { viemErrorToEffectError } from "../../../internal/errors/viem-error.js";
import { getEnsEventContracts } from "../../../internal/events/contracts.js";
import {
  matchesEnsEventFilters,
  normalizeEnsLog,
} from "../../../internal/events/normalize-event.js";
import { normalizeName } from "../../../names/normalize.js";
import type { EnsEvent, EnsEventError, GetEnsEventsParameters } from "../types.js";

const getEnsEventsEffect = Effect.fn("ensforge.getEnsEvents")(function* (
  config: EnsforgeConfig,
  parameters: GetEnsEventsParameters,
) {
  const normalizedName =
    parameters.name === undefined ? undefined : yield* normalizeName.effect(parameters.name);

  const contracts = getEnsEventContracts(config.deployments);

  const logs = yield* Effect.tryPromise({
    try: () =>
      config.publicClient.getLogs({
        address: contracts.map((contract) => contract.address),
        fromBlock: parameters.fromBlock,
        ...(parameters.toBlock === undefined ? {} : { toBlock: parameters.toBlock }),
      }),
    catch: (cause) => viemErrorToEffectError(cause, "getLogs"),
  });

  const events = logs
    .map((log) => normalizeEnsLog(log, contracts))
    .filter((event): event is EnsEvent => event !== null)
    .filter((event) => matchesEnsEventFilters(event, parameters, normalizedName));

  // Array#toSorted is outside the package's ES2022 type target.
  // oxlint-disable-next-line unicorn/no-array-sort
  return events.sort((left: EnsEvent, right: EnsEvent) => {
    const block = Number((left.blockNumber ?? 0n) - (right.blockNumber ?? 0n));

    if (block !== 0) return block;

    const transaction = (left.transactionIndex ?? 0) - (right.transactionIndex ?? 0);

    return transaction !== 0 ? transaction : (left.logIndex ?? 0) - (right.logIndex ?? 0);
  });
});

export const getEnsEvents = defineAction<
  GetEnsEventsParameters,
  ReadonlyArray<EnsEvent>,
  EnsEventError
>(getEnsEventsEffect);

export type {
  EnsEvent,
  EnsEventError as GetEnsEventsError,
  GetEnsEventsParameters,
} from "../types.js";
