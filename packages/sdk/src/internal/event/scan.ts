import { Effect } from "effect";

import { formatLog, numberToHex, type Address, type Hex, type Log, type RpcLog } from "viem";

import type { Client } from "../../client/types.js";
import { NetworkError } from "../../errors/classes/NetworkError.js";
import type { AnyError } from "../../errors/types.js";
import { fromPromise } from "../rpc/fromPromise.js";

/** One `eth_getLogs` filter: addresses and topics, each position `null` (any) or one-of. */
export type LogQuery = {
  readonly address: readonly Address[];
  readonly topics: readonly (Hex | readonly Hex[] | null)[];
};

/** Block range of a scan, inclusive. */
export type BlockRange = { readonly fromBlock: bigint; readonly toBlock: bigint };

// Providers reject wide ranges with messages like "block range", "query returned more than
// 10000 results" or "up to a 10 block range"; any of them means "split and retry".
const rangeError = /range|limit|too many|more than|exceed|max.*block|block.*max|10000|-32005/i;

const isRangeError = (error: AnyError): boolean =>
  rangeError.test(`${error.shortMessage} ${String((error.cause as Error | undefined)?.message)}`);

/**
 * Fetches the logs matching `queries` over `range`, splitting ranges the provider rejects and
 * remembering the largest span that worked. Fails with `LOG_RANGE_TOO_LARGE` once
 * `maxRequests` would be exceeded, rather than sending thousands of requests.
 */
export const scanLogs = Effect.fnUntraced(function* (
  client: Client,
  queries: readonly LogQuery[],
  range: BlockRange,
  options: { readonly maxRequests?: number | undefined } = {},
): Effect.fn.Return<Log[], AnyError> {
  const maxRequests = options.maxRequests ?? 500;
  let requests = 0;
  let span = range.toBlock - range.fromBlock + 1n;

  const fetch = (query: LogQuery, from: bigint, to: bigint) =>
    fromPromise(
      () =>
        client.publicClient.request({
          method: "eth_getLogs",
          params: [
            {
              address: [...query.address],
              topics: query.topics.map((topic) =>
                topic === null ? null : typeof topic === "string" ? topic : [...topic],
              ),
              fromBlock: numberToHex(from),
              toBlock: numberToHex(to),
            },
          ],
        } as never) as Promise<RpcLog[]>,
    );

  const scan = (query: LogQuery, from: bigint, to: bigint): Effect.Effect<Log[], AnyError> =>
    Effect.gen(function* () {
      if (++requests > maxRequests) {
        return yield* Effect.fail(new NetworkError({ code: "LOG_RANGE_TOO_LARGE" }));
      }
      const result = yield* Effect.result(fetch(query, from, to));
      if (result._tag === "Success") return result.success.map((log) => formatLog(log));

      const error = result.failure;
      if (to === from || !isRangeError(error)) return yield* Effect.fail(error);
      const middle = from + (to - from) / 2n;
      span = middle - from + 1n;
      const left = yield* scan(query, from, middle);
      const right = yield* scan(query, middle + 1n, to);
      return [...left, ...right];
    });

  const logs: Log[] = [];
  for (const query of queries) {
    if (query.address.length === 0) continue;
    // Later chunks use the span the provider accepted, so splits are found only once. Each chunk
    // starts after the previous one, whose range may be wider than the span split down within it.
    for (let from = range.fromBlock; from <= range.toBlock;) {
      const to = from + span - 1n < range.toBlock ? from + span - 1n : range.toBlock;
      logs.push(...(yield* scan(query, from, to)));
      from = to + 1n;
    }
  }

  // One log can match several queries; order by chain position.
  const unique = new Map(logs.map((log) => [`${log.transactionHash}:${log.logIndex}`, log]));
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts a fresh copy
  return [...unique.values()].sort((a, b) =>
    a.blockNumber === b.blockNumber
      ? (a.logIndex ?? 0) - (b.logIndex ?? 0)
      : (a.blockNumber ?? 0n) < (b.blockNumber ?? 0n)
        ? -1
        : 1,
  );
});
