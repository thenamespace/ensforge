import { Name } from "@ensforge/sdk";
import type { Ensforge, Write } from "@ensforge/sdk";

/** The names and addresses a read depends on, or a write changes. */
export type Subjects = {
  readonly names: readonly string[];
  readonly addresses: readonly string[];
};

// Option fields that hold a name or an account across the sdk's actions.
const nameFields = ["name", "names", "parent"] as const;
const addressFields = [
  "address",
  "account",
  "owner",
  "newOwner",
  "to",
  "recipient",
  "operator",
  "delegate",
  "grantee",
] as const;

const strings = (value: unknown): readonly string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string");
  return [];
};

const normalized = (name: string): string | undefined =>
  Name.isValid(name) ? Name.normalize(name) : undefined;

const addressOf = (value: unknown): readonly string[] =>
  typeof value === "object" && value !== null && "address" in value
    ? strings((value as { readonly address: unknown }).address)
    : strings(value);

/**
 * Subjects named in an action's options. Encoded labels and invalid names are kept out; the
 * action fails on them anyway.
 *
 * @category invalidation
 * @since 1.0.0
 */
export const subjectsOf = (options: unknown): Subjects => {
  const fields = (options ?? {}) as Readonly<Record<string, unknown>>;
  const names = nameFields.flatMap((field) => strings(fields[field]));
  const addresses = addressFields.flatMap((field) => addressOf(fields[field]));

  return {
    names: [...new Set(names.flatMap((name) => normalized(name) ?? []))],
    addresses: [...new Set(addresses.map((address) => address.toLowerCase()))],
  };
};

/**
 * What a write changes: the names it names, their parents (subname and registry lists), the
 * accounts it names and the signer (primary names, approvals, "my names" lists).
 *
 * @category invalidation
 * @since 1.0.0
 */
export const writeSubjects = (options: unknown, result: Write.Result | undefined): Subjects => {
  const named = subjectsOf(options);
  const parents = named.names.flatMap((name) => Name.getParent(name) ?? []);
  const signer = result?.plan.account;

  return {
    names: [...new Set([...named.names, ...parents])],
    addresses: [
      ...new Set([...named.addresses, ...(signer === undefined ? [] : [signer.toLowerCase()])]),
    ],
  };
};

// Reactivity keys are flat strings: its record form also fires the bare field key, which would
// refresh every read of any name.
const keysOf = (
  client: Ensforge.Client,
  scope: "chain" | "indexer",
  subjects: Subjects,
): string[] => [
  ...subjects.names.map((name) => `ensforge/${scope}/name:${client.chain.id}:${name}`),
  ...subjects.addresses.map((address) => `ensforge/${scope}/address:${client.chain.id}:${address}`),
];

/** Reactivity keys of a read: chain reads and indexer reads are invalidated separately. */
export const readReactivityKeys = (
  client: Ensforge.Client,
  path: string,
  subjects: Subjects,
): readonly string[] => [
  ...keysOf(client, path.startsWith("indexer.") ? "indexer" : "chain", subjects),
  `ensforge/path:${client.chain.id}:${path}`,
];

/** Reactivity keys to invalidate for subjects, in chain or indexer reads. */
export const invalidationKeys = (
  client: Ensforge.Client,
  scope: "chain" | "indexer",
  subjects: Subjects,
): readonly string[] => keysOf(client, scope, subjects);
