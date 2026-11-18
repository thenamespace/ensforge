/* oxlint-disable typescript/no-unsafe-type-assertion -- revert arguments are decoded against the error's signature, which TypeScript cannot see */
import { String as Str } from "effect";

import { Abis } from "@ensforge/contracts";
import { decodeErrorResult, isHex, type Address, type Hex } from "viem";

import { ContractRevertError, UnsupportedError } from "../classes/index.js";
import type { EnsforgeError } from "../EnsforgeError.js";
import { requireMap, revertMap } from "./revert-map.js";

/** A contract revert, decoded by viem or still raw. */
export type Revert = {
  readonly errorName?: string | undefined;
  readonly args?: readonly unknown[] | undefined;
  readonly data?: Hex | undefined;
};

// Resolution and migration wrap errors a few levels deep; the bound stops malicious nesting.
const maxDepth = 8;

/** Prefix of `WrappedErrorLib`: NameWrapper-based contracts revert `Error("WrappedError::0x…")`. */
const wrappedErrorPrefix = "WrappedError::0x";

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
    // A resolver that reverts without data does not implement the call (old resolvers lack newer
    // profiles); reads treat that as a missing record.
    if (args[0] === "0x") {
      return new UnsupportedError({
        code: "RESOLVER_PROFILE_UNSUPPORTED",
        shortMessage: "The resolver reverted without a reason; it does not support this record.",
        context,
      });
    }
    return fromRevert({ data: args[0] as Hex }, context, depth + 1);
  }

  if (depth < maxDepth && errorName === "Error" && typeof args[0] === "string") {
    const message = args[0];
    const inner = Str.slice(wrappedErrorPrefix.length - 2)(message);
    if (Str.startsWith(wrappedErrorPrefix)(message) && isHex(inner) && inner.length % 2 === 0) {
      return fromRevert({ data: inner }, context, depth + 1);
    }
    const required = requireMap[message];
    if (required !== undefined) {
      const revertContext = { ...context, revert: { errorName, data: decoded.data } };
      return required(args, revertContext).withContext(revertContext);
    }
  }

  if (depth < maxDepth && errorName === "ResolutionError") {
    const registry = args[0] as Address;
    return fromRevert({ data: args[1] as Hex }, { ...context, registry }, depth + 1).withContext({
      registry,
    });
  }

  const revertContext = { ...context, revert: { errorName, data: decoded.data } };
  const mapper = errorName === undefined ? undefined : revertMap[errorName];
  if (mapper !== undefined) return mapper(args, revertContext).withContext(revertContext);

  return new ContractRevertError({
    code: "CONTRACT_REVERTED",
    errorName,
    args,
    data: decoded.data,
    context: revertContext,
  });
};
