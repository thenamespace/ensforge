/* oxlint-disable typescript/no-unsafe-type-assertion -- the cast restores the action's generic, overloaded signature */
import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import * as Action from "../../../internal/action/index.js";
import { normalizeName } from "../../../internal/name/normalize.js";
import { readRecords } from "../../../internal/records/read.js";
import { behindEnsV1Bridge, isEnsV1Bridge } from "../../../internal/resolver/serving.js";
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
    const records = yield* readRecords(client, {
      name,
      selection,
      strict,
      gatewayUrls,
      blockNumber,
      blockTag,
    });
    if (records.resolver === null || !isEnsV1Bridge(client, records.resolver)) return records;

    // The ENSv1 bridge answers for ENSv1 names after the launch: report the ENSv1 resolver it
    // read, as `resolver.get` does. Only bridged names pay this extra read.
    const normalized = yield* normalizeName(name);
    const served = yield* behindEnsV1Bridge(client, normalized, options);
    return { ...records, resolver: served?.address ?? records.resolver };
  },
  Action.withContext("record.get", { contractKind: "resolver" }),
) as <const selection extends Selection>(
  client: Client,
  options: Promises.Options & selection,
) => Effect.Effect<Records<selection>, Promises.ErrorType>;
