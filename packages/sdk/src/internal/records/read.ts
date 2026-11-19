import { Effect } from "effect";

import type { Address, Hex } from "viem";

import type { Selection } from "../../actions/record/get/types.js";
import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { Read } from "../../Types.js";
import type { Decoded as ContentHash } from "../../utils/ContentHash.js";
import { namehash } from "../../utils/Name.js";
import { tryAny } from "../anyError.js";
import { normalizeName } from "../name/normalize.js";
import type { AbiRecord } from "./abi-record.js";
import { planRecordReads } from "./read-profiles.js";
import { resolveCalls } from "./resolve.js";

/**
 * Records read for a selection: each field exists only when selected (`record.get` narrows it to
 * the selection for callers).
 */
export type ReadRecords = {
  readonly resolver: Address | null;
  readonly texts?: Readonly<Record<string, string | null>>;
  readonly addresses?: Readonly<Record<string, string | null>>;
  readonly contentHash?: ContentHash | null;
  readonly abi?: AbiRecord | null;
  readonly pubkey?: { readonly x: Hex; readonly y: Hex } | null;
  readonly nameRecord?: string | null;
  readonly interfaces?: Readonly<Record<Hex, Address | null>>;
  readonly data?: Readonly<Record<string, Hex | null>>;
};

/** Reads a selection of records for one name in one Universal Resolver request. */
export const readRecords = Effect.fnUntraced(function* (
  client: Client,
  options: { readonly name: string; readonly selection: Selection } & Pick<
    Read.Options,
    "blockNumber" | "blockTag" | "gatewayUrls" | "strict"
  >,
): Effect.fn.Return<ReadRecords, AnyError> {
  const name = yield* normalizeName(options.name);
  const plan = yield* tryAny(() => planRecordReads(namehash(name), options.selection));
  if (plan.calls.length === 0) {
    const codecs = yield* plan.codecs;
    return { resolver: null, ...plan.assemble([], codecs) };
  }

  // The codecs load while the resolver answers.
  const [{ resolver, results }, codecs] = yield* Effect.all(
    [resolveCalls(client, { ...options, name, calls: plan.calls }), plan.codecs],
    { concurrency: 2 },
  );
  return { resolver, ...plan.assemble(results, codecs) };
});
