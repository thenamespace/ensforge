import { Effect, Result } from "effect";

import { publicResolverV1MulticallWithNodeCheckAbi } from "@ensforge/contracts/internal";
import { encodeFunctionData, isAddressEqual } from "viem";

import { defineExtendedAction } from "../../../action/action.js";
import {
  getWriteIntentPreparer,
  makeWriteIntent,
  type EnsWriteIntent,
  type EnsWriteIntentPreparer,
} from "../../../action/write-intent.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { ContractError } from "../../../errors/contract-error.js";
import { WalletError } from "../../../errors/wallet-error.js";
import { WritePlanError } from "../../../errors/write-plan-error.js";
import { executeSequential } from "../../../internal/write/execute-sequential.js";
import { namehash } from "../../../names/hashes.js";
import { normalizeName } from "../../../names/normalize.js";
import type { CallExecutionResult, WriteError } from "../../../write/types.js";
import { sendCalls } from "../../batch/send-calls.js";
import { simulateCalls } from "../../batch/simulate-calls.js";
import { clearRecords } from "../clear-records/index.js";
import { setAbi } from "../set-abi/index.js";
import { setAddress } from "../set-address/index.js";
import { setContentHash } from "../set-content-hash/index.js";
import { setData } from "../set-data/index.js";
import { setInterface } from "../set-interface/index.js";
import { setName } from "../set-name/index.js";
import { setPubkey } from "../set-pubkey/index.js";
import { setText } from "../set-text/index.js";
import type {
  ResolverMulticallResult,
  SetRecordInput,
  SetRecordsAction,
  SetRecordsError,
  SetRecordsParameters,
  SetRecordsResult,
} from "./types.js";

export const getSetRecordIntents = (
  name: string,
  records: ReadonlyArray<SetRecordInput>,
): ReadonlyArray<EnsWriteIntent<CallExecutionResult, WriteError>> =>
  records.map((record) => {
    switch (record.type) {
      case "clear":
        return clearRecords.call({ name });
      case "text":
        return setText.call({ name, key: record.key, value: record.value });
      case "address":
        return setAddress.call({
          name,
          address: record.address,
          ...(record.coinType === undefined ? {} : { coinType: record.coinType }),
        });
      case "contentHash":
        return setContentHash.call({
          name,
          protocol: record.protocol,
          value: record.value,
        });
      case "abi":
        return record.contentType === "uri"
          ? setAbi.call({ name, contentType: "uri", value: record.value })
          : setAbi.call({ name, contentType: record.contentType, value: record.value });
      case "pubkey":
        return setPubkey.call({ name, x: record.x, y: record.y });
      case "interface":
        return setInterface.call({
          name,
          interfaceId: record.interfaceId,
          implementer: record.implementer,
        });
      case "data":
        return setData.call({ name, key: record.key, value: record.value });
      case "name":
        return setName.call({ name, value: record.value });
    }
  });

const resolverMulticallPreparer: EnsWriteIntentPreparer<SetRecordsParameters, SetRecordsError> =
  Effect.fn("ensforge.setRecords.prepare")(function* (config, parameters, context) {
    const name = yield* normalizeName.effect(parameters.name);
    const intents = getSetRecordIntents(name, parameters.records);

    if (intents.length === 0) {
      return yield* new WritePlanError({
        code: "INVALID_CALL_PLAN",
        message: "setRecords requires at least one record mutation",
        cause: parameters.records,
      });
    }

    const prepared = yield* Effect.forEach(
      intents,
      Effect.fn("ensforge.setRecords.prepareRecord")(function* (intent, index) {
        const preparer = getWriteIntentPreparer(intent);

        if (preparer === undefined) {
          return yield* new WritePlanError({
            code: "INTENT_NOT_PREPARABLE",
            message: `Record mutation ${intent.operation} cannot be prepared`,
            cause: intent,
          });
        }

        return yield* preparer(config, intent.parameters, {
          ...context,
          index: context.index + index,
        });
      }),
    );

    const target = prepared[0];

    if (target === undefined || target.data === undefined) {
      return yield* new WritePlanError({
        code: "INVALID_CALL_PLAN",
        message: "setRecords did not produce a resolver call",
        cause: prepared,
      });
    }

    if (
      prepared.some(
        (call) =>
          call.data === undefined ||
          !isAddressEqual(call.to, target.to) ||
          call.protocol !== target.protocol,
      )
    ) {
      return yield* new WritePlanError({
        code: "INVALID_CALL_PLAN",
        message: "All setRecords mutations must target the same resolver and protocol",
        cause: prepared,
      });
    }

    const data = yield* Effect.try({
      try: () =>
        encodeFunctionData({
          abi: publicResolverV1MulticallWithNodeCheckAbi,
          functionName: "multicallWithNodeCheck",
          args: [namehash(name), prepared.map((call) => call.data as `0x${string}`)],
        }),
      catch: (cause) =>
        new ContractError({
          code: "ENCODE_FAILED",
          message: `Unable to encode the setRecords resolver multicall for ${name}`,
          cause,
        }),
    });

    return {
      to: target.to,
      data,
      value: 0n,
      ...(target.protocol === undefined ? {} : { protocol: target.protocol }),
    };
  });

