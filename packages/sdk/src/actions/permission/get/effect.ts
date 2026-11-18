import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { loadName } from "../../../internal/name/load.js";
import { checkedAccount, checkLoaded } from "../../../internal/permission/check.js";
import { selectionOperations } from "../../../internal/permission/records.js";
import * as Fuse from "../../../utils/Fuse.js";
import type { get as Promises } from "./index.js";
import type { NameOperation } from "./types.js";

const nameOperations: readonly NameOperation[] = [
  "transfer",
  "setResolver",
  "setSubregistry",
  "createSubname",
  "removeSubname",
  "renew",
  "setTtl",
  "setManager",
  "reclaim",
];

/** @internal Implementation of `Actions.permission.get`. */
export const get = Effect.fn("ensforge.permission.get")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, AnyError> {
  const account = yield* checkedAccount(client, options.account);
  const loaded = yield* loadName(client, options.name, options);
  const records = options.records === undefined ? [] : yield* selectionOperations(options.records);

  // Any-key text access stands for "can edit records" in general.
  const checks = yield* checkLoaded(client, loaded, account, [
    ...nameOperations,
    { setRecord: "text" },
    ...records.map((record) => record.operation),
  ]);
  const can = Object.fromEntries(
    nameOperations.map((operation, index) => [operation, checks[index]?.allowed ?? null]),
  ) as Record<NameOperation, boolean | null>;

  const recordAccess: Record<string, unknown> = {};
  for (const [index, { path }] of records.entries()) {
    const allowed = checks[nameOperations.length + 1 + index]?.allowed ?? null;
    const [field, key] = path;
    if (key === undefined) recordAccess[field] = allowed;
    else recordAccess[field] = { ...(recordAccess[field] as object | undefined), [key]: allowed };
  }

  const fuses = loaded.state.wrapped ? Fuse.decode(loaded.data.v1?.wrapper.fuses ?? 0) : undefined;
  return {
    account,
    status: loaded.state.status,
    can: { ...can, setRecords: checks[nameOperations.length]?.allowed ?? null },
    ...(options.records === undefined ? {} : { records: recordAccess }),
    fuses:
      fuses === undefined ? [] : (Object.keys(fuses) as Fuse.Name[]).filter((fuse) => fuses[fuse]),
  };
}, Action.withContext("permission.get"));
