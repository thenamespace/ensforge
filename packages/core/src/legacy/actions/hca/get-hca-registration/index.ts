import { Effect } from "effect";

import { defineAction } from "../../../action/action.js";
import { HcaError } from "../../../errors/hca-error.js";
import { loadOperation } from "../../../internal/hca/registration/storage.js";
import { reconcileRegistration } from "../../../internal/hca/registration/tracking.js";
import type {
  GetHcaRegistrationParameters,
  HcaRegistrationOperation,
} from "../registration-types.js";

/** Reconcile saved progress without requesting signatures or sending transactions. */
export const getHcaRegistration = defineAction<
  GetHcaRegistrationParameters,
  HcaRegistrationOperation,
  HcaError
>((config, input) => {
  const storage = input.storage ?? config.storage;
  const parameters = { ...input, ...(storage === undefined ? {} : { storage }) };
  return Effect.tryPromise({
    try: async (signal) =>
      reconcileRegistration(
        config,
        parameters,
        await loadOperation(config, parameters, parameters.id),
        signal,
      ),
    catch: (cause) =>
      cause instanceof HcaError
        ? cause
        : new HcaError({
            code: "INVALID_EXECUTION",
            message: "HCA registration could not progress; saved state is retained",
            cause,
          }),
  });
});
