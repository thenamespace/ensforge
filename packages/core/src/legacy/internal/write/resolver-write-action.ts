import { Effect } from "effect";

import type { Hex } from "viem";

import {
  defineWriteAction,
  makeWriteIntent,
  type EnsWriteAction,
  type EnsWriteIntentPreparer,
} from "../../action/write-intent.js";
import type { RecordOperation } from "../../actions/capabilities/types.js";
import type { EnsforgeConfig } from "../../config/config.js";
import { WritePlanError } from "../../errors/write-plan-error.js";
import { dnsEncodeName } from "../../names/dns.js";
import type { NormalizedName } from "../../schemas/name.js";
import type { CallExecutionResult, WriteError } from "../../write/types.js";
import { executeSequential } from "./execute-sequential.js";
import { prepareResolverWrite } from "./prepare-resolver-write.js";

export interface ResolverWriteEncodingContext {
  readonly name: NormalizedName;
  readonly dnsName: Hex;
  readonly permissioned: boolean;
  readonly node: `0x${string}`;
}

export interface ResolverWriteActionDefinition<Parameters extends { readonly name: string }> {
  readonly operation: string;
  readonly records: (parameters: Parameters) => ReadonlyArray<RecordOperation>;
  readonly encode: (
    parameters: Parameters,
    context: ResolverWriteEncodingContext,
  ) => Effect.Effect<Hex, WriteError>;
}

export const makeResolverWriteAction = <Parameters extends { readonly name: string }>(
  definition: ResolverWriteActionDefinition<Parameters>,
): EnsWriteAction<Parameters, CallExecutionResult, WriteError> => {
  const preparer: EnsWriteIntentPreparer<Parameters, WriteError> = Effect.fn(
    `ensforge.${definition.operation}.prepare`,
  )(function* (config, parameters, context) {
    const prepared = yield* prepareResolverWrite(config, {
      name: parameters.name,
      records: definition.records(parameters),
      account: context.account,
    });

    const data = yield* definition.encode(parameters, {
      name: prepared.name,
      node: prepared.target.node,
      dnsName: yield* dnsEncodeName.effect(prepared.name),
      permissioned: prepared.permissioned,
    });

    return {
      to: prepared.target.address,
      data,
      value: 0n,
      protocol: prepared.target.protocol,
    };
  });

  const implementation = Effect.fn(`ensforge.${definition.operation}`)(function* (
    config: EnsforgeConfig,
    parameters: Parameters,
  ) {
    const intent = makeWriteIntent<Parameters, CallExecutionResult, WriteError>(
      definition.operation,
      parameters,
      preparer,
    );

    const result = yield* executeSequential(config, { calls: [intent] });
    const call = result.calls[0];

    if (call === undefined) {
      return yield* new WritePlanError({
        code: "INVALID_CALL_PLAN",
        message: `${definition.operation} did not produce an execution result`,
        cause: result,
      });
    }

    return call;
  });

  return defineWriteAction(definition.operation, implementation, preparer);
};
