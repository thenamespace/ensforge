import { Context, Effect, Predicate, Semaphore } from "effect";

import type { PublicClient } from "viem";

import { getBlockReference, type BlockParameters } from "../../action/block.js";
import { defaultReadOptions } from "../../config/read-options.js";
import { RpcError } from "../../errors/rpc-error.js";
import { viemErrorToEffectError } from "../errors/viem-error.js";
import { makeContractReadResolver, type ContractReadResolver } from "./contract-read-resolver.js";

export type ReadConsistency = "snapshot" | "best-effort";

export type ReadExecutionOptions = BlockParameters & {
  readonly consistency?: ReadConsistency;
};

export type ReadExecutionContext =
  | {
      readonly consistency: "snapshot";
      readonly block: {
        readonly blockNumber: bigint;
        readonly blockTag?: never;
      };
      readonly contractReadResolver: ContractReadResolver;
    }
  | {
      readonly consistency: "best-effort";
      readonly block: BlockParameters;
      readonly contractReadResolver: ContractReadResolver;
    };

export class ReadContext extends Context.Service<ReadContext, ReadExecutionContext>()(
  "@ensforge/core/internal/read/ReadContext",
) {}

export interface ReadExecutionService {
  readonly contractReadResolver: ContractReadResolver;
  readonly makeContext: (
    options?: ReadExecutionOptions,
  ) => Effect.Effect<ReadExecutionContext, RpcError>;
}

export class ReadExecution extends Context.Service<ReadExecution, ReadExecutionService>()(
  "@ensforge/core/internal/read/ReadExecution",
) {}

export interface MakeReadExecutionOptions {
  readonly publicClient: Pick<PublicClient, "getBlock" | "multicall">;
  readonly readSemaphore?: Semaphore.Semaphore;
  readonly multicallBatchSize?: number;
}

export const makeReadExecution = ({
  publicClient,
  readSemaphore = Semaphore.makeUnsafe(defaultReadOptions.concurrency),
  multicallBatchSize = defaultReadOptions.multicallBatchSize,
}: MakeReadExecutionOptions): ReadExecutionService => {
  const contractReadResolver = makeContractReadResolver({
    publicClient,
    readSemaphore,
    multicallBatchSize,
  });

  const makeContext = Effect.fn("ReadExecution.makeContext")(function* (
    options: ReadExecutionOptions = {},
  ): Effect.fn.Return<ReadExecutionContext, RpcError> {
    const consistency = options.consistency ?? "snapshot";

    if (consistency === "best-effort") {
      return Object.freeze({
        consistency,
        block: Object.freeze(getBlockReference(options)),
        contractReadResolver,
      });
    }

    if (options.blockNumber !== undefined) {
      return Object.freeze({
        consistency,
        block: Object.freeze({ blockNumber: options.blockNumber }),
        contractReadResolver,
      });
    }

    const blockTag = options.blockTag ?? "latest";

    if (blockTag === "pending") {
      return yield* new RpcError({
        code: "REQUEST_FAILED",
        message: "Snapshot consistency cannot use the pending block",
        cause: { blockTag },
      });
    }

    const block = yield* readSemaphore.withPermit(
      Effect.tryPromise({
        try: () => publicClient.getBlock({ blockTag }),
        catch: (cause) => viemErrorToEffectError(cause, "getBlock"),
      }),
    );

    if (!Predicate.isBigInt(block.number)) {
      return yield* new RpcError({
        code: "REQUEST_FAILED",
        message: `Unable to resolve the ${blockTag} block to a concrete number`,
        cause: { blockTag, blockNumber: block.number },
      });
    }

    yield* Effect.annotateCurrentSpan({
      "ens.read.consistency": consistency,
      "ens.read.block_number": block.number.toString(),
      "ens.read.block_tag": blockTag,
    });

    return Object.freeze({
      consistency,
      block: Object.freeze({ blockNumber: block.number }),
      contractReadResolver,
    });
  });

  return ReadExecution.of({ contractReadResolver, makeContext });
};
