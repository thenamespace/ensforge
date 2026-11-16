import { Effect, Stream } from "effect";

import type { EnsforgeConfig } from "../../../config/config.js";
import { HcaError } from "../../../errors/hca-error.js";
import { hcaExecutionStream, resolveHcaWaitOptions } from "../../../internal/hca/tracking.js";
import type { WriteError } from "../../../write/types.js";
import type { HcaExecutionStatus, WaitForHcaExecutionParameters } from "../types.js";

export interface WatchHcaExecution {
  (
    config: EnsforgeConfig,
    parameters: WaitForHcaExecutionParameters,
    onStatus: (status: HcaExecutionStatus) => void,
    onError: (error: WriteError) => void,
    options?: Effect.RunOptions,
  ): Promise<() => void>;

  readonly stream: typeof hcaExecutionStream;
}

const watch: WatchHcaExecution = Object.assign(
  async (
    config: EnsforgeConfig,
    parameters: WaitForHcaExecutionParameters,
    onStatus: (status: HcaExecutionStatus) => void,
    onError: (error: WriteError) => void,
    options?: Effect.RunOptions,
  ) => {
    resolveHcaWaitOptions(config, parameters);

    const controller = new AbortController();

    const abort = () => controller.abort();

    options?.signal?.addEventListener("abort", abort, { once: true });

    if (options?.signal?.aborted) abort();

    const run = Stream.runForEach(hcaExecutionStream(config, parameters), (status) =>
      Effect.sync(() => onStatus(status)),
    ).pipe(Effect.catch((error) => Effect.sync(() => onError(error))));

    void Effect.runPromise(run, { ...options, signal: controller.signal })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          onError(
            new HcaError({ code: "ADAPTER_FAILED", message: "Execution watcher failed", cause }),
          );
      })
      .finally(() => options?.signal?.removeEventListener("abort", abort));

    return abort;
  },
  { stream: hcaExecutionStream },
);

export const watchHcaExecution = Object.freeze(watch);
