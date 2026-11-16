import { Effect } from "effect";

import { defineAction } from "../../../action/action.js";
import { HcaError } from "../../../errors/hca-error.js";
import { loadOperation, saveOperation } from "../../../internal/hca/registration/storage.js";
import type {
  GetHcaRegistrationParameters,
  HcaRegistrationOperation,
} from "../registration-types.js";

/** Stop local advancement. Submitted operations must be reconciled before cancellation. */
export const cancelHcaRegistration = defineAction<
  GetHcaRegistrationParameters,
  HcaRegistrationOperation,
  HcaError
>((config, input) => {
  const storage = input.storage ?? config.storage;
  const parameters = { ...input, ...(storage === undefined ? {} : { storage }) };
  return Effect.tryPromise({
    try: async () => {
      const operation = await loadOperation(config, parameters, parameters.id);

      if (operation.progress.status === "submitting" || operation.progress.status === "submitted")
        throw new HcaError({
          code: "INVALID_EXECUTION",
          message: "Reconcile the pending submission before cancelling local registration",
        });

      if (operation.progress.status === "registered" || operation.progress.status === "cancelled")
        return operation;

      return saveOperation(parameters, operation, {
        status: "cancelled",
        reason:
          "Local registration progression cancelled; on-chain commitments and sessions are unchanged",
      });
    },
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
