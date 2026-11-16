import { Roles } from "@ensforge/contracts";

import type { EnsforgeError } from "../EnsforgeError.js";

const tables = {
  registry: Roles.registry,
  resolver: Roles.resolver,
} as const;

/**
 * Names the roles set in `bitmap`. Registry and resolver roles share bit positions, so names are
 * only returned when the contract kind is known.
 */
export const roleNames = (
  bitmap: bigint,
  kind: EnsforgeError.Context["contractKind"],
): readonly string[] => {
  if (kind !== "registry" && kind !== "resolver") return [];

  return Object.entries(tables[kind])
    .filter(([, bit]) => (bitmap & bit) === bit)
    .map(([name]) => name);
};
