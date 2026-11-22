import { Effect, Array as Arr } from "effect";

import { InvalidInputError } from "../../errors/classes/InvalidInputError.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import { parseName } from "../name/normalize.js";
import type { NameParts } from "../name/parts.js";

/** A `.eth` second-level name. */
export type EthName = NameParts;

/** Normalizes names that must be `.eth` second-level names; duplicates are dropped. */
export const parseEthNames = (
  names: string | readonly string[],
): Effect.Effect<readonly EthName[], AnyError> =>
  Effect.forEach(
    typeof names === "string" ? [names] : names,
    (name) =>
      parseName(name).pipe(
        Effect.filterOrFail(
          (parts) => parts.isEth2ld && !parts.encodedLabel,
          (parts) =>
            new InvalidInputError({
              code: "INVALID_NAME",
              input: name,
              shortMessage: `${parts.name} is not a .eth second-level name.`,
              hint: "Register subnames with subname actions; only names like `alice.eth` are sold.",
            }),
        ),
      ),
    { concurrency: 1 },
  ).pipe(
    Effect.flatMap((parsed) =>
      parsed.length === 0
        ? Effect.fail(new InvalidInputError({ code: "INVALID_NAME", field: "names", input: "[]" }))
        : Effect.succeed([...new Map(Arr.map(parsed, (parts) => [parts.name, parts])).values()]),
    ),
  );

/** One `.eth` second-level name. */
export const parseEthName = (name: string): Effect.Effect<EthName, AnyError> =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the collection is known to be non-empty or the index in range here; `noUncheckedIndexedAccess` cannot see it
  parseEthNames(name).pipe(Effect.map((names) => names[0] as EthName));

/**
 * A `NAME_NORMALIZED` warning naming inputs that normalization changed: the plan registers or
 * renews the normalized name, which a user who typed another form should see.
 */
export const normalizedWarnings = (
  input: string | readonly string[],
  names: readonly EthName[],
): readonly Plan.Warning[] => {
  const changed = Arr.filter(
    typeof input === "string" ? [input] : input,
    (raw) => !Arr.some(names, (name) => name.name === raw),
  );
  if (changed.length === 0) return [];
  return [
    {
      code: "NAME_NORMALIZED",
      message: `${Arr.join(changed, ", ")} changed when normalized; the plan uses ${Arr.join(
        Arr.map(names, (name) => name.name),
        ", ",
      )}.`,
    },
  ];
};
