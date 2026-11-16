import { Cause, Effect, Queue, Stream } from "effect";

import type { EnsforgeConfig } from "../../../config/config.js";
import type { NameError } from "../../../errors/name-error.js";
import { viemErrorToEffectError } from "../../../internal/errors/viem-error.js";
import { getEnsEventContracts } from "../../../internal/events/contracts.js";
import {
  matchesEnsEventFilters,
  normalizeEnsLog,
} from "../../../internal/events/normalize-event.js";
import { normalizeName } from "../../../names/normalize.js";
import type { NormalizedName } from "../../../schemas/name.js";
import type { EnsEvent, EnsEventError, WatchEnsEventsParameters } from "../types.js";

export interface WatchEnsEvents {
  (
    config: EnsforgeConfig,
    parameters: WatchEnsEventsParameters,
    onEvent: (event: EnsEvent) => void,
    onError: (error: EnsEventError) => void,
  ): Promise<() => void>;

  readonly stream: (
    config: EnsforgeConfig,
    parameters: WatchEnsEventsParameters,
  ) => Stream.Stream<EnsEvent, EnsEventError>;
}

const stream = (
  config: EnsforgeConfig,
  parameters: WatchEnsEventsParameters,
): Stream.Stream<EnsEvent, EnsEventError> => {
  const normalizedNameEffect: Effect.Effect<NormalizedName | undefined, NameError> =
    parameters.name === undefined
      ? Effect.succeed<NormalizedName | undefined>(undefined)
      : normalizeName
          .effect(parameters.name)
          .pipe(Effect.map((name): NormalizedName | undefined => name));

  return Stream.unwrap(
    normalizedNameEffect.pipe(
      Effect.map((normalizedName) => {
        const contracts = getEnsEventContracts(config.deployments);

        return Stream.callback<EnsEvent, EnsEventError>(
          Effect.fn("ensforge.watchEnsEvents.stream")(function* (queue) {
            yield* Effect.acquireRelease(
              Effect.sync(() =>
                config.publicClient.watchEvent({
                  address: contracts.map((contract) => contract.address),
                  ...(parameters.fromBlock === undefined
                    ? {}
                    : { fromBlock: parameters.fromBlock }),
                  ...(parameters.pollingInterval === undefined
                    ? {}
                    : { pollingInterval: parameters.pollingInterval }),
                  onLogs: (logs) => {
                    for (const log of logs) {
                      const event = normalizeEnsLog(log, contracts);

                      if (
                        event !== null &&
                        matchesEnsEventFilters(
                          event,
                          { ...parameters, fromBlock: parameters.fromBlock ?? 0n },
                          normalizedName,
                        )
                      ) {
                        Queue.offerUnsafe(queue, event);
                      }
                    }
                  },
                  onError: (cause) =>
                    Queue.failCauseUnsafe(
                      queue,
                      Cause.fail(viemErrorToEffectError(cause, "watchEvent")),
                    ),
                }),
              ),
              (unwatch) => Effect.sync(unwatch),
            );
          }),
        );
      }),
    ),
  );
};

const watch = async (
  config: EnsforgeConfig,
  parameters: WatchEnsEventsParameters,
  onEvent: (event: EnsEvent) => void,
  onError: (error: EnsEventError) => void,
): Promise<() => void> => {
  const normalizedName =
    parameters.name === undefined
      ? undefined
      : await Effect.runPromise(normalizeName.effect(parameters.name));

  const contracts = getEnsEventContracts(config.deployments);

  return config.publicClient.watchEvent({
    address: contracts.map((contract) => contract.address),
    ...(parameters.fromBlock === undefined ? {} : { fromBlock: parameters.fromBlock }),
    ...(parameters.pollingInterval === undefined
      ? {}
      : { pollingInterval: parameters.pollingInterval }),
    onLogs: (logs) => {
      for (const log of logs) {
        const event = normalizeEnsLog(log, contracts);

        if (
          event !== null &&
          matchesEnsEventFilters(
            event,
            { ...parameters, fromBlock: parameters.fromBlock ?? 0n },
            normalizedName,
          )
        ) {
          onEvent(event);
        }
      }
    },
    onError: (cause) => onError(viemErrorToEffectError(cause, "watchEvent")),
  });
};

export const watchEnsEvents = Object.freeze(
  Object.defineProperty(watch, "stream", {
    value: stream,
    enumerable: true,
    configurable: false,
    writable: false,
  }),
) as WatchEnsEvents;

export type {
  EnsEvent,
  EnsEventError as WatchEnsEventsError,
  WatchEnsEventsParameters,
} from "../types.js";
