import { Schema } from "effect";

import { ConfigError } from "../errors/config-error.js";

const PositiveInteger = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)));

const ReadOptionsSchema = Schema.Struct({
  concurrency: Schema.optional(PositiveInteger),
  multicallBatchSize: Schema.optional(PositiveInteger),
});

export interface ReadOptions {
  readonly concurrency?: number;
  readonly multicallBatchSize?: number;
}

export interface ResolvedReadOptions {
  readonly concurrency: number;
  readonly multicallBatchSize: number;
}

export const defaultReadOptions: ResolvedReadOptions = Object.freeze({
  concurrency: 8,
  multicallBatchSize: 1024,
});

export const resolveReadOptions = (options: ReadOptions | undefined): ResolvedReadOptions => {
  if (options !== undefined && !Schema.is(ReadOptionsSchema)(options)) {
    throw new ConfigError({
      code: "INVALID_READ_OPTIONS",
      message: "Read concurrency and multicall batch size must be positive integers",
    });
  }

  return Object.freeze({
    concurrency: options?.concurrency ?? defaultReadOptions.concurrency,
    multicallBatchSize: options?.multicallBatchSize ?? defaultReadOptions.multicallBatchSize,
  });
};
