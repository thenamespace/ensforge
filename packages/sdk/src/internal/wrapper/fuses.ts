import { Effect } from "effect";

import { nameWrapperFuses } from "@ensforge/contracts/v1";

import { InvalidInputError } from "../../errors/classes/InvalidInputError.js";
import type { AnyError } from "../../errors/types.js";
import * as Fuse from "../../utils/Fuse.js";
import { tryAny } from "../anyError.js";

/** Fuses the owner burns live in the low 16 bits; the parent sets the ones above. */
const ownerControlled = 0xffff;

const invalid = (input: unknown, shortMessage: string) =>
  new InvalidInputError({ code: "INVALID_RECORD_VALUE", field: "fuses", input, shortMessage });

/**
 * The mask of `names`, checked against the NameWrapper's burn rules given the fuses already
 * burned: every fuse except `cannotUnwrap` needs `cannotUnwrap`, and owner-controlled fuses
 * need `parentCannotControl`. `by` is who burns them: the owner (`setFuses`, wrapping) can only
 * burn owner-controlled fuses; the parent (`setChildFuses`) also `parentCannotControl` and
 * `canExtendExpiry`.
 */
export const fuseMask = Effect.fnUntraced(function* (
  names: readonly Fuse.Name[],
  burned: number,
  by: "owner" | "parent",
): Effect.fn.Return<number, AnyError> {
  const mask = yield* tryAny(() => Fuse.from(names));
  if (Fuse.has(mask, "isDotEth")) {
    return yield* Effect.fail(invalid(names, "`isDotEth` is set by the NameWrapper."));
  }
  if (by === "owner" && mask > ownerControlled) {
    return yield* Effect.fail(
      invalid(names, "Only the parent burns `parentCannotControl` and `canExtendExpiry`."),
    );
  }

  const after = mask | burned;
  const others = after & ownerControlled & ~Fuse.from(["cannotUnwrap"]);
  if (others !== 0 && !Fuse.has(after, "cannotUnwrap")) {
    return yield* Effect.fail(invalid(names, "Other fuses need `cannotUnwrap` burned too."));
  }
  if ((after & ownerControlled) !== 0 && !Fuse.has(after, "parentCannotControl")) {
    return yield* Effect.fail(
      invalid(names, "Owner-controlled fuses need `parentCannotControl`, burned by the parent."),
    );
  }
  return mask;
});

/**
 * Fails when `mask` burns a parent-controlled fuse (`parentCannotControl`, `canExtendExpiry`)
 * while the parent has not burned `cannotUnwrap`: the NameWrapper refuses it
 * (`OperationProhibited`).
 */
export const requireLockedParent = (
  names: readonly Fuse.Name[] | undefined,
  mask: number,
  parentFuses: number,
): Effect.Effect<void, AnyError> =>
  (mask & nameWrapperFuses.parentControlled) === 0 || Fuse.has(parentFuses, "cannotUnwrap")
    ? Effect.void
    : Effect.fail(
        new InvalidInputError({
          code: "INVALID_RECORD_VALUE",
          field: "fuses",
          input: names,
          shortMessage:
            "`parentCannotControl` and `canExtendExpiry` need `cannotUnwrap` burned on the parent.",
          hint: "Burn `cannotUnwrap` on the parent with wrapper.setFuses first.",
        }),
      );
