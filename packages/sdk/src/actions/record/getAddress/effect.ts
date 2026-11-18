import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { readSingleRecord } from "../../../internal/records/single.js";
import * as CoinType from "../../../utils/CoinType.js";
import type { getAddress as Promises } from "./index.js";

/** @internal Implementation of `Actions.record.getAddress`. */
export const getAddress = Effect.fn("ensforge.record.getAddress")(
  function* (client: Client, options: Promises.Options) {
    const coinType = yield* Effect.try({
      try: () => CoinType.from(options.coin ?? "eth"),
      catch: (error) => error as AnyError,
    });

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
) => Effect.Effect<Promises.ReturnType<coin>, AnyError>;
