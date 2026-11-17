import { Effect } from "effect";
import { AtomRegistry } from "effect/reactivity";

import type { EnsAtomFactory } from "../atoms/query.js";
import type { Ensforge } from "../legacy/ensforge.js";
import type { EnsAtomOptions } from "../query/options.js";

export const prefetchEffect = <Parameters, Success, Failure>(
  registry: AtomRegistry.AtomRegistry,
  sdk: Ensforge,
  factory: EnsAtomFactory<Parameters, Success, Failure>,
  parameters: Parameters,
  options?: EnsAtomOptions<Failure>,
): Effect.Effect<Success, Failure> =>
  AtomRegistry.getResult(registry, factory(sdk, parameters, options), {
    suspendOnWaiting: true,
  });

export const prefetch = <Parameters, Success, Failure>(
  registry: AtomRegistry.AtomRegistry,
  sdk: Ensforge,
  factory: EnsAtomFactory<Parameters, Success, Failure>,
  parameters: Parameters,
  options?: EnsAtomOptions<Failure>,
  runOptions?: Effect.RunOptions,
): Promise<Success> =>
  Effect.runPromise(prefetchEffect(registry, sdk, factory, parameters, options), runOptions);
