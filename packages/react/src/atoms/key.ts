import { Equal, Hash } from "effect";

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

const canonical = (value: unknown): unknown => {
  if (typeof value === "bigint") return `${value}n`;
  if (Array.isArray(value)) return value.map(canonical);
  if (!isPlainObject(value)) return value;

  const fields = Object.keys(value).filter(
    (field) =>
      field !== "signal" && value[field] !== undefined && typeof value[field] !== "function",
  );
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts a fresh array
  const entries = fields.sort().map((field) => [field, canonical(value[field])]);
  return Object.fromEntries(entries);
};

/**
 * A stable string for an action's options: keys sorted, `undefined`, callbacks and `signal`
 * dropped, the top-level `name`, `names` and `parent` normalized, top-level addresses lowercased
 * and bigints written as `123n`. Nested fields are data (a text record called `name`), kept as
 * given.
 *
 * @category keys
 * @since 1.0.0
 */
export const optionsKey = (options: unknown): string => {
  if (!isPlainObject(options)) return JSON.stringify(canonical(options ?? {}));

  const { name, names, parent } = options;
  // Addresses are keyed lowercase, so a checksummed and a lowercase address share one read.
  const addresses = Object.entries(options).flatMap(([field, value]) =>
    typeof value === "string" && isAddress(value, { strict: false })
      ? [[field, value.toLowerCase()]]
      : [],
  );
  return JSON.stringify(
    canonical({
      ...options,
      ...Object.fromEntries(addresses),
      name: normalizedName(name),
      names: Array.isArray(names) ? names.map(normalizedName) : names,
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
 * @category keys
 * @since 1.0.0
 */
export const readKey = (client: Ensforge.Client, action: Action, options: unknown): string =>
  `ensforge:${client.chain.id}:${client.account?.toLowerCase() ?? ""}:${client.config.indexer?.key ?? ""}:${action.path}:${optionsKey(options)}`;

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
