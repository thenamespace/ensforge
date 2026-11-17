/** Options for {@link read}; see {@link https://docs.ens.domains}. */
export type ReadOptions = { readonly name: string };

/** Reads {@link ReadOptions.name}, unlike {@link Missing}. */
export const read = (options: ReadOptions): string => options.name;

export declare namespace read {
  /** The same as {@link ReadOptions}, linked by its local name: {@linkcode Options}. */
  type Options = ReadOptions;
}
