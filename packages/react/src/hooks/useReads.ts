"use client";

import { useContext, useMemo } from "react";

import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/reactivity";

import { readKey } from "../atoms/key.js";
import { ensAtom, settingsOf } from "../atoms/read.js";
import type { Action, ActionError, ActionOptions, ActionValue } from "../atoms/types.js";
import { useEnsforgeContext } from "../provider/context.js";
import { toReadResult, type ReadResult } from "./result.js";
import type { ReadConfig } from "./useRead.js";

/**
 * One read of {@link useReads}: an action and its options.
 *
 * @stability stable
 * @category reads
 * @since 1.0.0
 */
export type ReadSpec = readonly [action: Action, options: unknown];

/**
 * Results of {@link useReads}, in the order of the reads.
 *
 * @stability stable
 * @category reads
 * @since 1.0.0
 */
export type ReadsResult<reads extends readonly ReadSpec[]> = {
  readonly [index in keyof reads]: reads[index] extends readonly [
    infer action extends Action,
    unknown,
  ]
    ? ReadResult<ActionValue<action>, ActionError<action>>
    : never;
};

/**
 * Runs several reads at once; their RPC calls share the client's multicall batches.
 *
 * **When to use**
 *
 * Use for a list of reads whose length changes, such as an avatar per row. For a fixed set,
 * separate hooks read just as well.
 *
 * **Example** (Addresses of several names)
 *
 * ```tsx
 * import { Actions } from "@ensforge/sdk"
 * import { useReads } from "@ensforge/react"
 *
 * function Addresses({ names }: { names: readonly string[] }) {
 *   const results = useReads(names.map((name) => [Actions.record.getAddress, { name }] as const))
 *   return <ul>{results.map((result, index) => <li key={names[index]}>{result.data}</li>)}</ul>
 * }
 * ```
 *
 * @stability stable
 * @category reads
 * @since 1.0.0
 */
export const useReads = <const reads extends readonly ReadSpec[]>(
  reads: reads,
  config: Omit<ReadConfig, "enabled"> = {},
): ReadsResult<reads> => {
  const { client: own, ...freshness } = config;
  const { client, defaults } = useEnsforgeContext(own);
  const registry = useContext(RegistryContext);
  const settings = { ...defaults, ...freshness };
  const atoms = reads.map(([action, options]) =>
    ensAtom(client, action, options as ActionOptions<Action>, settings),
  );

  // One atom over every read, rebuilt only when a read's key or the freshness changes (read
  // atoms are cached per key and freshness, so equal keys mean equal atoms).
  const keys = [
    JSON.stringify(settingsOf(settings)),
    ...reads.map(([action, options]) => readKey(client, action, options)),
  ].join("\n");
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const all = useMemo(() => Atom.make((get) => atoms.map((atom) => get(atom))), [keys]);
  const results = useAtomValue(all);

  return results.map((result, index) =>
    toReadResult(result, () => {
      const atom = atoms[index];
      if (atom !== undefined) registry.refresh(atom);
    }),
  ) as unknown as ReadsResult<reads>;
};
