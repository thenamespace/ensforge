import { Predicate } from "effect";

import { Name } from "@ensforge/sdk";
import type { Ensforge } from "@ensforge/sdk";

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
  // An account option may be a viem account, named by its `address`.
  const addresses = addressFields.flatMap((field) => {
    const value = fields[field];
    return strings(Predicate.hasProperty(value, "address") ? value.address : value);
  });

  return {
    names: [...new Set(names.flatMap((name) => (Name.isValid(name) ? Name.normalize(name) : [])))],
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
export const writeSubjects = (options: unknown, signer: string | undefined): Subjects => {
  const named = subjectsOf(options);
  const parents = named.names.flatMap((name) => Name.getParent(name) ?? []);

  return {
    names: [...new Set([...named.names, ...parents])],
    addresses: [
      ...new Set([...named.addresses, ...(signer === undefined ? [] : [signer.toLowerCase()])]),
    ],
  };
};

const mergeSubjects = (all: readonly Subjects[]): Subjects => ({
  names: [...new Set(all.flatMap((subjects) => subjects.names))],
  addresses: [...new Set(all.flatMap((subjects) => subjects.addresses))],
});

/**
 * Subjects a read's value names, beyond its options: a name it returns (a primary name), and the
 * names and accounts of its fields and list items (an account's names, a name's owner). A write
 * touching one refreshes the read: a primary name when that name's address changes, an account's
 * names when an operator transfers one away.
 */
export const resultSubjects = (value: unknown): Subjects => {
  if (typeof value === "string") return subjectsOf({ name: value });
  if (Array.isArray(value)) return mergeSubjects(value.map(resultSubjects));
  if (!Predicate.isObject(value)) return { names: [], addresses: [] };

  const items =
    Predicate.hasProperty(value, "items") && Array.isArray(value.items) ? value.items : [];
  return mergeSubjects([subjectsOf(value), ...items.map(resultSubjects)]);
};

/**
 * Reactivity keys to invalidate for subjects, in chain or indexer reads. They are flat strings:
 * the record form also fires the bare field key, which would refresh every read of any name.
 */
export const invalidationKeys = (
  client: Ensforge.Client,
  scope: "chain" | "indexer",
  subjects: Subjects,
): readonly string[] => [
  ...subjects.names.map((name) => `ensforge/${scope}/name:${client.chain.id}:${name}`),
  ...subjects.addresses.map((address) => `ensforge/${scope}/address:${client.chain.id}:${address}`),
];

/** Reactivity keys of a read: chain reads and indexer reads are invalidated separately. */
export const readReactivityKeys = (
  client: Ensforge.Client,
  path: string,
  subjects: Subjects,
): readonly string[] => [
  ...invalidationKeys(client, path.startsWith("indexer.") ? "indexer" : "chain", subjects),
  `ensforge/path:${client.chain.id}:${path}`,
];
