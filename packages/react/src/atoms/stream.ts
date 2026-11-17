import { Data, Stream, type Cause } from "effect";
import { Atom } from "effect/reactivity";

import { atomRuntime } from "../internal/runtime.js";
import type { Ensforge } from "../legacy/ensforge.js";
import { makeReactivityKeys } from "../query/keys.js";
import { resolveEnsAtomOptions, type ResolvedEnsAtomOptions } from "../query/options.js";
import { configureAtom, type EnsAtom, type EnsAtomFactory } from "./query.js";

interface BoundStreamAction<Parameters, Success, Failure> {
  readonly stream: (parameters: Parameters) => Stream.Stream<Success, Failure>;
}

class StreamAtomInput<Parameters, Failure> extends Data.Class<{
  readonly options: ResolvedEnsAtomOptions<Failure>;
  readonly parameters: Parameters;
  readonly sdk: Ensforge;
}> {}

export const makeStreamAtom = <Parameters, Success, Failure>(
  group: string,
  getAction: (sdk: Ensforge) => BoundStreamAction<Parameters, Success, Failure>,
): EnsAtomFactory<Parameters, Success, Failure | Cause.NoSuchElementError> => {
  const family = Atom.family(
    (input: StreamAtomInput<Parameters, Failure | Cause.NoSuchElementError>) => {
      const actionStream = Stream.suspend(() => getAction(input.sdk).stream(input.parameters));

      const stream =
        input.options.retry === false
          ? actionStream
          : actionStream.pipe(Stream.retry(input.options.retry));

      return configureAtom(
        atomRuntime.atom(stream),
        input.options,
        makeReactivityKeys(input.sdk, group, input.parameters),
      );
    },
  );

  return (sdk, parameters, options): EnsAtom<Success, Failure | Cause.NoSuchElementError> =>
    family(
      new StreamAtomInput({
        options: resolveEnsAtomOptions(undefined, options),
        parameters,
        sdk,
      }),
    );
};
