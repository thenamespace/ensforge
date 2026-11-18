import { toNames } from "../../utils/Role.js";
import type { EnsforgeError } from "../EnsforgeError.js";

/**
 * Names the roles set in `bitmap`. Registry and resolver roles share bit positions, so names are
 * only returned when the contract kind is known.
 */
export const roleNames = (
  bitmap: bigint,
  kind: EnsforgeError.Context["contractKind"],
): readonly string[] => (kind === "registry" || kind === "resolver" ? toNames(bitmap, kind) : []);
