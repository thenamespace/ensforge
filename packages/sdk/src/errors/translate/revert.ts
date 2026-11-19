/* oxlint-disable typescript/no-unsafe-type-assertion -- revert arguments are decoded against the error's signature, which TypeScript cannot see */
import { String as Str } from "effect";

import { Abis } from "@ensforge/contracts";
import { decodeErrorResult, isHex, type Abi, type Address, type Hex } from "viem";

import {
  ContractRevertError,
  GatewayError,
  UnauthorizedError,
  UnsupportedError,
} from "../classes/index.js";
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

// Decoding reads only the error's name and arguments; typing the 548 errors as a plain `Abi`
// spares the type checker a union over all of them.
const errorsAbi: Abi = Abis.shared.errors;

const decode = (data: Hex): Revert => {
  try {
    const decoded = decodeErrorResult({ abi: errorsAbi, data });
    return { errorName: decoded.errorName, args: decoded.args, data };
  } catch {
    return { data };
  }
};

/**
 * A resolver rejecting a signature (EIP-3668 `resolveWithProof`), directly or inside a resolution,
 * rejects its gateway's signed answer, not anything the reader did.
 */
const rejectedAnswer = (inner: EnsforgeError, context: EnsforgeError.Context): EnsforgeError =>
  inner instanceof UnauthorizedError &&
  (inner.code === "SIGNATURE_EXPIRED" || inner.code === "SIGNATURE_INVALID")
    ? new GatewayError({
        code: "GATEWAY_RESPONSE_INVALID",
        shortMessage: "The resolver rejected its gateway's signed answer.",
        cause: inner,
        context,
      })
    : inner;

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
    return rejectedAnswer(fromRevert({ data: args[0] as Hex }, context, depth + 1), context);
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
    const inner = fromRevert({ data: args[1] as Hex }, { ...context, registry }, depth + 1);
    return rejectedAnswer(inner, { ...context, registry }).withContext({ registry });
  }

  const revertContext = { ...context, revert: { errorName, data: decoded.data } };
  const mapper = errorName === undefined ? undefined : revertMap[errorName];
  if (mapper !== undefined) {
    const error = mapper(args, revertContext).withContext(revertContext);
    // A resolver's answer, or a `resolve…` call: where CCIP-Read callbacks check signatures.
    return context.contractKind === "resolver" ||
      Str.startsWith("resolve")(context.functionName ?? "")
      ? rejectedAnswer(error, revertContext)
      : error;
  }

  return new ContractRevertError({
    code: "CONTRACT_REVERTED",
    errorName,
    args,
    data: decoded.data,
    context: revertContext,
  });
};
