import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import * as Action from "../../../internal/action/index.js";
import { resolveAvatar } from "../../../internal/avatar/resolve.js";
import { readSingleRecord } from "../../../internal/records/single.js";
import type { getAvatar as Promises } from "./index.js";

const defaultTimeout = 10_000;

/** @internal Implementation of `Actions.record.getAvatar`. */
export const getAvatar = Effect.fn("ensforge.record.getAvatar")(
  function* (
    client: Client,
    options: Promises.Options,
  ): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
    const record = yield* readSingleRecord(
      client,
      { ...options, selection: { texts: ["avatar"] }, resource: "avatar" },
      (records) => (records.texts as Record<string, string | null>).avatar ?? null,
    );
    if (record === null) return null;

    const resolved = resolveAvatar(client, record, {
      gateways: options.gateways ?? {},
      timeout: options.timeout ?? defaultTimeout,
    });
    // Without `strict`, an avatar that cannot be loaded (dead gateway, bad metadata) is `null`.
    return yield* options.strict
      ? resolved
      : resolved.pipe(Effect.orElseSucceed(() => null as string | null));
  },
  Action.withContext("record.getAvatar", { contractKind: "resolver" }),
);
