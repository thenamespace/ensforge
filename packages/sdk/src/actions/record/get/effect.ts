import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { readRecords } from "../../../internal/records/read.js";
import type { get as Promises } from "./index.js";
import type { Records, Selection } from "./types.js";

/** @internal Implementation of `Actions.record.get`. */
export const get = Effect.fn("ensforge.record.get")(
  function* (client: Client, options: Promises.Options) {
    const {
      name,
      signal: _signal,
      strict,
      gatewayUrls,
      blockNumber,
      blockTag,
      ...selection
    } = options;
    return yield* readRecords(client, {
      name,
      selection,
      strict,
      gatewayUrls,
      blockNumber,
      blockTag,
    });
  },
  Action.withContext("record.get", { contractKind: "resolver" }),
) as <const selection extends Selection>(
  client: Client,
  options: Promises.Options & selection,
) => Effect.Effect<Records<selection>, AnyError>;
