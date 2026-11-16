import { Effect, Schema } from "effect";

import { isAddressEqual, keccak256, stringToHex } from "viem";

import { defineAction } from "../../../action/action.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { CodecError } from "../../../errors/codec-error.js";
import { WritePlanError } from "../../../errors/write-plan-error.js";
import { withWorkflow } from "../../../internal/workflows/run.js";
import { namehash } from "../../../names/hashes.js";
import { normalizeName } from "../../../names/normalize.js";
import { EthereumAddress } from "../../../schemas/identity.js";
import type { EnsProtocol } from "../../../schemas/protocol.js";
import type { WritePlan, WriteStage } from "../../../write/types.js";
import { executeWritePlan } from "../../batch/execute-write-plan.js";
import { simulateCalls } from "../../batch/simulate-calls.js";
import { getResolverCapabilities } from "../../capabilities/get-resolver-capabilities/index.js";
import { getProtocol } from "../../name/get-protocol/index.js";
import { getSetRecordIntents } from "../../records/set-records/index.js";
import { createResolver, predictResolverAddress } from "../create-resolver/index.js";
import { setResolver } from "../set-resolver/index.js";
import type {
  ResolverSource,
  SetResolverAndRecordsError,
  SetResolverAndRecordsParameters,
  SetResolverAndRecordsProgress,
  SetResolverAndRecordsResult,
} from "./types.js";

interface ResolverSelection {
  readonly protocol: EnsProtocol;
  readonly resolver: typeof EthereumAddress.Type;
  readonly resolverSource: ResolverSource;
}

const decodeResolver = (resolver: string, name: string) =>
  Effect.try({
    try: () => Schema.decodeUnknownSync(EthereumAddress)(resolver),
    catch: () =>
      new CodecError({
        code: "INVALID_ADDRESS",
        message: `Invalid resolver address for ${name}`,
      }),
  });

const selectResolver = Effect.fn("ensforge.setResolverAndRecords.selectResolver")(function* (
  config: EnsforgeConfig,
  parameters: SetResolverAndRecordsParameters,
  name: string,
): Effect.fn.Return<ResolverSelection, SetResolverAndRecordsError> {
  if (parameters.resume !== undefined) {
    const protocol = yield* getProtocol.effect(config, { name });
    const resolver = yield* decodeResolver(parameters.resume.resolver, name);

    const suppliedResolver =
      parameters.resolver === undefined
        ? resolver
        : yield* decodeResolver(parameters.resolver, name);

    if (protocol !== parameters.resume.protocol || !isAddressEqual(resolver, suppliedResolver)) {
      return yield* new WritePlanError({
        code: "INVALID_CALL_PLAN",
        message: "Resolver workflow progress does not match the supplied parameters",
        cause: parameters.resume,
      });
    }

    return {
      protocol,
      resolver,
      resolverSource: parameters.resume.resolverSource,
    };
  }

  const [protocol, capabilities] = yield* Effect.all(
    [
      getProtocol.effect(config, { name }),
      getResolverCapabilities.effect(config, { name }),
    ] as const,
    { concurrency: "unbounded" },
  );

  if (parameters.resolver !== undefined) {
    const resolver = yield* decodeResolver(parameters.resolver, name);

    return {
      protocol,
      resolver,
      resolverSource:
        capabilities.address !== null &&
        !capabilities.inherited &&
        isAddressEqual(capabilities.address, resolver)
          ? "existing"
          : "provided",
    };
  }

  const compatible =
    capabilities.address !== null &&
    !capabilities.inherited &&
    capabilities.authorization !== "none" &&
    capabilities.authorization !== "unknown";

  if (compatible && capabilities.address !== null) {
    return { protocol, resolver: capabilities.address, resolverSource: "existing" };
  }

  if (protocol === "v1") {
    const deployment = config.deployments.v1;

    if (deployment === undefined) {
      return yield* new WritePlanError({
        code: "INVALID_CALL_PLAN",
        message: "The active deployment does not include an ENSv1 Public Resolver",
        cause: config.deployments,
      });
    }

    return {
      protocol,
      resolver: deployment.contracts.publicResolver,
      resolverSource: "selected",
    };
  }

  const resolver = yield* predictResolverAddress.effect(config, {
    salt: parameters.salt ?? BigInt(namehash(name)),
    ...(parameters.admin === undefined ? {} : { admin: parameters.admin }),
    ...(parameters.roles === undefined ? {} : { roles: parameters.roles }),
    ...(parameters.setters === undefined ? {} : { setters: parameters.setters }),
    ...(parameters.walletClient === undefined ? {} : { walletClient: parameters.walletClient }),
    ...(parameters.account === undefined ? {} : { account: parameters.account }),
  });

  return { protocol, resolver, resolverSource: "deployed" };
});

