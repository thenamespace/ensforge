import { Formatter } from "effect";

import { hexToBytes, keccak256, toHex } from "viem";

import type { Command } from "../commands/index.ts";
import { pick } from "../model/model.ts";

/**
 * Deterministic choices for one step's invariant samples, derived from the step and its command,
 * so a replayed or shrunk sequence samples the same way.
 */
export const sampler = (step: number, command: Command) => {
  const bytes = hexToBytes(keccak256(toHex(`${step}:${Formatter.formatJson(command)}`)));
  let next = 0;
  return <A>(items: readonly A[]): A => pick(items, bytes[next++ % bytes.length] ?? 0);
};
