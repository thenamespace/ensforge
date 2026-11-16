import { Effect, Schema } from "effect";

import { toFunctionSelector } from "viem";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { CodecError } from "../../../errors/codec-error.js";
import { isContractRevert, isContractRevertWithData } from "../../../internal/errors/viem-error.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { reverseAddress } from "../../../internal/resolver/reverse-address.js";
import { encodeAddressRecord } from "../../../names/address-record.js";
import { parseCoinType } from "../../../names/coin-type.js";
import { normalizeName } from "../../../names/normalize.js";
import { EthereumAddress } from "../../../schemas/identity.js";
import type { GetPrimaryNameError, GetPrimaryNameParameters, PrimaryNameResult } from "./types.js";

const unreachableNameSelector = toFunctionSelector("UnreachableName(bytes)");

const getPrimaryNameEffect = Effect.fn("ensforge.getPrimaryName")(function* (
  config: EnsforgeConfig,
  parameters: GetPrimaryNameParameters,
) {
  const coinType = yield* Effect.try({
    try: () => parseCoinType(parameters.coinType ?? 60n),
    catch: (cause) =>
      cause instanceof CodecError
        ? cause
        : new CodecError({
            code: "INVALID_COIN_TYPE",
            message: `Invalid ENS coin type: ${parameters.coinType}`,
          }),
  });

  const address =
    coinType === 60n
      ? yield* Effect.try({
          try: () => Schema.decodeUnknownSync(EthereumAddress)(parameters.address),
          catch: () =>
            new CodecError({
              code: "INVALID_ADDRESS",
              message: `Invalid Ethereum address: ${parameters.address}`,
            }),
        })
      : yield* Effect.try({
          try: () => encodeAddressRecord({ coinType, address: parameters.address }),
          catch: (cause) =>
            cause instanceof CodecError
              ? cause
              : new CodecError({
                  code: "INVALID_ADDRESS_RECORD",
                  message: `Invalid address for coin type ${coinType}`,
                }),
        });

  const resolved = yield* executeRead(config, parameters, reverseAddress(address, coinType)).pipe(
    Effect.catchIf(
      (error) =>
        isContractRevert(error.cause, "ResolverNotFound") ||
        isContractRevert(error.cause, "ReverseAddressMismatch") ||
        isContractRevertWithData(error.cause, "ResolverError", unreachableNameSelector),
      () => Effect.succeed(null),
    ),
  );

  if (resolved === null || resolved[0].length === 0) return null;

  const name = yield* normalizeName.effect(resolved[0]);

  return { name, match: true } as const;
});

export const getPrimaryName = defineReadAction<
  GetPrimaryNameParameters,
  PrimaryNameResult,
  GetPrimaryNameError
>(getPrimaryNameEffect);

export {
  type GetPrimaryNameError,
  type GetPrimaryNameParameters,
  PrimaryNameResult,
} from "./types.js";