const makePlanId = (
  name: string,
  selection: ResolverSelection,
  parameters: SetResolverAndRecordsParameters,
) =>
  `setResolverAndRecords:${keccak256(
    stringToHex(
      JSON.stringify(
        {
          name,
          ...selection,
          salt: parameters.salt,
          admin: parameters.admin,
          roles: parameters.roles,
          setters: parameters.setters,
          records: parameters.records,
        },
        (_key, value: unknown) => (typeof value === "bigint" ? value.toString() : value),
      ),
    ),
  )}`;

const makePlan = (
  name: string,
  selection: ResolverSelection,
  parameters: SetResolverAndRecordsParameters,
): WritePlan => {
  const stages: Array<WriteStage> = [];

  if (selection.resolverSource === "deployed") {
    stages.push({
      type: "calls",
      id: "create-resolver",
      calls: [
        createResolver.call({
          salt: parameters.salt ?? BigInt(namehash(name)),
          ...(parameters.admin === undefined ? {} : { admin: parameters.admin }),
          ...(parameters.roles === undefined ? {} : { roles: parameters.roles }),
          ...(parameters.setters === undefined ? {} : { setters: parameters.setters }),
        }),
      ],
      mode: "sequential",
      atomicity: "none",
      confirmation: { type: "confirmed" },
    });
  }

  if (selection.resolverSource !== "existing") {
    stages.push({
      type: "calls",
      id: "set-resolver",
      calls: [setResolver.call({ name, resolver: selection.resolver })],
      mode: "sequential",
      atomicity: "none",
      confirmation: { type: "confirmed" },
    });
  }

  stages.push({
    type: "calls",
    id: "set-records",
    calls: getSetRecordIntents(name, parameters.records),
    mode: "auto",
    atomicity: "preferred",
    confirmation: parameters.confirmation ?? { type: "confirmed" },
  });

  return { id: makePlanId(name, selection, parameters), stages };
};

const implementation = Effect.fn("ensforge.setResolverAndRecords")(function* (
  config: EnsforgeConfig,
  parameters: SetResolverAndRecordsParameters,
): Effect.fn.Return<SetResolverAndRecordsResult, SetResolverAndRecordsError> {
  const name = yield* normalizeName.effect(parameters.name);

  if (parameters.records.length === 0) {
    return yield* new WritePlanError({
      code: "INVALID_CALL_PLAN",
      message: "setResolverAndRecords requires at least one record mutation",
      cause: parameters.records,
    });
  }

  const selection = yield* selectResolver(config, parameters, name);

  if (parameters.resume === undefined && selection.resolverSource !== "existing") {
    yield* simulateCalls.effect(config, {
      calls: [setResolver.call({ name, resolver: selection.resolver })],
      ...(parameters.walletClient === undefined ? {} : { walletClient: parameters.walletClient }),
      ...(parameters.account === undefined ? {} : { account: parameters.account }),
    });
  }

  const write = yield* executeWritePlan.effect(config, {
    plan: makePlan(name, selection, parameters),
    ...(parameters.resume === undefined ? {} : { resume: parameters.resume.write }),
    ...(parameters.walletClient === undefined ? {} : { walletClient: parameters.walletClient }),
    ...(parameters.account === undefined ? {} : { account: parameters.account }),
  });

  return { ...selection, write } satisfies SetResolverAndRecordsProgress;
});

export const setResolverAndRecords = defineAction<
  SetResolverAndRecordsParameters,
  SetResolverAndRecordsResult,
  SetResolverAndRecordsError
>(withWorkflow("setResolverAndRecords", implementation));

export type {
  ResolverSource,
  SetResolverAndRecordsError,
  SetResolverAndRecordsParameters,
  SetResolverAndRecordsProgress,
  SetResolverAndRecordsResult,
} from "./types.js";
