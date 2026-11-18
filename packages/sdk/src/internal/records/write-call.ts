import { Effect } from "effect";

import type { Address } from "viem";

import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import { toAnyError } from "../anyError.js";
import type { NameParts } from "../name/parts.js";
import { setterKeying, type SetterKeying } from "./setter-keying.js";
import {
  encodeRecordWrites,
  recordWriteCodecs,
  resolverCall,
  type RecordWrites,
} from "./write-profiles.js";

/**
 * The call that writes `records` for `name` on a resolver of any kind. `keying` skips detection,
 * for a resolver deployed earlier in the same plan.
 */
export const recordsCall = Effect.fnUntraced(function* (
  client: Client,
  resolver: Address,
  name: NameParts,
  records: RecordWrites,
  keying?: SetterKeying,
): Effect.fn.Return<Plan.Call, AnyError> {
  const setters = keying ?? (yield* setterKeying(client, resolver));
  const codecs = yield* recordWriteCodecs(records);
  const calls = yield* Effect.try({
    try: () => encodeRecordWrites(setters, name, records, codecs),
    catch: toAnyError,
  });
  return resolverCall(resolver, calls);
});