const makeResolverMulticallIntent = (parameters: SetRecordsParameters) =>
  makeWriteIntent<SetRecordsParameters, CallExecutionResult, SetRecordsError>(
    "setRecords",
    parameters,
    resolverMulticallPreparer,
  );

const executeResolverMulticall = Effect.fn("ensforge.setRecords.resolverMulticall")(function* (
  config: EnsforgeConfig,
  parameters: SetRecordsParameters,
) {
  const result = yield* executeSequential(config, {
    calls: [makeResolverMulticallIntent(parameters)],
    ...(parameters.walletClient === undefined ? {} : { walletClient: parameters.walletClient }),
    ...(parameters.account === undefined ? {} : { account: parameters.account }),
    ...(parameters.confirmation === undefined ? {} : { confirmation: parameters.confirmation }),
  });

  const call = result.calls[0];

  if (call === undefined || call.status === "not-started") {
    return yield* new WritePlanError({
      code: "INVALID_CALL_PLAN",
      message: "setRecords did not produce an execution result",
      cause: result,
    });
  }

  return {
    mode: "resolver",
    atomic: true,
    status: call.status,
    call,
  } satisfies ResolverMulticallResult;
});

const setRecordsEffect = Effect.fn("ensforge.setRecords")(function* (
  config: EnsforgeConfig,
  parameters: SetRecordsParameters,
) {
  const aggregate = makeResolverMulticallIntent(parameters);
  const aggregation = parameters.aggregation ?? "auto";

  const useResolverMulticall =
    aggregation === "resolver" ||
    (aggregation === "auto" &&
      Result.isSuccess(
        yield* Effect.result(
          simulateCalls.effect(config, {
            calls: [aggregate],
            ...(parameters.walletClient === undefined
              ? {}
              : { walletClient: parameters.walletClient }),
            ...(parameters.account === undefined ? {} : { account: parameters.account }),
          }),
        ),
      ));

  if (useResolverMulticall) {
    return yield* executeResolverMulticall(config, parameters);
  }

  if (parameters.mode === "sequential" && parameters.atomicity === "required") {
    return yield* new WalletError({
      code: "ATOMICITY_UNAVAILABLE",
      message: "Sequential resolver record writes cannot guarantee atomicity",
      cause: parameters,
    });
  }

  return yield* sendCalls.effect(config, {
    calls: getSetRecordIntents(parameters.name, parameters.records),
    ...(parameters.walletClient === undefined ? {} : { walletClient: parameters.walletClient }),
    ...(parameters.account === undefined ? {} : { account: parameters.account }),
    ...(parameters.mode === undefined ? {} : { mode: parameters.mode }),
    ...(parameters.atomicity === undefined ? {} : { atomicity: parameters.atomicity }),
    ...(parameters.confirmation === undefined ? {} : { confirmation: parameters.confirmation }),
    ...(parameters.capabilities === undefined ? {} : { capabilities: parameters.capabilities }),
  });
});

const action = defineExtendedAction<SetRecordsParameters, SetRecordsResult, SetRecordsError>(
  setRecordsEffect,
);

export const setRecords = Object.freeze(
  Object.defineProperty(action, "call", {
    value: makeResolverMulticallIntent,
    enumerable: true,
    configurable: false,
    writable: false,
  }),
) as SetRecordsAction;

export type {
  ResolverMulticallResult,
  SetRecordInput,
  SetRecordsAction,
  SetRecordsError,
  SetRecordsParameters,
  SetRecordsResult,
} from "./types.js";
