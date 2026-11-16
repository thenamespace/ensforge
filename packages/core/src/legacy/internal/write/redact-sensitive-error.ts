import { isSensitiveWriteIntent, type EnsWriteIntent } from "../../action/write-intent.js";
import { RegistrationError } from "../../errors/registration-error.js";
import { WorkflowError } from "../../errors/workflow-error.js";
import type { WriteError } from "../../write/types.js";

export const redactSensitiveWriteError = (
  calls: ReadonlyArray<EnsWriteIntent<unknown, WriteError>>,
  error: WriteError,
): WriteError =>
  error instanceof WorkflowError
    ? new WorkflowError({
        code: error.code,
        message: error.message,
        ...(error.workflowId ? { workflowId: error.workflowId } : {}),
      })
    : calls.some(isSensitiveWriteIntent) && !(error instanceof RegistrationError)
      ? new RegistrationError({
          code: "REGISTRATION_FAILED",
          message: "A sensitive registration call failed",
        })
      : error;
