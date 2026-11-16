import { Effect } from "effect";

import type { EnsReadRequest } from "../../action/read-request.js";
import { executeReadRequest } from "../../action/read-request.js";
import type { EnsforgeConfig } from "../../config/config.js";
import type { RpcError } from "../../errors/rpc-error.js";
import { makeReadContext } from "../../internal/read/execute-read.js";
import { ReadContext, type ReadExecutionOptions } from "../../internal/read/execution-context.js";

type ReadRequests = Readonly<Record<string, EnsReadRequest<unknown, unknown>>>;

type ReadRequestSuccess<Request> =
  Request extends EnsReadRequest<infer Success, unknown> ? Success : never;

type ReadRequestFailure<Request> =
  Request extends EnsReadRequest<unknown, infer Failure> ? Failure : never;

export type ReadBatchOptions = ReadExecutionOptions;

export type ReadBatchResult<Requests extends ReadRequests> = {
  readonly [Key in keyof Requests]: ReadRequestSuccess<Requests[Key]>;
};

export type ReadBatchError<Requests extends ReadRequests> =
  | ReadRequestFailure<Requests[keyof Requests]>
  | RpcError;

export type ReadBatchOutcome<Success, Failure> =
  | {
      readonly status: "success";
      readonly value: Success;
    }
  | {
      readonly status: "failure";
      readonly error: Failure;
    };

export type ReadBatchSettledResult<Requests extends ReadRequests> = {
  readonly [Key in keyof Requests]: ReadBatchOutcome<
    ReadRequestSuccess<Requests[Key]>,
    ReadRequestFailure<Requests[Key]>
  >;
};

export interface ReadBatch {
  <const Requests extends ReadRequests>(
    config: EnsforgeConfig,
    requests: Requests,
    options?: ReadBatchOptions,
    runOptions?: Effect.RunOptions,
  ): Promise<ReadBatchResult<Requests>>;

  readonly effect: <const Requests extends ReadRequests>(
    config: EnsforgeConfig,
    requests: Requests,
    options?: ReadBatchOptions,
  ) => Effect.Effect<ReadBatchResult<Requests>, ReadBatchError<Requests>>;
}

export interface ReadBatchSettled {
  <const Requests extends ReadRequests>(
    config: EnsforgeConfig,
    requests: Requests,
    options?: ReadBatchOptions,
    runOptions?: Effect.RunOptions,
  ): Promise<ReadBatchSettledResult<Requests>>;

  readonly effect: <const Requests extends ReadRequests>(
    config: EnsforgeConfig,
    requests: Requests,
    options?: ReadBatchOptions,
  ) => Effect.Effect<ReadBatchSettledResult<Requests>, RpcError>;
}

const getRequestEntries = <const Requests extends ReadRequests>(
  config: EnsforgeConfig,
  requests: Requests,
  context: ReadContext["Service"],
): ReadonlyArray<
  Effect.Effect<readonly [string, unknown], ReadRequestFailure<Requests[keyof Requests]>>
> =>
  Object.entries(requests).map(([key, request]) =>
    executeReadRequest(request, config).pipe(
      Effect.provideService(ReadContext, context),
      Effect.map((value) => [key, value] as const),
    ),
  ) as ReadonlyArray<
    Effect.Effect<readonly [string, unknown], ReadRequestFailure<Requests[keyof Requests]>>
  >;

const readBatchEffect = Effect.fn("ensforge.readBatch")(function* <
  const Requests extends ReadRequests,
>(
  config: EnsforgeConfig,
  requests: Requests,
  options: ReadBatchOptions = {},
): Effect.fn.Return<ReadBatchResult<Requests>, ReadBatchError<Requests>> {
  const context = yield* makeReadContext(config, options);

  yield* Effect.annotateCurrentSpan({
    "ens.network": config.network,
    "ens.read.call_count": Object.keys(requests).length,
    "ens.read.settled": false,
  });

  const entries = yield* Effect.all(getRequestEntries(config, requests, context), {
    concurrency: config.reads.concurrency,
  });

  return Object.fromEntries(entries) as ReadBatchResult<Requests>;
});

const readBatchPromise = <const Requests extends ReadRequests>(
  config: EnsforgeConfig,
  requests: Requests,
  options?: ReadBatchOptions,
  runOptions?: Effect.RunOptions,
): Promise<ReadBatchResult<Requests>> =>
  Effect.runPromise(readBatchEffect(config, requests, options), runOptions);

export const readBatch = Object.freeze(
  Object.defineProperty(readBatchPromise, "effect", {
    value: readBatchEffect,
    enumerable: true,
    configurable: false,
    writable: false,
  }),
) as ReadBatch;

const readBatchSettledEffect = Effect.fn("ensforge.readBatchSettled")(function* <
  const Requests extends ReadRequests,
>(
  config: EnsforgeConfig,
  requests: Requests,
  options: ReadBatchOptions = {},
): Effect.fn.Return<ReadBatchSettledResult<Requests>, RpcError> {
  const context = yield* makeReadContext(config, options);

  yield* Effect.annotateCurrentSpan({
    "ens.network": config.network,
    "ens.read.call_count": Object.keys(requests).length,
    "ens.read.settled": true,
  });

  const settled = Object.entries(requests).map(([key, request]) =>
    executeReadRequest(request, config).pipe(
      Effect.provideService(ReadContext, context),
      Effect.match({
        onFailure: (error) => [key, { status: "failure", error }] as const,
        onSuccess: (value) => [key, { status: "success", value }] as const,
      }),
    ),
  );

  const entries = yield* Effect.all(settled, { concurrency: config.reads.concurrency });

  return Object.fromEntries(entries) as ReadBatchSettledResult<Requests>;
});

const readBatchSettledPromise = <const Requests extends ReadRequests>(
  config: EnsforgeConfig,
  requests: Requests,
  options?: ReadBatchOptions,
  runOptions?: Effect.RunOptions,
): Promise<ReadBatchSettledResult<Requests>> =>
  Effect.runPromise(readBatchSettledEffect(config, requests, options), runOptions);

export const readBatchSettled = Object.freeze(
  Object.defineProperty(readBatchSettledPromise, "effect", {
    value: readBatchSettledEffect,
    enumerable: true,
    configurable: false,
    writable: false,
  }),
) as ReadBatchSettled;
