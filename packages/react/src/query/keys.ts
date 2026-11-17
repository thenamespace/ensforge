import type { Ensforge } from "../legacy/ensforge.js";

export type EnsforgeReactivityKeys = Readonly<Record<string, ReadonlyArray<unknown>>>;

type ParametersWithIdentity = {
  readonly address?: unknown;
  readonly name?: unknown;
  readonly names?: unknown;
};

const stringValues = (value: unknown): ReadonlyArray<string> =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export const queryKeys = {
  all: "ensforge",
  group: (group: string) => `ensforge:${group}`,
  name: "ensforge:name",
  address: "ensforge:address",
} as const;

export const makeReactivityKeys = (
  sdk: Ensforge,
  group: string,
  parameters: unknown,
): EnsforgeReactivityKeys => {
  const keys: Record<string, ReadonlyArray<unknown>> = {
    [queryKeys.all]: [sdk.config.network],
    [queryKeys.group(group)]: [sdk.config.network],
  };

  if (typeof parameters !== "object" || parameters === null) return keys;

  const identity = parameters as ParametersWithIdentity;

  if (typeof identity.name === "string") {
    keys[queryKeys.name] = [`${sdk.config.network}:${identity.name}`];
  }

  if (typeof identity.address === "string") {
    keys[queryKeys.address] = [`${sdk.config.network}:${identity.address.toLowerCase()}`];
  }

  const names = stringValues(identity.names);

  if (names.length > 0) {
    keys[queryKeys.name] = names.map((name) => `${sdk.config.network}:${name}`);
  }

  return keys;
};
