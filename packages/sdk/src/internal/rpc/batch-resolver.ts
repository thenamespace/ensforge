import { Effect, Exit, Request, RequestResolver, Array as Arr } from "effect";

import type { Abi, Address, BlockTag, Hex } from "viem";
import { multicall } from "viem/actions";

import { stateOf, type State } from "../../client/state.js";
import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import { toAnyError, Untranslated } from "../anyError.js";

/** One contract read waiting to be batched. */
export class ContractRead extends Request.Class<
  {
    readonly address: Address;
    readonly abi: Abi;
    readonly functionName: string;
    readonly args: readonly unknown[];
    /** Encoded calldata, used to dedupe and size chunks. */
    readonly callData: Hex;
    readonly blockNumber: bigint | undefined;
    /** Resolved block tag; ignored when `blockNumber` is set. */
    readonly blockTag: BlockTag;
  },
  unknown,
  AnyError
> {}

/** Splits reads into chunks of at most `batchSize` calldata bytes; a larger read goes alone. */
const chunk = <entry extends { readonly request: ContractRead }>(
  entries: readonly entry[],
  batchSize: number,
): entry[][] => {
  const chunks: entry[][] = [];
  let current: entry[] = [];
  let size = 0;

  for (const entry of entries) {
    const callSize = (entry.request.callData.length - 2) / 2;
    if (current.length > 0 && size + callSize > batchSize) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(entry);
    size += callSize;
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
};

const makeResolver = (client: Client, batchSize: number, wait: number) =>
  RequestResolver.makeGrouped<ContractRead, string>({
    key: ({ request }) =>
      request.blockNumber === undefined
        ? `tag:${request.blockTag}`
        : `number:${request.blockNumber}`,
    resolver: Effect.fnUntraced(function* (entries) {
      const [first] = entries;
      const block =
        first.request.blockNumber === undefined
          ? { blockTag: first.request.blockTag }
          : { blockNumber: first.request.blockNumber };

      yield* Effect.forEach(
        chunk(entries, batchSize),
        (group) =>
          Effect.tryPromise({
            try: () =>
              multicall(client.client(), {
                contracts: Arr.map(group, ({ request }) => ({
                  address: request.address,
                  abi: request.abi,
                  functionName: request.functionName,
                  args: request.args,
                })),
                allowFailure: true,
                batchSize: 0,
                ...block,
              }),
            catch: (cause) => new Untranslated({ cause }),
          }).pipe(
            Effect.matchEffect({
              onFailure: (failure) =>
                Effect.map(toAnyError(failure.cause), (error) => {
                  for (const entry of group) entry.completeUnsafe(Exit.fail(error));
                }),
              onSuccess: (results) =>
                Effect.forEach(
                  group.entries(),
                  ([index, entry]) => {
                    const result = results[index];
                    return result?.status === "success"
                      ? Effect.sync(() => entry.completeUnsafe(Exit.succeed(result.result)))
                      : Effect.map(
                          toAnyError(result?.error, { contract: entry.request.address }),
                          (error) => entry.completeUnsafe(Exit.fail(error)),
                        );
                  },
                  { concurrency: "unbounded", discard: true },
                ),
            }),
          ),
        { concurrency: "unbounded", discard: true },
      );
    }),
  }).pipe(wait > 0 ? RequestResolver.setDelay(wait) : (resolver) => resolver);

// One resolver per client, shared by its `extend` copies: Effect collects requests per resolver
// object, including requests from separate Promise calls made in the same tick.
const resolvers = new WeakMap<State, RequestResolver.RequestResolver<ContractRead>>();

/** The multicall batch resolver of a client, created on first use. */
export const resolverOf = (client: Client, batchSize: number, wait: number) => {
  const state = stateOf(client);
  const existing = state === undefined ? undefined : resolvers.get(state);
  if (existing !== undefined) return existing;

  const resolver = makeResolver(client, batchSize, wait);
  if (state !== undefined) resolvers.set(state, resolver);
  return resolver;
};
