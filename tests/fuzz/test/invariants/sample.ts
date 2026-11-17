import { hexToBytes, keccak256, toHex } from "viem";

import type { Command } from "../commands/index.ts";

/**
 * Deterministic choices for one step's invariant samples, derived from the step and its command,
 * so a replayed or shrunk sequence samples the same way.
 */
export const sampler = (step: number, command: Command) => {
  const bytes = hexToBytes(keccak256(toHex(`${step}:${JSON.stringify(command)}`)));
  let next = 0;
  return <A>(items: readonly A[]): A =>
    items[(bytes[next++ % bytes.length] ?? 0) % items.length] as A;
};
