import { Data, Effect } from "effect";
import { Atom, type AsyncResult } from "effect/reactivity";

import type {
  ActionParameters,
  ActionSuccess,
  ActionFailure,
  BoundEffectAction,
} from "../internal/action-types.js";
import { atomRuntime } from "../internal/runtime.js";
import type { Ensforge } from "../legacy/ensforge.js";
import { makeReactivityKeys } from "../query/keys.js";
import {
  resolveEnsAtomOptions,
  type EnsAtomOptions,
  type ResolvedEnsAtomOptions,
} from "../query/options.js";

// Include the SDK instance in the family key to keep caches separate across clients.
class QueryAtomInput<Parameters, Failure> extends Data.Class<{
  readonly options: ResolvedEnsAtomOptions<Failure>;
  readonly parameters: Parameters;
  readonly sdk: Ensforge;
}> {}

export type EnsAtom<Success, Failure> = Atom.Atom<AsyncResult.AsyncResult<Success, Failure>>;

export interface EnsAtomFactory<Parameters, Success, Failure> {
  (
    sdk: Ensforge,
    parameters: Parameters,
    options?: EnsAtomOptions<Failure>,
  ): EnsAtom<Success, Failure>;
}

export const configureAtom = <Success, Failure>(
  source: EnsAtom<Success, Failure>,
  options: ResolvedEnsAtomOptions<Failure>,
  reactivityKeys: Readonly<Record<string, ReadonlyArray<unknown>>>,
): EnsAtom<Success, Failure> => {
  let atom = source.pipe(Atom.withReactivity(reactivityKeys), Atom.setIdleTTL(options.idleTTL));

  if (options.swr !== false) {
    atom = atom.pipe(
      Atom.swr({
        ...options.swr,
        focusSignal: Atom.windowFocusSignal,
      }),
    );
  }

  if (options.refreshInterval !== false) {
    atom = atom.pipe(Atom.withRefresh(options.refreshInterval));
  }

  return atom;
};

export function makeQueryAtom<Action extends BoundEffectAction<never, unknown, unknown>>(
  group: string,
  getAction: (sdk: Ensforge) => Action,
): EnsAtomFactory<ActionParameters<Action>, ActionSuccess<Action>, ActionFailure<Action>>;
export function makeQueryAtom<Parameters, Success, Failure>(
  group: string,
  getAction: (sdk: Ensforge) => BoundEffectAction<Parameters, Success, Failure>,
): EnsAtomFactory<Parameters, Success, Failure>;
export function makeQueryAtom<Parameters, Success, Failure>(
  group: string,
  getAction: (sdk: Ensforge) => BoundEffectAction<Parameters, Success, Failure>,
): EnsAtomFactory<Parameters, Success, Failure> {
  const family = Atom.family((input: QueryAtomInput<Parameters, Failure>) => {
    const actionEffect = Effect.suspend(() => getAction(input.sdk).effect(input.parameters));

    const effect =
      input.options.retry === false
        ? actionEffect
        : actionEffect.pipe(Effect.retry(input.options.retry));

    return configureAtom(
      atomRuntime.atom(effect),
      input.options,
      makeReactivityKeys(input.sdk, group, input.parameters),
    );
  });

  return (sdk, parameters, options) =>
    family(
      new QueryAtomInput({
        options: resolveEnsAtomOptions(undefined, options),
        parameters,
        sdk,
      }),
    );
}
