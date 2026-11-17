import { Effect, Option } from "effect";

import type { EnsforgeConfig } from "../../config/config.js";
import type { RpcError } from "../../errors/rpc-error.js";
import { provideConfig } from "../config/context.js";
import type { EnsforgeServices } from "../services/context.js";
import {
  ReadContext,
  ReadExecution,
  type ReadExecutionContext,
  type ReadExecutionOptions,
} from "./execution-context.js";

export const makeReadContext = Effect.fn("makeReadContext")(function* (
  config: EnsforgeConfig,
  options: ReadExecutionOptions,
): Effect.fn.Return<ReadExecutionContext, RpcError> {
  return yield* provideConfig(
    config,
    Effect.gen(function* () {
      const execution = yield* ReadExecution;

      return yield* execution.makeContext(options);
    }),
  );
});

export const executeRead = Effect.fn("executeRead")(function* <Success, Failure>(
  config: EnsforgeConfig,
  options: ReadExecutionOptions,
  effect: Effect.Effect<Success, Failure, EnsforgeServices | ReadContext>,
): Effect.fn.Return<Success, Failure | RpcError> {
  const activeContext = yield* Effect.serviceOption(ReadContext);
  const configured = provideConfig(config, effect);

  // Nested reads must reuse the outer snapshot to avoid mixing block states.
  if (Option.isSome(activeContext)) {
    return yield* configured.pipe(Effect.provideService(ReadContext, activeContext.value));
  }

  const context = yield* makeReadContext(config, options);

  return yield* configured.pipe(Effect.provideService(ReadContext, context));
});
