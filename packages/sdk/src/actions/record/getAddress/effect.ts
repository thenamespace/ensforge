/* oxlint-disable typescript/no-unsafe-type-assertion -- the cast restores the action's generic, overloaded signature */
import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import * as Action from "../../../internal/action/index.js";
import { tryAny } from "../../../internal/anyError.js";
import { readSingleRecord } from "../../../internal/records/single.js";
import * as CoinType from "../../../utils/CoinType.js";
import type { getAddress as Promises } from "./index.js";

/** @internal Implementation of `Actions.record.getAddress`. */
export const getAddress = Effect.fn("ensforge.record.getAddress")(
  function* (client: Client, options: Promises.Options) {
    const coinType = yield* tryAny(() => CoinType.from(options.coin ?? "eth"));

    return yield* readSingleRecord(
      client,
      { ...options, selection: { addresses: [coinType] }, resource: `address ${coinType}` },
      (records) => records.addresses?.[String(coinType)] ?? null,
    );
  },
  Action.withContext("record.getAddress", { contractKind: "resolver" }),
) as <const coin extends CoinType.Input | undefined = undefined>(
  client: Client,
  options: Promises.Options<coin>,
) => Effect.Effect<Promises.ReturnType<coin>, Promises.ErrorType>;
