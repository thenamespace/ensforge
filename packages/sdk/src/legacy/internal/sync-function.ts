import { Effect, Result } from "effect";

export interface SyncFunction<Arguments extends ReadonlyArray<unknown>, Success, Failure> {
  (...arguments_: Arguments): Success;

  readonly effect: (...arguments_: Arguments) => Effect.Effect<Success, Failure>;
}

export const defineSyncFunction = <Arguments extends ReadonlyArray<unknown>, Success, Failure>(
  implementation: (...arguments_: Arguments) => Effect.Effect<Success, Failure>,
): SyncFunction<Arguments, Success, Failure> => {
  const synchronous = (...arguments_: Arguments): Success => {
    const result = Effect.runSync(Effect.result(implementation(...arguments_)));

    if (Result.isFailure(result)) throw result.failure;

    return result.success;
  };

  return Object.freeze(
    Object.defineProperty(synchronous, "effect", {
      value: implementation,
      enumerable: true,
      configurable: false,
      writable: false,
    }),
  ) as SyncFunction<Arguments, Success, Failure>;
};
