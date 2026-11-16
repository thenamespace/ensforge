import { Effect } from "effect";

import { defineAction, HcaError } from "@ensforge/core/legacy";
import { enableHcaSession, enableHcaSessionWithRefund } from "@ensforge/core/legacy/hca";
import type { RhinestoneSDK } from "@rhinestone/sdk";

import { createRhinestoneHca } from "./account.js";
import type { PreparedRhinestoneSession, RhinestoneOptions, RhinestoneSessions } from "./types.js";

export const createRhinestoneSessions = (
  options: RhinestoneOptions,
  sdk: RhinestoneSDK,
): RhinestoneSessions => {
  const prepared = new WeakSet<object>();

  return {
    prepare: defineAction((config, parameters) =>
      Effect.tryPromise({
        try: async () => {
          const { account } = await createRhinestoneHca(
            options,
            sdk,
            config,
            parameters.hca,
            parameters.salt,
          );

          const result: PreparedRhinestoneSession = Object.freeze({
            parameters: Object.freeze({
              ...parameters,
              sessionKey: options.sessionSigner.address,
              ...(parameters.refund === undefined
                ? {}
                : { refund: Object.freeze({ ...parameters.refund }) }),
            }),
            sessionNonce: account.sessionNonce,
            chainId: account.chainId,
            profileId: account.profileId,
          });

          prepared.add(result);

          return result;
        },
        catch: (cause) =>
          cause instanceof HcaError
            ? cause
            : new HcaError({
                code: "ADAPTER_FAILED",
                message: "Rhinestone operation failed",
                cause,
              }),
      }),
    ),
    enable: defineAction((config, session) =>
      Effect.tryPromise({
        try: async () => {
          if (!prepared.has(session))
            throw new HcaError({
              code: "ADAPTER_MISMATCH",
              message: "Prepare session enablement with this adapter first",
            });

          const { account } = await createRhinestoneHca(
            options,
            sdk,
            config,
            session.parameters.hca,
            session.parameters.salt,
          );

          if (account.sessionNonce !== session.sessionNonce)
            throw new HcaError({
              code: "INVALID_EXECUTION",
              message: "Session nonce changed; prepare enablement again",
            });

          prepared.delete(session);

          return session.parameters.refund === undefined
            ? enableHcaSession(config, session.parameters)
            : enableHcaSessionWithRefund(config, {
                ...session.parameters,
                refund: session.parameters.refund,
              });
        },
        catch: (cause) =>
          cause instanceof HcaError
            ? cause
            : new HcaError({
                code: "ADAPTER_FAILED",
                message: "Rhinestone operation failed",
                cause,
              }),
      }),
    ),
  };
};
