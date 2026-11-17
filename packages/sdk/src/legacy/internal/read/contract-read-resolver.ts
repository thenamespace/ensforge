import { Effect, Exit, RequestResolver, Result, Semaphore } from "effect";

import type { PublicClient } from "viem";

import { defaultReadOptions } from "../../config/read-options.js";
import { ContractError } from "../../errors/contract-error.js";
import { viemErrorToEffectError, type ViemError } from "../errors/viem-error.js";
import type { ContractReadRequest } from "./contract-read.js";

export interface ContractReadResolverOptions {
  readonly publicClient: Pick<PublicClient, "multicall">;
  readonly readSemaphore?: Semaphore.Semaphore;
  readonly multicallBatchSize?: number;
}

export type ContractReadResolver = RequestResolver.RequestResolver<ContractReadRequest>;

export const executeContractRead = Effect.fn("executeContractRead")(function* <Success>(
  request: ContractReadRequest<Success>,
  resolver: ContractReadResolver,
): Effect.fn.Return<Success, ViemError> {
  const result = yield* Effect.request(request as ContractReadRequest, resolver);

  return result as Success;
});

export const makeContractReadResolver = ({
  publicClient,
  readSemaphore = Semaphore.makeUnsafe(defaultReadOptions.concurrency),
  multicallBatchSize = defaultReadOptions.multicallBatchSize,
}: ContractReadResolverOptions): ContractReadResolver =>
  RequestResolver.makeGrouped<ContractReadRequest, string>({
    key: ({ request }) => request.groupKey,
    resolver: Effect.fn("ContractReadResolver.resolve")(function* (entries) {
      const uniqueRequests = new Map<
        string,
        {
          readonly request: ContractReadRequest;
          readonly entries: Array<(typeof entries)[number]>;
        }
      >();

      for (const entry of entries) {
        const existing = uniqueRequests.get(entry.request.requestKey);

        if (existing === undefined) {
          uniqueRequests.set(entry.request.requestKey, {
            request: entry.request,
            entries: [entry],
          });
        } else {
          existing.entries.push(entry);
        }
      }

      const unique = Array.from(uniqueRequests.values());
      const first = entries[0].request;
      const chunks: Array<typeof unique> = [];
      let currentChunk: typeof unique = [];
      let currentChunkSize = 0;

      for (const pending of unique) {
        const callSize = (pending.request.callData.length - 2) / 2;

        if (currentChunk.length > 0 && currentChunkSize + callSize > multicallBatchSize) {
          chunks.push(currentChunk);
          currentChunk = [];
          currentChunkSize = 0;
        }

        currentChunk.push(pending);
        currentChunkSize += callSize;
      }

      if (currentChunk.length > 0) chunks.push(currentChunk);

      yield* Effect.annotateCurrentSpan({
        "ens.read.call_count": entries.length,
        "ens.read.unique_call_count": unique.length,
        "ens.read.chunk_count": chunks.length,
      });

      const outcomes = yield* Effect.forEach(
        chunks,
        (chunk) =>
          Effect.result(
            readSemaphore.withPermit(
              Effect.tryPromise({
                try: () =>
                  publicClient.multicall({
                    contracts: chunk.map(({ request }) => request.contract),
                    allowFailure: true,
                    batchSize: 0,
                    ...(first.blockNumber === undefined
                      ? first.blockTag === undefined
                        ? {}
                        : { blockTag: first.blockTag }
                      : { blockNumber: first.blockNumber }),
                    ...(first.account === undefined ? {} : { account: first.account }),
                  }),
                catch: (cause) => viemErrorToEffectError(cause, "multicall"),
              }),
            ),
          ),
        { concurrency: "unbounded" },
      );

      for (const [chunkIndex, chunk] of chunks.entries()) {
        const outcome = outcomes[chunkIndex];

        if (outcome === undefined) continue;

        if (Result.isFailure(outcome)) {
          for (const pending of chunk) {
            for (const entry of pending.entries) {
              entry.completeUnsafe(Exit.fail(outcome.failure));
            }
          }

          continue;
        }

        for (const [resultIndex, pending] of chunk.entries()) {
          const result = outcome.success[resultIndex];
          let exit: Exit.Exit<unknown, ViemError>;

          if (result === undefined) {
            exit = Exit.fail(
              new ContractError({
                code: "DECODE_FAILED",
                message: "Multicall returned fewer results than requested",
                cause: { chunkIndex, resultIndex, requestKey: pending.request.requestKey },
              }),
            );
          } else if (result.status === "failure") {
            exit = Exit.fail(viemErrorToEffectError(result.error, "multicall"));
          } else {
            exit = Exit.succeed(result.result);
          }

          for (const entry of pending.entries) entry.completeUnsafe(exit);
        }
      }
    }),
  }).pipe(RequestResolver.withSpan("ensforge.contractRead.batch"));
