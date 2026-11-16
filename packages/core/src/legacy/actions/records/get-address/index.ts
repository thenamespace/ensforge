import { Effect } from "effect";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { ContractError } from "../../../errors/contract-error.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { normalizeName } from "../../../names/normalize.js";
import { resolveAddresses } from "./resolve.js";
import type {
  AddressResult,
  GetAddressError,
  GetAddressParameters,
  GetAddressesError,
  GetAddressesParameters,
} from "./types.js";

const getAddressEffect = Effect.fn("ensforge.getAddress")(function* (
  config: EnsforgeConfig,
  parameters: GetAddressParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  const [result] = yield* executeRead(
    config,
    parameters,
    resolveAddresses(name, [parameters.coinType ?? 60n]),
  );

  return result === undefined
    ? yield* new ContractError({
        code: "DECODE_FAILED",
        message: "Address resolution returned no result",
        cause: { name, coinType: parameters.coinType ?? 60n },
      })
    : result;
});

const getAddressesEffect = Effect.fn("ensforge.getAddresses")(function* (
  config: EnsforgeConfig,
  parameters: GetAddressesParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(config, parameters, resolveAddresses(name, parameters.coinTypes));
});

export const getAddress = defineReadAction<GetAddressParameters, AddressResult, GetAddressError>(
  getAddressEffect,
);

export const getAddresses = defineReadAction<
  GetAddressesParameters,
  ReadonlyArray<AddressResult>,
  GetAddressesError
>(getAddressesEffect);

export {
  AddressResult,
  type GetAddressError,
  type GetAddressParameters,
  type GetAddressesError,
  type GetAddressesParameters,
} from "./types.js";
