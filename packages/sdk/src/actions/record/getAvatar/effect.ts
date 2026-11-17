import { Effect } from "effect";

import type { Address } from "viem";

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
    // The ETH address is read with the record: NFT avatars must belong to it.
    const record = yield* readSingleRecord(
      client,
      { ...options, selection: { texts: ["avatar"], addresses: ["eth"] }, resource: "avatar" },
      (records) => {
        const avatar = (records.texts as Record<string, string | null>).avatar ?? null;
        const owner = (records.addresses as Record<string, Address | null>).eth ?? null;
        return avatar === null ? null : { avatar, owner };
      },
    );
    if (record === null) return null;

    const resolved = resolveAvatar(client, record.avatar, {
      gateways: options.gateways ?? {},
      timeout: options.timeout ?? defaultTimeout,
      owner: record.owner,
    });
    // Without `strict`, an avatar that cannot be loaded (dead gateway, bad metadata) is `null`.
    return yield* options.strict
      ? resolved
      : resolved.pipe(Effect.orElseSucceed(() => null as string | null));
  },
  Action.withContext("record.getAvatar", { contractKind: "resolver" }),
);
