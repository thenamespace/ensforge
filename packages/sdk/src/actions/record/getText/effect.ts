import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import * as Action from "../../../internal/action/index.js";
import { readSingleRecord } from "../../../internal/records/single.js";
import type { getText as Promises } from "./index.js";

/** @internal Implementation of `Actions.record.getText`. */
export const getText = Effect.fn("ensforge.record.getText")(
  function* (
    client: Client,
    options: Promises.Options,
  ): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
    return yield* readSingleRecord(
      client,
      { ...options, selection: { texts: [options.key] }, resource: options.key },
      (records) => records.texts?.[options.key] ?? null,
    );
  },
  Action.withContext("record.getText", { contractKind: "resolver" }),
);
