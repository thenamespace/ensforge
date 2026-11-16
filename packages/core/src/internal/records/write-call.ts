import { Effect } from "effect";

import type { Address } from "viem";

import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import type { NameParts } from "../name/parts.js";
import { setterKeying } from "./setter-keying.js";
import { encodeRecordWrites, resolverCall, type RecordWrites } from "./write-profiles.js";

/** The call that writes `records` for `name` on an existing resolver of any kind. */
export const recordsCall = Effect.fnUntraced(function* (
  client: Client,
  resolver: Address,
  name: NameParts,
  records: RecordWrites,
): Effect.fn.Return<Plan.Call, AnyError> {
  const keying = yield* setterKeying(client, resolver);
  const calls = yield* Effect.try({
    try: () => encodeRecordWrites(keying, name, records),
    catch: (error) => error as AnyError,
  });
  return resolverCall(resolver, calls);
});
