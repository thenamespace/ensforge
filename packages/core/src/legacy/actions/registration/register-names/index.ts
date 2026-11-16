import { Effect } from "effect";

import { defineAction } from "../../../action/action.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { RegistrationError } from "../../../errors/registration-error.js";
import { withWorkflow } from "../../../internal/workflows/run.js";
import { normalizeName } from "../../../names/normalize.js";
import type { WriteError } from "../../../write/types.js";
import { registerName } from "../register-name/index.js";
import type { RegisterNamesParameters, RegisterNamesResult } from "../types.js";

const registerNamesEffect = Effect.fn("ensforge.registerNames")(function* (
  config: EnsforgeConfig,
  parameters: RegisterNamesParameters,
): Effect.fn.Return<RegisterNamesResult, WriteError> {
  if (parameters.registrations.length === 0) {
    return yield* new RegistrationError({
      code: "REGISTRATION_FAILED",
      message: "registerNames requires at least one registration",
    });
  }

  const names = yield* Effect.forEach(parameters.registrations, (registration) =>
    normalizeName.effect(registration.name),
  );

  if (new Set(names).size !== names.length) {
    return yield* new RegistrationError({
      code: "REGISTRATION_FAILED",
      message: "registerNames cannot contain duplicate names",
    });
  }

  const registrations = yield* Effect.forEach(
    parameters.registrations,
    (registration, index) =>
      registerName.effect(config, {
        ...registration,
        ...(parameters.walletClient === undefined ? {} : { walletClient: parameters.walletClient }),
        ...(parameters.account === undefined ? {} : { account: parameters.account }),
        ...(parameters.mode === undefined ? {} : { mode: parameters.mode }),
        ...(parameters.confirmation === undefined ? {} : { confirmation: parameters.confirmation }),
        ...(parameters.resume?.registrations[index] === undefined
          ? {}
          : { resume: parameters.resume.registrations[index] }),
      }),
    { concurrency: 1 },
  );

  const status = registrations.some((registration) => registration.status === "partial")
    ? "partial"
    : registrations.every((registration) => registration.status === "completed")
      ? "completed"
      : "waiting";

  const nextActionAt = registrations.reduce<bigint | null>(
    (earliest, registration) =>
      registration.nextActionAt === null ||
      (earliest !== null && earliest <= registration.nextActionAt)
        ? earliest
        : registration.nextActionAt,
    null,
  );

  return { status, registrations, nextActionAt };
});

export const registerNames = defineAction<RegisterNamesParameters, RegisterNamesResult, WriteError>(
  withWorkflow("registerNames", registerNamesEffect),
);

export type { RegisterNamesParameters, RegisterNamesResult } from "../types.js";
