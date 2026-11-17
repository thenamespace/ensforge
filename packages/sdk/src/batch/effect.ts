import { Cause, Effect, Exit } from "effect";

import { requests as implementations } from "../actions/requests.js";
import type { Client } from "../client/types.js";
import { InvalidInputError } from "../errors/classes/InvalidInputError.js";
import { fromCause } from "../errors/translate/fromCause.js";
import type { AnyError } from "../errors/types.js";
import type { Request } from "../Types.js";
import type { BatchOptions, Requests, Results } from "./types.js";

const run = (client: Client, request: Request): Effect.Effect<unknown, AnyError> => {
  const implementation = implementations[request.path];
  if (implementation === undefined) {
    return Effect.fail(
      new InvalidInputError({
        code: "INVALID_RECORD_VALUE",
        field: "requests",
        input: request.path,
        shortMessage: `${request.path} cannot be batched: it is not a read with \`.request\`.`,
      }),
    );
  }
  return implementation(client, request.options as never) as Effect.Effect<unknown, AnyError>;
};

/**
 * @internal Implementation of `Actions.batch`. Every request runs at once: contract reads made
 * together coalesce into Multicall3 calls (per block), while resolution reads keep their own
 * Universal Resolver call, so CCIP-Read and per-request block options work as they do alone.
 */
export const batch = Effect.fn("ensforge.batch")(function* <
  const requests extends Requests,
  allowFailure extends boolean = true,
>(
  client: Client,
  options: BatchOptions<requests, allowFailure>,
): Effect.fn.Return<{ readonly results: Results<requests, allowFailure> }, AnyError> {
  const settle = options.allowFailure !== false;
  // Settled results also catch defects, so one malformed request cannot sink the batch.
  const effectOf = (request: Request) =>
    settle
      ? Effect.exit(run(client, request)).pipe(
          Effect.map((exit) =>
            Exit.isSuccess(exit)
              ? { status: "success" as const, result: exit.value }
              : {
                  status: "failure" as const,
                  error: fromCause(Cause.squash(exit.cause), { operation: request.path }),
                },
          ),
        )
      : run(client, request);

  const input = options.requests as Requests;
  const results = Array.isArray(input)
    ? yield* Effect.all((input as readonly Request[]).map(effectOf), { concurrency: "unbounded" })
    : yield* Effect.all(
        Object.fromEntries(
          Object.entries(input as Readonly<Record<string, Request>>).map(([key, request]) => [
            key,
            effectOf(request),
          ]),
        ),
        { concurrency: "unbounded" },
      );
  return { results: results as Results<requests, allowFailure> };
});
