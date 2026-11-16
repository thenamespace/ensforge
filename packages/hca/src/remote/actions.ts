import { Effect, Schema } from "effect";

import { defineAction, HcaError } from "@ensforge/core/legacy";

import { HcaRemoteProgressJson, type HcaRemoteProgress, type HcaRemoteRequest } from "./types.js";

/** Transport owns authentication; it never serializes local signers or execution adapters. */
export const createRemoteHcaRegistrationActions = (options: {
  readonly transport: (request: HcaRemoteRequest, signal: AbortSignal) => Promise<string>;
}) => {
  const action = (kind: HcaRemoteRequest["action"]) =>
    defineAction<{ readonly id: string }, HcaRemoteProgress, HcaError>((config, parameters) =>
      Effect.tryPromise({
        try: async (signal) => {
          const progress = Schema.decodeUnknownSync(HcaRemoteProgressJson, {
            onExcessProperty: "error",
          })(await options.transport({ action: kind, id: parameters.id }, signal));
          if (progress.id !== parameters.id || progress.chainId !== config.chainId)
            throw new HcaError({
              code: "DEPLOYMENT_MISMATCH",
              message: "Remote workflow identity or chain differs",
            });
          return progress;
        },
        catch: (cause) =>
          cause instanceof HcaError
            ? cause
            : new HcaError({
                code: "INVALID_EXECUTION",
                message: "Remote registration request failed; reconcile status before retrying",
                cause,
              }),
      }),
    );

  return Object.freeze({
    getRegistration: action("status"),
    resumeRegistration: action("resume"),
    cancelRegistration: action("cancel"),
  });
};
