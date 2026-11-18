import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { sameAddress } from "../../../internal/address.js";
import { requireAddress } from "../../../internal/name/write.js";
import { fromPromise } from "../../../internal/rpc/fromPromise.js";
import { hasChain } from "../../../internal/write/chain.js";
import type { list as Promises } from "./index.js";

/** @internal Implementation of `Actions.plan.list`. */
export const list = Effect.fn("ensforge.plan.list")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, AnyError> {
  const account =
    options.account === undefined ? undefined : yield* requireAddress(options.account, "account");
  const records = yield* fromPromise(() => client.config.storage.list());

  const matching = records.filter(
    (record) =>
      hasChain(client, record.plan.chainId) &&
      (options.status === undefined || record.status === options.status) &&
      (account === undefined || sameAddress(record.plan.account, account)),
  );
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts a fresh array
  return matching.sort((a, b) => b.updatedAt - a.updatedAt);
}, Action.withContext("plan.list"));
