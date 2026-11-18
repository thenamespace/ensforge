/**
 * Tagged.
 *
 * @stability stable
 */
export const tagged = 1;

/** Missing its tag. */
export const missing = 2;

/**
 * Renamed by the entry; the declaration's tag counts.
 *
 * @stability experimental
 */
export const renamed = 3;

/**
 * Not a stability.
 *
 * @stability beta
 */
export const unknownStage = 4;

/**
 * A function: the types of its namespace share its tag.
 *
 * @stability stable
 */
export const read = (): string => "";

export declare namespace read {
  /** Shares `read`'s tag. */
  type Options = { readonly name: string };
}

/**
 * A plain namespace: each member needs its own tag.
 *
 * @stability stable
 */
export declare namespace Query {
  /**
   * Tagged.
   *
   * @stability stable
   */
  type Tagged = { readonly limit: number };

  /** Missing its tag. */
  type Untagged = { readonly cursor: string };
}
