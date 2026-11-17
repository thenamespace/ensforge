import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import * as Action from "../../../internal/action/index.js";
import { callIndexer } from "../../../internal/indexer/call.js";
import { queryOf } from "../../../internal/indexer/input.js";
import type { lookup as Promises } from "./index.js";

/** @internal Implementation of `Actions.indexer.lookup`. */
export const lookup = Effect.fn("ensforge.indexer.lookup")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
  if (options.inputs.length === 0 || options.inputs.length > 1000) {
    return yield* Effect.fail(
      new InvalidInputError({
        code: "INVALID_RECORD_VALUE",
        field: "inputs",
        input: options.inputs.length,
        shortMessage: "`inputs` must hold 1 to 1,000 names or addresses.",
      }),
    );
  }

  return yield* callIndexer(client, "lookup", queryOf(options));
}, Action.withContext("indexer.lookup"));
