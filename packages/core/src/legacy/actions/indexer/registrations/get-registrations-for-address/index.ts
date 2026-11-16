import { Effect, Schema } from "effect";

import { defineAction } from "../../../../action/action.js";
import type { EnsforgeConfig } from "../../../../config/config.js";
import { IndexerFilterError } from "../../../../errors/indexer-filter-error.js";
import { getRegistrationsEffect } from "../get-registrations/index.js";
import {
  GetRegistrationsForAddressParameters as GetRegistrationsForAddressParametersSchema,
  type GetRegistrationsForAddressError,
  type GetRegistrationsForAddressParameters,
  type GetRegistrationsForAddressResult,
} from "./types.js";

const getRegistrationsForAddressEffect = Effect.fn("ensforge.getRegistrationsForAddress")(
  function* (
    config: EnsforgeConfig,
    parameters: GetRegistrationsForAddressParameters,
  ): Effect.fn.Return<GetRegistrationsForAddressResult, GetRegistrationsForAddressError> {
    const decoded = yield* Schema.decodeUnknownEffect(GetRegistrationsForAddressParametersSchema)(
      parameters,
    ).pipe(
      Effect.mapError(
        () =>
          new IndexerFilterError({
            code: "INVALID_FILTER",
            message: "The address-registration query parameters are invalid",
          }),
      ),
    );

    return yield* getRegistrationsEffect(config, {
      filter: { ...decoded.filter, registrant: decoded.address },
      ...(decoded.order === undefined ? {} : { order: decoded.order }),
      ...(decoded.pageSize === undefined ? {} : { pageSize: decoded.pageSize }),
      ...(decoded.cursor === undefined ? {} : { cursor: decoded.cursor }),
    });
  },
);

export const getRegistrationsForAddress = defineAction(getRegistrationsForAddressEffect);

export type {
  GetRegistrationsForAddressError,
  GetRegistrationsForAddressParameters,
  GetRegistrationsForAddressResult,
} from "./types.js";
