import { Schema } from "effect";

import { normalize } from "viem/ens";

const isCanonicalName = Schema.makeFilter<string>((value) => {
  if (value === "") return true;

  if (value.startsWith(".") || value.endsWith(".") || value.includes("..")) {
    return "Expected an ENS name without empty labels";
  }

  try {
    return normalize(value) === value || "Expected an ENSIP-15 normalized name";
  } catch {
    return "Expected a valid ENS name";
  }
});

const isCanonicalLabel = Schema.makeFilter<string>((value) => {
  if (value.length === 0) return "Expected a non-empty ENS label";

  if (value.includes(".")) return "Expected one ENS label without dots";

  try {
    return normalize(value) === value || "Expected an ENSIP-15 normalized label";
  } catch {
    return "Expected a valid ENS label";
  }
});

export const NormalizedName = Schema.String.pipe(
  Schema.check(isCanonicalName),
  Schema.brand("NormalizedName"),
);

export type NormalizedName = typeof NormalizedName.Type;

export const NormalizedLabel = Schema.String.pipe(
  Schema.check(isCanonicalLabel),
  Schema.brand("NormalizedLabel"),
);

export type NormalizedLabel = typeof NormalizedLabel.Type;
