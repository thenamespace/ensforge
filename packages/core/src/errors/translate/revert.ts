import { Abis } from "@ensforge/contracts";
import { decodeErrorResult, type Address, type Hex } from "viem";

import { ContractRevertError } from "../classes/index.js";
import type { EnsforgeError } from "../EnsforgeError.js";
import { revertMap } from "./revert-map.js";

/** A contract revert, decoded by viem or still raw. */
export type Revert = {
  readonly errorName?: string | undefined;
  readonly args?: readonly unknown[] | undefined;
  readonly data?: Hex | undefined;
};

// Resolution wraps errors at most a few levels deep; the bound stops malicious nesting.
const maxDepth = 4;

const decode = (data: Hex): Revert => {
  try {
    const decoded = decodeErrorResult({ abi: Abis.shared.errors, data });
    return { errorName: decoded.errorName, args: decoded.args, data };
  } catch {
    return { data };
  }
};

/**
 * Translates a contract revert into an ensforge error. `ResolverError(bytes)` and the mainnet
 * `ResolutionError(address,bytes)` are unwrapped so the inner cause decides the class.
 */
export const fromRevert = (
  revert: Revert,
  context: EnsforgeError.Context,
  depth = 0,
): EnsforgeError => {
  const decoded =
    revert.errorName === undefined && revert.data !== undefined ? decode(revert.data) : revert;
  const { errorName, args = [] } = decoded;

  if (depth < maxDepth && errorName === "ResolverError") {
    return fromRevert({ data: args[0] as Hex }, context, depth + 1);
  }

  if (depth < maxDepth && errorName === "ResolutionError") {
    const registry = args[0] as Address;
    return fromRevert({ data: args[1] as Hex }, { ...context, registry }, depth + 1).withContext({
      registry,
    });
  }

  const mapper = errorName === undefined ? undefined : revertMap[errorName];
  if (mapper !== undefined) return mapper(args, context);

  return new ContractRevertError({
    code: "CONTRACT_REVERTED",
    errorName,
    args,
    data: decoded.data,
  });
};
