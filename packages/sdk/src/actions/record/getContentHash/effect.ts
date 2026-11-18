import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { readSingleRecord } from "../../../internal/records/single.js";
import type { getContentHash as Promises } from "./index.js";

/** @internal Implementation of `Actions.record.getContentHash`. */
export const getContentHash = Effect.fn("ensforge.record.getContentHash")(
  function* (
    client: Client,
    options: Promises.Options,
  ): Effect.fn.Return<Promises.ReturnType, AnyError> {
    return yield* readSingleRecord(
      client,
      { ...options, selection: { contentHash: true }, resource: "contenthash" },
      (records) => records.contentHash ?? null,
    );
  },
  Action.withContext("record.getContentHash", { contractKind: "resolver" }),
);
