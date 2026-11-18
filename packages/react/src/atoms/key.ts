import { Array as Arr, Equal, Hash, Record as Rec, String as Str } from "effect";

import { Name } from "@ensforge/sdk";
import type { Ensforge } from "@ensforge/sdk";
import { isAddress } from "viem";

import type { Action } from "./types.js";

const isPlainObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" &&
  value !== null &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

// Names are keyed by their normalized form, so `Nick.eth` and `nick.eth` share one read.
const normalizedName = (name: unknown): unknown =>
  typeof name === "string" && Name.isValid(name) ? Name.normalize(name) : name;

// Keys are derived synchronously during render from `canonical` output, which is plain JSON data.
/* oxlint-disable effecttsgo/global-json */
const canonical = (value: unknown): unknown => {
  if (typeof value === "bigint") return `${value}n`;
  if (Arr.isArray(value)) return Arr.map(value, canonical);
  if (!isPlainObject(value)) return value;

  const fields = Arr.filter(
    Rec.keys(value),
    (field) =>
      field !== "signal" && value[field] !== undefined && typeof value[field] !== "function",
  );
  const entries = Arr.map(
    Arr.sort(fields, Str.Order),
    (field) => [field, canonical(value[field])] as const,
  );
  return Rec.fromEntries(entries);
};

/**
 * A stable string for an action's options: keys sorted, `undefined`, callbacks and `signal`
 * dropped, the top-level `name`, `names` and `parent` normalized, top-level addresses lowercased
 * and bigints written as `123n`. Nested fields are data (a text record called `name`), kept as
 * given.
 *
 * @stability unstable
 * @category keys
 * @since 1.0.0
 */
export const optionsKey = (options: unknown): string => {
  if (!isPlainObject(options)) return JSON.stringify(canonical(options ?? {}));

  const { name, names, parent } = options;
  // Addresses are keyed lowercase, so a checksummed and a lowercase address share one read.
  const addresses = Arr.flatMap(Rec.toEntries(options), ([field, value]) =>
    typeof value === "string" && isAddress(value, { strict: false })
      ? [[field, Str.toLowerCase(value)] as const]
      : [],
  );
  return JSON.stringify(
    canonical({
      ...options,
      ...Rec.fromEntries(addresses),
      name: normalizedName(name),
      names: Arr.isArray(names) ? Arr.map(names, normalizedName) : names,
      parent: normalizedName(parent),
    }),
  );
};

/**
 * The key a read is cached, hydrated and invalidated under:
 * `ensforge:<chainId>:<account>:<indexer>:<path>:<options>`, with the client's account
 * (lowercase) and indexer key (`Indexer.key`) empty when it has none. It names the client by what changes a
 * read's answer, not by object, so it is the same on the server and in the browser.
 *
 * @stability unstable
 * @category keys
 * @since 1.0.0
 */
export const readKey = (client: Ensforge.Client, action: Action, options: unknown): string =>
  `ensforge:${client.chain.id}:${client.account === undefined ? "" : Str.toLowerCase(client.account)}:${client.config.indexer?.key ?? ""}:${action.path}:${optionsKey(options)}`;

/**
 * Identity of a read: its key and its action. Clients with the same chain, account and indexer
 * share reads; the action is compared by reference, so two actions under one path never swap
 * functions.
 */
export class ReadInput implements Equal.Equal {
  readonly client: Ensforge.Client;
  readonly action: Action;
  readonly options: unknown;
  readonly id: string;

  constructor(client: Ensforge.Client, action: Action, options: unknown) {
    this.client = client;
    this.action = action;
    this.options = options;
    this.id = readKey(client, action, options);
  }

  [Equal.symbol](that: unknown): boolean {
    return that instanceof ReadInput && that.action === this.action && that.id === this.id;
  }

  [Hash.symbol](): number {
    return Hash.string(this.id);
  }
}
