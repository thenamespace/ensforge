import { Equal, Hash } from "effect";

import { Name } from "@ensforge/sdk";
import type { Ensforge } from "@ensforge/sdk";

import type { Action } from "./types.js";

const isPlainObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" &&
  value !== null &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

// Names are keyed by their normalized form, so `Nick.eth` and `nick.eth` share one read.
const normalizedName = (name: string): string => (Name.isValid(name) ? Name.normalize(name) : name);

const canonical = (value: unknown, key?: string): unknown => {
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "string" && key === "name") return normalizedName(value);
  if (Array.isArray(value))
    return value.map((item) =>
      typeof item === "string" && key === "names" ? normalizedName(item) : canonical(item),
    );
  if (!isPlainObject(value)) return value;

  const fields = Object.keys(value).filter(
    (field) =>
      field !== "signal" && value[field] !== undefined && typeof value[field] !== "function",
  );
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts a fresh array
  const entries = fields.sort().map((field) => [field, canonical(value[field], field)]);
  return Object.fromEntries(entries);
};

/**
 * A stable string for an action's options: keys sorted, `undefined`, callbacks and `signal`
 * dropped, names normalized and bigints written as `123n`.
 *
 * @category keys
 * @since 1.0.0
 */
export const optionsKey = (options: unknown): string => JSON.stringify(canonical(options ?? {}));

/**
 * The key a read is cached, hydrated and invalidated under: `ensforge:<chainId>:<path>:<options>`.
 * It is the same on the server and the client, whatever client object produced it.
 *
 * @category keys
 * @since 1.0.0
 */
export const readKey = (client: Ensforge.Client, action: Action, options: unknown): string =>
  `ensforge:${client.chain.id}:${action.path}:${optionsKey(options)}`;

/** Identity of a read atom: the client, the read key and its freshness settings. */
export class ReadInput implements Equal.Equal {
  readonly client: Ensforge.Client;
  readonly action: Action;
  readonly options: unknown;
  readonly freshness: string;
  readonly id: string;

  constructor(client: Ensforge.Client, action: Action, options: unknown, freshness: string) {
    this.client = client;
    this.action = action;
    this.options = options;
    this.freshness = freshness;
    this.id = readKey(client, action, options);
  }

  [Equal.symbol](that: unknown): boolean {
    return (
      that instanceof ReadInput &&
      that.client === this.client &&
      that.id === this.id &&
      that.freshness === this.freshness
    );
  }

  [Hash.symbol](): number {
    return Hash.string(`${this.id}|${this.freshness}`);
  }
}
