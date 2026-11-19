import { Array as Arr, Record as Rec } from "effect";

import { Roles } from "@ensforge/contracts";

import { InvalidInputError } from "../errors/classes/InvalidInputError.js";

/**
 * Registry role bits from contracts-v2 v1.0.1 (`canTransfer` is `1n << 28n`).
 *
 * **Example** (Reading a registry role)
 *
 * ```ts
 * import { Role } from "@ensforge/sdk"
 *
 * const canRenew = Role.registry.renew
 * ```
 *
 * @stability stable
 * @category roles
 * @since 1.0.0
 */
export const registry: typeof Roles.registry = Roles.registry;

/**
 * PermissionedResolver role bits from contracts-v2 v1.0.1.
 *
 * **Example** (Reading a resolver role)
 *
 * ```ts
 * import { Role } from "@ensforge/sdk"
 *
 * const canSetText = Role.resolver.setText
 * ```
 *
 * @stability stable
 * @category roles
 * @since 1.0.0
 */
export const resolver: typeof Roles.resolver = Roles.resolver;

/**
 * A registry or resolver role name.
 *
 * @stability stable
 * @category roles
 * @since 1.0.0
 */
export type Name = keyof typeof registry | keyof typeof resolver;

/**
 * Which contract a role bitmap belongs to. Registry and resolver roles share bit positions.
 *
 * @stability stable
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
 * @stability stable
 * @category roles
 * @since 1.0.0
 */
export const from = (names: readonly Name[]): bigint =>
  Arr.reduce(names, 0n, (bitmap, name) => {
    const bit = bits[name];
    if (bit === undefined) throw new InvalidInputError({ code: "INVALID_ROLES", input: name });
    return bitmap | bit;
  });

/**
 * Whether `bitmap` has every role in `names`.
 *
 * **Example** (Checking roles)
 *
 * ```ts
 * import { Role } from "@ensforge/sdk"
 *
 * const bitmap = Role.from(["setText", "setAddr"])
 * Role.has(bitmap, "setText")                // true
 * Role.has(bitmap, ["setText", "setAddr"])  // true
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ROLES`) for unknown role names.
 * @stability stable
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
 * **Example** (Listing roles)
 *
 * ```ts
 * import { Role } from "@ensforge/sdk"
 *
 * Role.toNames(Role.from(["setText"]), "resolver") // ["setText"]
 * ```
 *
 * @stability stable
 * @category roles
 * @since 1.0.0
 */
export const toNames = (bitmap: bigint, target: Target): readonly Name[] => {
  const table: Readonly<Record<string, bigint>> = target === "registry" ? registry : resolver;

  return Arr.map(
    Arr.filter(Rec.toEntries(table), ([, bit]) => (bitmap & bit) === bit),
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `table` is the registry or resolver role table, so its keys are role names
    ([name]) => name as Name,
  );
};

/**
 * Admin role that grants and revokes `name`, e.g. `setResolver` → `setResolverAdmin`.
 *
 * **Example** (Granting a role with its admin)
 *
 * ```ts
 * import { Role } from "@ensforge/sdk"
 *
 * const bitmap = Role.from(["setText", Role.admin("setText")])
 * ```
 *
 * @stability stable
 * @category roles
 * @since 1.0.0
 */
export const admin = <const name extends Name>(name: name): `${name}Admin` => `${name}Admin`;
