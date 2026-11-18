import { Array as Arr, String as Str } from "effect";

import { bytesToHex, bytesToString, hexToBigInt, hexToBytes, type Hex } from "viem";
import {
  labelhash as viemLabelhash,
  namehash as viemNamehash,
  normalize as viemNormalize,
  packetToBytes,
} from "viem/ens";

import { InvalidInputError } from "../errors/classes/InvalidInputError.js";

/** `[<64 hex>]`: a label known only by its labelhash, e.g. from an indexer. */
const encodedLabelPattern = /^\[[0-9a-f]{64}\]$/;

/**
 * Normalizes an ENS name (ENSIP-15).
 *
 * **Details**
 *
 * - `""` is the root name and is returned as-is.
 * - Uses viem's ENSIP-15 normalizer (ENSIP-15 rejects alternative full stops such as `。`).
 * - Encoded labels such as `[af2c…]` (64 hex digits) are kept, so names from indexers round-trip.
 *
 * **Example** (Normalizing user input)
 *
 * ```ts
 * import { Name } from "@ensforge/sdk"
 *
 * Name.normalize("Nick.ETH") // "nick.eth"
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`) when a label cannot be normalized.
 * @stability stable
 * @category names
 * @since 1.0.0
 */
export const normalize = (name: string): string => {
  if (name === "") return "";

  try {
    // ENSIP-15 rejects `[`, so encoded labels are kept as they are and every run of labels
    // between them goes through viem's normalizer as one name.
    const parts: string[] = [];
    let run: string[] = [];
    const flush = () => {
      if (run.length > 0) parts.push(viemNormalize(Arr.join(run, ".")));
      run = [];
    };
    for (const label of Str.split(".")(name)) {
      if (encodedLabelPattern.test(label)) {
        flush();
        parts.push(label);
      } else {
        run.push(label);
      }
    }
    flush();
    return Arr.join(parts, ".");
  } catch (cause) {
    throw new InvalidInputError({ code: "INVALID_NAME", input: name, cause });
  }
};

/**
 * Whether `name` normalizes without error. It may still differ from its normalized form.
 *
 * @stability stable
 * @category names
 * @since 1.0.0
 */
export const isValid = (name: string): boolean => {
  try {
    normalize(name);
    return true;
  } catch {
    return false;
  }
};

/**
 * ENS node (EIP-137 namehash) of a name, normalizing it first.
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`) when the name cannot be normalized.
 * @stability stable
 * @category names
 * @since 1.0.0
 */
export const namehash = (name: string): Hex => viemNamehash(normalize(name));

/**
 * Keccak-256 hash of one label, normalizing it first. Encoded labels return their hash.
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`) when the label is empty, contains a dot or
 * cannot be normalized.
 * @stability stable
 * @category names
 * @since 1.0.0
 */
export const labelhash = (label: string): Hex => {
  if (encodedLabelPattern.test(label)) return viemLabelhash(label);

  try {
    const normalized = viemNormalize(label);
    if (normalized === "" || Str.includes(".")(normalized))
      throw new Error("empty or composite label");
    return viemLabelhash(normalized);
  } catch (cause) {
    throw new InvalidInputError({ code: "INVALID_NAME", input: label, cause });
  }
};

/**
 * DNS wire-format encoding of a name, as the Universal Resolver and ENSv2 registries expect.
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`) when the name cannot be normalized.
 * @stability stable
 * @category names
 * @since 1.0.0
 */
export const dnsEncode = (name: string): Hex => bytesToHex(packetToBytes(normalize(name)));

/**
 * Name from its DNS wire-format encoding, as returned by ENSv2 registries and the Universal
 * Resolver. The labels are returned as stored, without normalizing them.
 *
 * **Example** (Decoding a canonical name)
 *
 * ```ts
 * import { Name } from "@ensforge/sdk"
 *
 * Name.dnsDecode(Name.dnsEncode("nick.eth")) // "nick.eth"
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`) when the bytes are not a DNS-encoded name, or
 * a label contains a dot.
 * @stability stable
 * @category names
 * @since 1.0.0
 */
export const dnsDecode = (data: Hex): string => {
  const bytes = hexToBytes(data);
  const labels: string[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    const length = bytes[offset] ?? 0;
    if (length === 0) {
      if (offset !== bytes.length - 1) break;
      return Arr.join(labels, ".");
    }
    const end = offset + 1 + length;
    if (end > bytes.length) break;
    // A label with a dot would read back as two labels (NameCoder refuses it too).
    const label = bytesToString(bytes.subarray(offset + 1, end));
    if (Str.includes(".")(label)) break;
    labels.push(label);
    offset = end;
  }
  throw new InvalidInputError({ code: "INVALID_NAME", input: data, field: "DNS-encoded name" });
};

/**
 * Parts of a name.
 *
 * @stability stable
 * @category names
 * @since 1.0.0
 */
export type Parsed = {
  /** Normalized labels, leftmost first. */
  readonly labels: readonly string[];
  /** Leftmost label, e.g. `nick` for `nick.eth`. Empty for the root name. */
  readonly label: string;
  /** Top-level domain, e.g. `eth`. Empty for the root name. */
  readonly tld: string;
  /** Parent name, or `null` for top-level names and the root. */
  readonly parent: string | null;
  /** Whether the name is a second-level name such as `nick.eth`. */
  readonly is2ld: boolean;
  /** Whether the name has two or more levels below its TLD, such as `pay.nick.eth`. */
  readonly isSubname: boolean;
};

/**
 * Splits a name into its labels, TLD and parent after normalizing it.
 *
 * **Example** (Parsing a subname)
 *
 * ```ts
 * import { Name } from "@ensforge/sdk"
 *
 * Name.parse("pay.nick.eth")
 * // { labels: ["pay", "nick", "eth"], label: "pay", tld: "eth", parent: "nick.eth", is2ld: false, isSubname: true }
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`) when the name cannot be normalized.
 * @stability stable
 * @category names
 * @since 1.0.0
 */
export const parse = (name: string): Parsed => {
  const normalized = normalize(name);
  const labels = normalized === "" ? [] : Str.split(".")(normalized);

  return {
    labels,
    label: labels[0] ?? "",
    tld: labels.at(-1) ?? "",
    parent: labels.length > 1 ? Arr.join(labels.slice(1), ".") : null,
    is2ld: labels.length === 2,
    isSubname: labels.length > 2,
  };
};

/**
 * Parent of a name, or `null` for top-level names and the root.
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`) when the name cannot be normalized.
 * @stability stable
 * @category names
 * @since 1.0.0
 */
export const getParent = (name: string): string | null => parse(name).parent;

/**
 * Encoded label for a labelhash whose plain label is unknown: `[af2c…]`.
 *
 * @stability stable
 * @category names
 * @since 1.0.0
 */
export const fromLabelhash = (hash: Hex): string => `[${Str.toLowerCase(Str.slice(2)(hash))}]`;

/**
 * ENSv1 `.eth` registrar token ID of a second-level name: the labelhash of its first label as a
 * number. ENSv2 token IDs change over time; read them with `name.getTokenId`.
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`) when the name cannot be normalized.
 * @stability stable
 * @category names
 * @since 1.0.0
 */
export const toTokenId = (name: string): bigint => hexToBigInt(labelhash(parse(name).label));
