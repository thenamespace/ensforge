import { type Effect, Array as Arr, Record as Rec } from "effect";

import type { Roles } from "@ensforge/contracts";

import type { RecordOperation } from "../../actions/permission/get/types.js";
import type { Selection } from "../../actions/record/get/types.js";
import type { AnyError } from "../../errors/types.js";
import * as CoinType from "../../utils/CoinType.js";
import { tryAny } from "../anyError.js";
import type { RecordWrites } from "../records/write-profiles.js";

/** The PermissionedResolver role each record needs; public keys are not stored there. */
export const recordRoles: Record<
  Exclude<RecordOperation["setRecord"], "pubkey">,
  keyof typeof Roles.resolver
> = {
  text: "setText",
  address: "setAddr",
  contentHash: "setContenthash",
  abi: "setAbi",
  name: "setName",
  interface: "setInterface",
  data: "setData",
  link: "link",
};

/**
 * The record operations a `record.set` write performs. A lone clear also writes a placeholder
 * text on a PermissionedResolver, to give the name a fresh record.
 */
export const writeOperations = (writes: RecordWrites): RecordOperation[] => {
  const operations = writeOperationsOf(writes);
  return writes.clear === true && operations.length === 1
    ? [...operations, { setRecord: "text", key: "description" }]
    : operations;
};

const writeOperationsOf = (writes: RecordWrites): RecordOperation[] => [
  ...Arr.map(Rec.keys(writes.texts ?? {}), (key) => ({ setRecord: "text" as const, key })),
  ...Arr.map(Rec.keys(writes.addresses ?? {}), (key) => ({
    setRecord: "address" as const,
    key: /^\d+$/.test(key) ? BigInt(key) : key,
  })),
  ...(writes.contentHash === undefined ? [] : [{ setRecord: "contentHash" as const }]),
  ...(writes.abi === undefined
    ? []
    : [{ setRecord: "abi" as const, key: writes.abi.contentType ?? 1n }]),
  ...(writes.pubkey === undefined ? [] : [{ setRecord: "pubkey" as const }]),
  ...(writes.nameRecord === undefined ? [] : [{ setRecord: "name" as const }]),
  ...Arr.map(Rec.keys(writes.interfaces ?? {}), (key) => ({
    setRecord: "interface" as const,
    key,
  })),
  ...Arr.map(Rec.keys(writes.data ?? {}), (key) => ({ setRecord: "data" as const, key })),
  ...(writes.clear === true ? [{ setRecord: "link" as const }] : []),
];

type SelectionOperation = {
  readonly path: readonly [string, string?];
  readonly operation: RecordOperation;
};

/**
 * The record operations a `record.get`-style selection asks about, with their output paths. Fails
 * with `INVALID_COIN_TYPE` for an unknown coin.
 */
export const selectionOperations = (
  selection: Selection,
): Effect.Effect<SelectionOperation[], AnyError> =>
  tryAny((): SelectionOperation[] => [
    ...Arr.map(selection.texts ?? [], (key) => ({
      path: ["texts", key] as const,
      operation: { setRecord: "text" as const, key },
    })),
    ...Arr.map(selection.addresses ?? [], (coin) => ({
      path: ["addresses", String(coin)] as const,
      operation: {
        setRecord: "address" as const,
        key: typeof coin === "bigint" ? coin : CoinType.from(coin),
      },
    })),
    ...(selection.contentHash === true
      ? [{ path: ["contentHash"] as const, operation: { setRecord: "contentHash" as const } }]
      : []),
    ...(selection.abi === undefined
      ? []
      : [{ path: ["abi"] as const, operation: { setRecord: "abi" as const } }]),
    ...(selection.pubkey === true
      ? [{ path: ["pubkey"] as const, operation: { setRecord: "pubkey" as const } }]
      : []),
    ...(selection.nameRecord === true
      ? [{ path: ["nameRecord"] as const, operation: { setRecord: "name" as const } }]
      : []),
    ...Arr.map(selection.interfaces ?? [], (id) => ({
      path: ["interfaces", id] as const,
      operation: { setRecord: "interface" as const, key: id },
    })),
    ...Arr.map(selection.data ?? [], (key) => ({
      path: ["data", key] as const,
      operation: { setRecord: "data" as const, key },
    })),
  ]);
