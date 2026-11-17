import { Effect } from "effect";
import { Reactivity, type Atom } from "effect/reactivity";

import type {
  ActionParameters,
  ActionSuccess,
  ActionFailure,
  BoundEffectAction,
} from "../internal/action-types.js";
import { atomRuntime } from "../internal/runtime.js";
import type { Ensforge } from "../legacy/ensforge.js";
import { makeReactivityKeys } from "../query/keys.js";

export type EnsMutationAtom<Parameters, Success, Failure> = Atom.AtomResultFn<
  Parameters,
  Success,
  Failure
>;

export interface EnsMutationAtomFactory<Parameters, Success, Failure> {
  (sdk: Ensforge): EnsMutationAtom<Parameters, Success, Failure>;
}

export function makeMutationAtom<Action extends BoundEffectAction<never, unknown, unknown>>(
  group: string,
  getAction: (sdk: Ensforge) => Action,
): EnsMutationAtomFactory<ActionParameters<Action>, ActionSuccess<Action>, ActionFailure<Action>>;
export function makeMutationAtom<Parameters, Success, Failure>(
  group: string,
  getAction: (sdk: Ensforge) => BoundEffectAction<Parameters, Success, Failure>,
): EnsMutationAtomFactory<Parameters, Success, Failure>;
export function makeMutationAtom<Parameters, Success, Failure>(
  group: string,
  getAction: (sdk: Ensforge) => BoundEffectAction<Parameters, Success, Failure>,
): EnsMutationAtomFactory<Parameters, Success, Failure> {
  return (sdk) =>
    atomRuntime.fn(
      (parameters: Parameters) =>
        Effect.suspend(() => getAction(sdk).effect(parameters)).pipe(
          Reactivity.mutation(makeReactivityKeys(sdk, group, parameters)),
        ),
      { concurrent: false },
    );
}
