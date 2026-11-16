import { normalize } from "viem/ens";

import type { IndexedName, NameFilter } from "../../../actions/indexer/models/index.js";
import { IndexerFilterError } from "../../../errors/indexer-filter-error.js";

export interface CompiledNameFilter<Where> {
  readonly where: Where;
  readonly excludesSource: boolean;
  readonly requiresPostFilter: boolean;
}

export type V1NameWhere = Readonly<Record<string, unknown>>;

export type V2NameWhere = Readonly<Record<string, unknown>>;

const searchKey = (field: "name" | "label", mode: "contains" | "starts-with" | "ends-with") => {
  const prefix = field === "name" ? "name" : "labelName";

  switch (mode) {
    case "contains":
      return `${prefix}_contains_nocase`;
    case "starts-with":
      return `${prefix}_starts_with_nocase`;
    case "ends-with":
      return `${prefix}_ends_with_nocase`;
  }
};

const normalizedExactValues = (filter: NameFilter) => {
  try {
    if (filter.label !== undefined && (filter.label.includes(".") || filter.label.length === 0)) {
      throw new Error("Invalid ENS label");
    }

    return {
      name: filter.name === undefined ? undefined : normalize(filter.name),
      label: filter.label === undefined ? undefined : normalize(filter.label),
    };
  } catch {
    throw new IndexerFilterError({
      code: "INVALID_FILTER",
      message: "The exact name or label filter is not a valid ENS value",
    });
  }
};

const sharedWhere = (filter: NameFilter): Record<string, unknown> => {
  const exact = normalizedExactValues(filter);

  return {
    ...(exact.name === undefined ? {} : { name: exact.name }),
    ...(exact.label === undefined ? {} : { labelName: exact.label }),
    ...(filter.search === undefined
      ? {}
      : { [searchKey(filter.search.field, filter.search.mode)]: filter.search.value }),
    ...(filter.resolvedAddress === undefined
      ? {}
      : { resolvedAddress: filter.resolvedAddress.toLowerCase() }),
  };
};

const validateExpiryRange = (filter: NameFilter) => {
  if (
    filter.expiryAfter !== undefined &&
    filter.expiryBefore !== undefined &&
    filter.expiryAfter >= filter.expiryBefore
  ) {
    throw new IndexerFilterError({
      code: "INVALID_FILTER",
      message: "expiryAfter must be less than expiryBefore",
    });
  }
};

export const compileV1NameFilter = (filter: NameFilter): CompiledNameFilter<V1NameWhere> => {
  validateExpiryRange(filter);

  return {
    excludesSource: filter.protocol === "v2" || filter.migrated === true,
    requiresPostFilter: false,
    where: {
      ...sharedWhere(filter),
      ...(filter.owner === undefined
        ? {}
        : {
            or: [
              { owner: filter.owner.toLowerCase() },
              { wrappedOwner: filter.owner.toLowerCase() },
            ],
          }),
      ...(filter.resolver === undefined
        ? {}
        : { resolver_: { address: filter.resolver.toLowerCase() } }),
      ...(filter.expiryAfter === undefined
        ? {}
        : {
            and: [{ or: [{ expiryDate: null }, { expiryDate_gt: filter.expiryAfter.toString() }] }],
          }),
      ...(filter.expiryBefore === undefined
        ? {}
        : { expiryDate_lt: filter.expiryBefore.toString() }),
    },
  };
};

export const compileV2NameFilter = (filter: NameFilter): CompiledNameFilter<V2NameWhere> => {
  validateExpiryRange(filter);

  for (const expiry of [filter.expiryAfter, filter.expiryBefore]) {
    if (expiry !== undefined && expiry > 2_147_483_647n) {
      throw new IndexerFilterError({
        code: "UNSUPPORTED_FILTER",
        message: "The V2 indexer only supports expiry filters within the GraphQL Int range",
      });
    }
  }

  return {
    excludesSource: false,
    // DomainFilter has no null-expiry predicate. Keep those rows and filter locally.
    requiresPostFilter: filter.protocol !== undefined || filter.expiryAfter !== undefined,
    where: {
      ...sharedWhere(filter),
      ...(filter.owner === undefined ? {} : { owner: filter.owner.toLowerCase() }),
      ...(filter.resolver === undefined ? {} : { resolver: filter.resolver.toLowerCase() }),
      ...(filter.migrated === undefined ? {} : { isMigrated: filter.migrated }),
      ...(filter.expiryBefore === undefined ? {} : { expiryDate_lt: Number(filter.expiryBefore) }),
      ...(filter.includeUnreachable === true ? { includeUnreachable: true } : {}),
    },
  };
};

const comparableName = (name: IndexedName): string | null =>
  name.name.kind === "unknown" ? null : name.name.value.toLowerCase();

export const matchesNameFilter = (name: IndexedName, filter: NameFilter): boolean => {
  const value = comparableName(name);

  if (filter.protocol !== undefined && name.protocol !== filter.protocol) return false;

  if (filter.name !== undefined && value !== filter.name.toLowerCase()) return false;

  if (filter.label !== undefined && name.label?.toLowerCase() !== filter.label.toLowerCase()) {
    return false;
  }

  if (filter.owner !== undefined && name.owner.toLowerCase() !== filter.owner.toLowerCase()) {
    return false;
  }

  if (
    filter.resolvedAddress !== undefined &&
    name.resolvedAddress?.toLowerCase() !== filter.resolvedAddress.toLowerCase()
  ) {
    return false;
  }

  if (
    filter.resolver !== undefined &&
    name.resolver?.toLowerCase() !== filter.resolver.toLowerCase()
  ) {
    return false;
  }

  if (filter.migrated !== undefined && name.isMigrated !== filter.migrated) return false;

  if (filter.expiryAfter !== undefined && name.expiry !== null && name.expiry <= filter.expiryAfter)
    return false;

  if (filter.expiryBefore !== undefined && (name.expiry ?? 1n << 256n) >= filter.expiryBefore) {
    return false;
  }

  if (filter.search === undefined) return true;

  const subject = filter.search.field === "name" ? value : (name.label?.toLowerCase() ?? null);

  if (subject === null) return false;

  const search = filter.search.value.toLowerCase();

  switch (filter.search.mode) {
    case "contains":
      return subject.includes(search);
    case "starts-with":
      return subject.startsWith(search);
    case "ends-with":
      return subject.endsWith(search);
  }
};
