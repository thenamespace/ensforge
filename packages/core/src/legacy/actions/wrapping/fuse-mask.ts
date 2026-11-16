import { Effect } from "effect";

import { nameWrapperFuses } from "@ensforge/contracts/v1";

import { AuthorizationError } from "../../errors/authorization-error.js";

export const nameWrapperFuseNames = [
  "cannotUnwrap",
  "cannotBurnFuses",
  "cannotTransfer",
  "cannotSetResolver",
  "cannotSetTtl",
  "cannotCreateSubdomain",
  "cannotApprove",
  "parentCannotControl",
  "isDotEth",
  "canExtendExpiry",
] as const;

export type NameWrapperFuseName = (typeof nameWrapperFuseNames)[number];

const ownerControlledMask =
  nameWrapperFuses.cannotUnwrap |
  nameWrapperFuses.cannotBurnFuses |
  nameWrapperFuses.cannotTransfer |
  nameWrapperFuses.cannotSetResolver |
  nameWrapperFuses.cannotSetTtl |
  nameWrapperFuses.cannotCreateSubdomain |
  nameWrapperFuses.cannotApprove;

const parentControlledMask =
  nameWrapperFuses.parentCannotControl | nameWrapperFuses.canExtendExpiry;

export const wrapperFuseMasks = Object.freeze({ ownerControlledMask, parentControlledMask });

export const decodeFuseMask = (mask: number): ReadonlyArray<NameWrapperFuseName> =>
  nameWrapperFuseNames.filter((name) => (mask & nameWrapperFuses[name]) !== 0);

export const encodeFuseMask = Effect.fn("ensforge.encodeFuseMask")(function* (
  input: number | ReadonlyArray<NameWrapperFuseName>,
  allowedMask: number,
) {
  const mask =
    typeof input === "number"
      ? input
      : input.reduce((value, name) => value | nameWrapperFuses[name], 0);

  if (!Number.isSafeInteger(mask) || mask < 0 || (mask & ~allowedMask) !== 0) {
    return yield* new AuthorizationError({
      code: "WRITE_TARGET_UNAVAILABLE",
      message: "The requested Name Wrapper fuse mask contains unsupported fuse bits",
    });
  }

  return mask;
});
