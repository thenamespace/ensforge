import { Roles } from "@ensforge/contracts";

import { InvalidInputError } from "../errors/classes/InvalidInputError.js";

/**
 * Registry role bits from contracts-v2 v1.0.1 (`canTransfer` is `1n << 28n`).
 *
 * @category roles
 * @since 1.0.0
 */
export const registry = Roles.registry;

/**
 * PermissionedResolver role bits from contracts-v2 v1.0.1.
 *
 * @category roles
 * @since 1.0.0
 */
export const resolver = Roles.resolver;

/**
 * A registry or resolver role name.
 *
 * @category roles
 * @since 1.0.0
 */
export type Name = keyof typeof registry | keyof typeof resolver;

/**
 * Which contract a role bitmap belongs to. Registry and resolver roles share bit positions.
 *
 * @category roles
 * @since 1.0.0
 */
export type Target = "registry" | "resolver";

// Names shared by both tables (`canName`, `upgrade`, …) have the same bits, so one lookup works.
const bits: Readonly<Record<string, bigint>> = { ...registry, ...resolver };

/**
 * Bitmap with every role in `names` set.
 *
 * **Example** (Building a bitmap)
 *
 * ```ts
 * import { Role } from "@ensforge/sdk"
 *
 * Role.from(["setText", "setAddr"])
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ROLES`) for unknown role names.
 * @category roles
 * @since 1.0.0
 */
export const from = (names: readonly Name[]): bigint =>
  names.reduce((bitmap, name) => {
    const bit = bits[name];
    if (bit === undefined) throw new InvalidInputError({ code: "INVALID_ROLES", input: name });
    return bitmap | bit;
  }, 0n);

/**
 * Whether `bitmap` has every role in `names`.
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ROLES`) for unknown role names.
 * @category roles
 * @since 1.0.0
 */
export const has = (bitmap: bigint, names: Name | readonly Name[]): boolean => {
  const required = from(typeof names === "string" ? [names] : names);
  return (bitmap & required) === required;
};

/**
 * Names of the roles set in `bitmap` for a registry or resolver.
 *
 * @category roles
 * @since 1.0.0
 */
export const toNames = (bitmap: bigint, target: Target): readonly Name[] => {
  const table: Readonly<Record<string, bigint>> = target === "registry" ? registry : resolver;

  return Object.entries(table)
    .filter(([, bit]) => (bitmap & bit) === bit)
    .map(([name]) => name as Name);
};

/**
 * Admin role that grants and revokes `name`, e.g. `setResolver` → `setResolverAdmin`.
 *
 * @category roles
 * @since 1.0.0
 */
export const admin = <const name extends Name>(name: name): `${name}Admin` => `${name}Admin`;
