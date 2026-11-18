import { nameWrapperFuses } from "@ensforge/contracts/v1";

import { InvalidInputError } from "../errors/classes/InvalidInputError.js";

/** Single fuses; composite masks (`parentControlled`, `userSettable`) and `canDoEverything` are excluded. */
const fuses = {
  cannotUnwrap: nameWrapperFuses.cannotUnwrap,
  cannotBurnFuses: nameWrapperFuses.cannotBurnFuses,
  cannotTransfer: nameWrapperFuses.cannotTransfer,
  cannotSetResolver: nameWrapperFuses.cannotSetResolver,
  cannotSetTtl: nameWrapperFuses.cannotSetTtl,
  cannotCreateSubdomain: nameWrapperFuses.cannotCreateSubdomain,
  cannotApprove: nameWrapperFuses.cannotApprove,
  parentCannotControl: nameWrapperFuses.parentCannotControl,
  isDotEth: nameWrapperFuses.isDotEth,
  canExtendExpiry: nameWrapperFuses.canExtendExpiry,
} as const;

/**
 * An ENSv1 NameWrapper fuse name.
 *
 * @stability stable
 * @category wrapper
 * @since 1.0.0
 */
export type Name = keyof typeof fuses;

/**
 * Every fuse with whether it is burned.
 *
 * @stability stable
 * @category wrapper
 * @since 1.0.0
 */
export type Decoded = { readonly [name in Name]: boolean };

/**
 * Fuse mask with every fuse in `names` burned.
 *
 * @throws `Errors.InvalidInputError` (`INVALID_RECORD_VALUE`) for unknown fuse names.
 * @stability stable
 * @category wrapper
 * @since 1.0.0
 */
export const from = (names: readonly Name[]): number =>
  names.reduce((mask, name) => {
    const fuse = fuses[name] as number | undefined;
    if (fuse === undefined)
      throw new InvalidInputError({ code: "INVALID_RECORD_VALUE", input: name, field: "fuses" });
    return mask | fuse;
  }, 0);

/**
 * Whether `name` is burned in `mask`.
 *
 * @stability stable
 * @category wrapper
 * @since 1.0.0
 */
export const has = (mask: number, name: Name): boolean => (mask & fuses[name]) === fuses[name];

/**
 * Every fuse in `mask`, by name.
 *
 * @stability stable
 * @category wrapper
 * @since 1.0.0
 */
export const decode = (mask: number): Decoded =>
  Object.fromEntries(
    (Object.keys(fuses) as Name[]).map((name) => [name, has(mask, name)]),
  ) as Decoded;
