import { Array as Arr, String as Str } from "effect";

import type { Hex } from "viem";
import { labelhash } from "viem/ens";

import { dnsEncode, namehash } from "../../utils/Name.js";

/** The hashes and encodings of one normalized, non-root name. */
export type NameParts = {
  readonly name: string;
  readonly label: string;
  readonly labelhash: Hex;
  readonly node: Hex;
  readonly dns: Hex;
  /** Whether the label is known only by its hash (`[af2c…]`); label-keyed reads are skipped. */
  readonly encodedLabel: boolean;
  /** Whether the name is a `.eth` second-level name such as `nick.eth`. */
  readonly isEth2ld: boolean;
};

/** Parts of a name that is already normalized and not the root. */
export const nameParts = (name: string): NameParts => {
  const labels = Str.split(".")(name);
  const [label] = labels;

  return {
    name,
    label,
    labelhash: labelhash(label),
    node: namehash(name),
    dns: dnsEncode(name),
    encodedLabel: Str.startsWith("[")(label),
    isEth2ld: labels.length === 2 && labels[1] === "eth",
  };
};

/** The name without its first label; a single label is returned as it is. */
export const parentOf = (name: string): string => {
  const labels = Str.split(".")(name);
  return labels.length === 1 ? name : Arr.join(Arr.drop(labels, 1), ".");
};
