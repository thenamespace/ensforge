import { Array as Arr, Record as Rec } from "effect";

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
 * **Example** (Building a fuse mask)
 *
 * ```ts
 * import { Fuse } from "@ensforge/sdk"
 *
 * const mask = Fuse.from(["cannotUnwrap", "cannotSetResolver"])
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_RECORD_VALUE`) for unknown fuse names.
 * @stability stable
 * @category wrapper
 * @since 1.0.0
 */
export const from = (names: readonly Name[]): number =>
  Arr.reduce(names, 0, (mask, name) => {
    const fuse = fuses[name] as number | undefined;
    if (fuse === undefined)
      throw new InvalidInputError({ code: "INVALID_RECORD_VALUE", input: name, field: "fuses" });
    return mask | fuse;
  });

/**
 * Whether `name` is burned in `mask`.
 *
 * **Example** (Checking one fuse)
 *
 * ```ts
 * import { Fuse } from "@ensforge/sdk"
 *
 * const locked = Fuse.has(Fuse.from(["cannotUnwrap"]), "cannotUnwrap")
 * ```
 *
 * @stability stable
 * @category wrapper
 * @since 1.0.0
 */
export const has = (mask: number, name: Name): boolean => (mask & fuses[name]) === fuses[name];

/**
 * Every fuse in `mask`, by name.
 *
 * **Example** (Reading a fuse mask)
 *
 * ```ts
 * import { Fuse } from "@ensforge/sdk"
 *
 * const { cannotUnwrap, cannotTransfer } = Fuse.decode(Fuse.from(["cannotUnwrap"]))
 * ```
 *
 * @stability stable
 * @category wrapper
 * @since 1.0.0
 */
export const decode = (mask: number): Decoded =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- every fuse name is a key of the result
  Rec.fromEntries(Arr.map(Rec.keys(fuses), (name) => [name, has(mask, name)])) as Decoded;
