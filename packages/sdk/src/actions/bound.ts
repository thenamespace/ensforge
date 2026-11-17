/** An action with its client argument bound: `ens.record.getText(options)`. */
export type Bound<action extends (client: never, options: never) => unknown> = (
  options: Parameters<action>[1],
) => ReturnType<action>;

/** A write action bound to a client, including `.prepare`, `.simulate` and `.estimateGas`. */
export type BoundWrite<
  action extends ((client: never, options: never) => unknown) & {
    readonly prepare: (client: never, options: never) => unknown;
    readonly simulate: (client: never, options: never) => unknown;
    readonly estimateGas: (client: never, options: never) => unknown;
  },
> = Bound<action> & {
  readonly prepare: Bound<action["prepare"]>;
  readonly simulate: Bound<action["simulate"]>;
  readonly estimateGas: Bound<action["estimateGas"]>;
};
