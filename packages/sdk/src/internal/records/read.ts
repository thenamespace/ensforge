import { Effect } from "effect";

import type { Address } from "viem";

import type { Selection } from "../../actions/record/get/types.js";
import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { Read } from "../../Types.js";
import { namehash } from "../../utils/Name.js";
import { normalizeName } from "../name/normalize.js";
import { planRecordReads } from "./read-profiles.js";
import { resolveCalls } from "./resolve.js";

/** Reads a selection of records for one name in one Universal Resolver request. */
export const readRecords = Effect.fnUntraced(function* (
  client: Client,
  options: { readonly name: string; readonly selection: Selection } & Pick<
    Read.Options,
    "blockNumber" | "blockTag" | "gatewayUrls" | "strict"
  >,
): Effect.fn.Return<{ readonly resolver: Address | null } & Record<string, unknown>, AnyError> {
  const name = yield* normalizeName(options.name);
  const plan = yield* Effect.try({
    try: () => planRecordReads(namehash(name), options.selection),
    catch: (error) => error as AnyError,
  });
  if (plan.calls.length === 0) {
    return { resolver: null, ...plan.assemble([], yield* plan.codecs) };
  }

  // The codecs load while the resolver answers.
  const [{ resolver, results }, codecs] = yield* Effect.all(
    [resolveCalls(client, { ...options, name, calls: plan.calls }), plan.codecs],
    { concurrency: 2 },
  );
  return { resolver, ...plan.assemble(results, codecs) };
});
