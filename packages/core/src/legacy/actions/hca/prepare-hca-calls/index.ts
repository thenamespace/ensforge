import { Effect, Schema } from "effect";

import { standaloneHcaV2ExecuteByOwnerAbi } from "@ensforge/contracts/internal";
import { encodeAbiParameters, encodeFunctionData, isAddressEqual, keccak256 } from "viem";

import { defineAction } from "../../../action/action.js";
import { getWriteIntentPreparer } from "../../../action/write-intent.js";
import type { EnsWriteIntent } from "../../../action/write-intent.js";
import { HcaError } from "../../../errors/hca-error.js";
import { hashHcaCalls } from "../../../internal/hca/calls-hash.js";
import { validateHcaSessionCalls } from "../../../internal/hca/session-policy.js";
import { readHcaSession } from "../../../internal/hca/session-state.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { prepareWriteIntents } from "../../../internal/write/prepare-write-intents.js";
import type { WriteError } from "../../../write/types.js";
import { HcaCall, type PrepareHcaCallsParameters, type PreparedHcaCalls } from "../types.js";
import { verifyHca } from "../verify-hca/index.js";

export const prepareHcaCalls = defineAction<
  PrepareHcaCallsParameters,
  PreparedHcaCalls,
  WriteError
>((config, parameters) =>
  executeRead(
    config,
    { consistency: "snapshot" },
    Effect.gen(function* () {
      if (
        parameters.requiredCapabilities !== undefined &&
        !Schema.is(
          Schema.Array(
            Schema.Literals([
              "ownerExecution",
              "sessionExecution",
              "counterfactualDeployment",
              "atomicBatching",
              "sponsorship",
              "crossChainFunding",
            ]),
          ),
        )(parameters.requiredCapabilities)
      )
        return yield* new HcaError({
          code: "INVALID_PARAMETERS",
          message: "Unknown execution capability requirement",
        });

      if (
        parameters.operationId !== undefined &&
        !Schema.is(Schema.NonEmptyString)(parameters.operationId)
      )
        return yield* new HcaError({
          code: "INVALID_PARAMETERS",
          message: "Operation ID must be nonempty",
        });

      if (
        parameters.authorization?.kind !== "owner" &&
        parameters.authorization?.kind !== "session"
      )
        return yield* new HcaError({
          code: "UNSUPPORTED_AUTHORIZATION",
          message: "Expected owner or session authorization",
        });

      if (!Array.isArray(parameters.calls) || parameters.calls.length === 0)
        return yield* new HcaError({
          code: "INVALID_PARAMETERS",
          message: "An HCA batch must contain at least one call",
        });

      const account = yield* verifyHca.effect(config, {
        hca: parameters.hca,
        ...(parameters.counterfactualOwner === undefined
          ? {}
          : { expectedOwner: parameters.counterfactualOwner, allowUndeployed: true }),
        ...(parameters.salt === undefined ? {} : { salt: parameters.salt }),
      });

      if (account.deployed === false && parameters.authorization.kind !== "owner")
        return yield* new HcaError({
          code: "UNSUPPORTED_AUTHORIZATION",
          message: "Counterfactual execution requires owner authorization",
        });

      const calls = yield* Effect.forEach(parameters.calls, (input) =>
        Effect.gen(function* () {
          if (Schema.is(HcaCall)(input)) {
            return { to: input.to, data: input.data ?? ("0x" as const), value: input.value ?? 0n };
          }

          const intent = input as EnsWriteIntent<unknown, WriteError>;

          if (!input || typeof input !== "object" || getWriteIntentPreparer(intent) === undefined)
            return yield* new HcaError({
              code: "INVALID_PARAMETERS",
              message: "Expected a validated raw call or an ENS .call intent",
            });

          const [prepared] = yield* prepareWriteIntents(config, {
            calls: [intent],
            account: account.address,
            ...(parameters.walletClient === undefined
              ? {}
              : { walletClient: parameters.walletClient }),
          });

          if (!prepared)
            return yield* new HcaError({
              code: "INVALID_EXECUTION",
              message: "ENS intent produced no HCA call",
            });

          return { to: prepared.to, data: prepared.data ?? ("0x" as const), value: prepared.value };
        }),
      );

      if (calls.some((call) => isAddressEqual(call.to, account.address)))
        return yield* new HcaError({
          code: "INVALID_EXECUTION",
          message: "HCA self-calls require dedicated validated management actions",
        });

      const value = calls.reduce((sum, call) => sum + call.value, 0n);

      if (value >= 1n << 256n)
        return yield* new HcaError({
          code: "INVALID_PARAMETERS",
          message: "HCA batch value exceeds uint256",
        });

      const session =
        parameters.authorization.kind === "session"
          ? yield* readHcaSession(config, account, parameters.authorization)
          : undefined;

      if (session) yield* validateHcaSessionCalls(config, account, session, calls);

      const data = encodeFunctionData({
        abi: standaloneHcaV2ExecuteByOwnerAbi,
        functionName: "executeByOwner",
        args: [calls.map((call) => ({ target: call.to, value: call.value, callData: call.data }))],
      });

      return Object.freeze({
        account: Object.freeze(account),
        ...(parameters.operationId === undefined ? {} : { operationId: parameters.operationId }),
        ...(parameters.requiredCapabilities === undefined
          ? {}
          : { requiredCapabilities: Object.freeze([...parameters.requiredCapabilities]) }),
        authorization: session
          ? Object.freeze({ kind: "session" as const, session })
          : Object.freeze({ kind: "owner" as const }),
        ...(session === undefined ? {} : { session }),
        calls: Object.freeze(calls.map((call) => Object.freeze(call))),
        data,
        value,
        fingerprint:
          session === undefined
            ? hashHcaCalls(account, data, value)
            : keccak256(
                encodeAbiParameters(
                  [
                    { type: "bytes32" },
                    { type: "bytes32" },
                    { type: "bytes32" },
                    { type: "uint256" },
                  ],
                  [
                    hashHcaCalls(account, data, value),
                    session.permissionId,
                    keccak256(session.ownerSignature),
                    session.sessionNonce,
                  ],
                ),
              ),
        simulation: "required" as const,
      });
    }),
  ),
);
