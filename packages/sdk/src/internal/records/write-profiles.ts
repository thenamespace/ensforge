import { Array as Arr, Record as Rec } from "effect";

import { Abis } from "@ensforge/contracts";
import {
  encodeFunctionData,
  isAddress,
  isHex,
  stringToHex,
  zeroAddress,
  zeroHash,
  type Abi,
  type Address,
  type Hex,
} from "viem";

import type { ResolverProfiles } from "../../actions/resolver/get/types.js";
import { InvalidInputError } from "../../errors/classes/InvalidInputError.js";
import { UnsupportedError } from "../../errors/classes/UnsupportedError.js";
import type { Plan } from "../../plan/Plan.js";
import * as CoinType from "../../utils/CoinType.js";
import { loadRecordCodecs, type RecordCodecs } from "./codecs.js";
import type { SetterKeying } from "./setter-keying.js";

/** Records to write; `null` deletes one. */
export type RecordWrites = {
  readonly texts?: Readonly<Record<string, string | null>> | undefined;
  readonly addresses?: Readonly<Record<string, string | null>> | undefined;
  readonly contentHash?: string | null | undefined;
  /** An encoded content hash, written as is: one copied from a resolver, whose codec may be unknown. */
  readonly contentHashBytes?: Hex | undefined;
  readonly abi?:
    | {
        readonly contentType?: bigint | undefined;
        // oxlint-disable-next-line typescript/no-redundant-type-constituents -- `Hex` documents that hex is stored as given
        readonly value: Abi | Hex | string | null;
      }
    | undefined;
  /**
   * Internal: the content types a `{ value: null }` ABI without `contentType` clears, read from
   * the resolver (every stored type). Type 1 when not given.
   */
  readonly abiContentTypes?: readonly bigint[] | undefined;
  readonly pubkey?: { readonly x: Hex; readonly y: Hex } | null | undefined;
  readonly nameRecord?: string | null | undefined;
  readonly interfaces?: Readonly<Record<Hex, Address | null>> | undefined;
  readonly data?: Readonly<Record<string, Hex | null>> | undefined;
  readonly clear?: boolean | undefined;
};

/** Coin by symbol (`btc`) or decimal coin type (`2147492101`). */
const coinTypeOf = (key: string): bigint => (/^\d+$/.test(key) ? BigInt(key) : CoinType.from(key));

/**
 * The codecs `encodeRecordWrites` needs for `writes`: their coins' address codecs and, when a
 * content hash is set, the content-hash codec.
 */
export const recordWriteCodecs = (writes: RecordWrites) =>
  loadRecordCodecs({
    // Unknown coin names are left out here; encoding then rejects them with their own error.
    coinTypes: Arr.flatMap(Rec.keys(writes.addresses ?? {}), (key) => {
      try {
        return [coinTypeOf(key)];
      } catch {
        return [];
      }
    }),
    contentHash: writes.contentHash !== undefined && writes.contentHash !== null,
    abiEncode:
      writes.abi !== undefined &&
      typeof writes.abi.value === "object" &&
      writes.abi.value !== null &&
      (writes.abi.contentType === 2n || writes.abi.contentType === 4n),
  });

/**
 * Encodes resolver setter calls for `writes`. Node-based resolvers take the node; the ENSv2
 * PermissionedResolver takes the DNS-encoded name and has no pubkey or `clearRecords`.
 * Throws `InvalidInputError` / `UnsupportedError` for invalid or unsupported writes.
 */
export const encodeRecordWrites = (
  keying: SetterKeying,
  target: { readonly node: Hex; readonly dns: Hex },
  writes: RecordWrites,
  codecs: RecordCodecs,
): Hex[] => {
  const byName = keying === "name";
  const calls: Hex[] = [];

  if (writes.clear === true) {
    // A PermissionedResolver has no `clearRecords`: linking the name to record 0 detaches it from
    // its record, and the setters below allocate a fresh one.
    calls.push(
      byName
        ? encodeFunctionData({
            abi: Abis.v2.permissionedResolver,
            functionName: "linkToRecord",
            args: [target.dns, 0n],
          })
        : encodeFunctionData({
            abi: Abis.v1.publicResolver,
            functionName: "clearRecords",
            args: [target.node],
          }),
    );
  }

  for (const [key, value] of Rec.toEntries(writes.texts ?? {})) {
    calls.push(
      byName
        ? encodeFunctionData({
            abi: Abis.v2.permissionedResolver,
            functionName: "setText",
            args: [target.dns, key, value ?? ""],
          })
        : encodeFunctionData({
            abi: Abis.v1.publicResolver,
            functionName: "setText",
            args: [target.node, key, value ?? ""],
          }),
    );
  }

  for (const [key, value] of Rec.toEntries(writes.addresses ?? {})) {
    const coinType = coinTypeOf(key);
    // ENSv1 PublicResolvers store coin 60 as a 20-byte address and revert on empty bytes, so a
    // deletion there writes the zero address; the PermissionedResolver accepts empty bytes.
    const bytes =
      value !== null
        ? codecs.encodeAddress(coinType, value)
        : !byName && coinType === 60n
          ? zeroAddress
          : "0x";
    calls.push(
      byName
        ? encodeFunctionData({
            abi: Abis.v2.permissionedResolver,
            functionName: "setAddress",
            args: [target.dns, coinType, bytes],
          })
        : encodeFunctionData({
            abi: Abis.v1.publicResolver,
            functionName: "setAddr",
            args: [target.node, coinType, bytes],
          }),
    );
  }

  if (writes.contentHash !== undefined || writes.contentHashBytes !== undefined) {
    const { contentHash } = codecs;
    if (
      writes.contentHashBytes === undefined &&
      writes.contentHash !== null &&
      writes.contentHash !== undefined &&
      contentHash === undefined
    ) {
      throw new Error("The content-hash codec was not loaded (see recordWriteCodecs).");
    }
    const hash =
      writes.contentHashBytes ??
      (writes.contentHash === null || writes.contentHash === undefined || contentHash === undefined
        ? "0x"
        : contentHash.encode(writes.contentHash));
    calls.push(
      byName
        ? encodeFunctionData({
            abi: Abis.v2.permissionedResolver,
            functionName: "setContenthash",
            args: [target.dns, hash],
          })
        : encodeFunctionData({
            abi: Abis.v1.publicResolver,
            functionName: "setContenthash",
            args: [target.node, hash],
          }),
    );
  }

  if (writes.abi !== undefined) {
    // An `Abi` is encoded as JSON (1), zlib-compressed JSON (2) or CBOR (4); a URI (8) is a
    // string; hex is written as it is.
    const { value } = writes.abi;
    const contentType = writes.abi.contentType ?? 1n;
    const uri = typeof value === "string" && !isHex(value);
    const valid =
      [1n, 2n, 4n, 8n].includes(contentType) &&
      (contentType === 8n ? value === null || typeof value === "string" : !uri);
    if (!valid) {
      throw new InvalidInputError({
        code: "INVALID_RECORD_VALUE",
        field: "abi.contentType",
        input: contentType,
        shortMessage:
          contentType === 8n
            ? "A URI ABI record (content type 8) takes the URI as a string."
            : uri
              ? "Only a URI ABI record (content type 8) takes a string; pass the ABI or hex bytes."
              : undefined,
      });
    }

    // Deleting without a content type clears every type the resolver holds.
    const types =
      value === null && writes.abi.contentType === undefined
        ? writes.abiContentTypes !== undefined && writes.abiContentTypes.length > 0
          ? writes.abiContentTypes
          : [1n]
        : [contentType];
    for (const type of types) {
      const data =
        value === null
          ? "0x"
          : typeof value === "string"
            ? isHex(value)
              ? value
              : stringToHex(value)
            : type === 1n
              ? // oxlint-disable-next-line effecttsgo/global-json -- Effect's Schema is large, and this is on every ENS write's static path
                stringToHex(JSON.stringify(value))
              : // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `recordWriteCodecs` loads the encoder whenever a compressed or CBOR ABI is written
                (codecs.encodeAbiRecord as (contentType: bigint, abi: Abi) => Hex)(type, value);
      calls.push(
        byName
          ? encodeFunctionData({
              abi: Abis.v2.permissionedResolver,
              functionName: "setABI",
              args: [target.dns, type, data],
            })
          : encodeFunctionData({
              abi: Abis.v1.publicResolver,
              functionName: "setABI",
              args: [target.node, type, data],
            }),
      );
    }
  }

  if (writes.pubkey !== undefined) {
    if (byName) {
      throw new UnsupportedError({
        code: "RESOLVER_PROFILE_UNSUPPORTED",
        feature: "public key records",
        shortMessage: "The PermissionedResolver does not support public key records.",
      });
    }
    const { x, y } = writes.pubkey ?? { x: zeroHash, y: zeroHash };
    calls.push(
      encodeFunctionData({
        abi: Abis.v1.publicResolver,
        functionName: "setPubkey",
        args: [target.node, x, y],
      }),
    );
  }

  if (writes.nameRecord !== undefined) {
    const value = writes.nameRecord ?? "";
    calls.push(
      byName
        ? encodeFunctionData({
            abi: Abis.v2.permissionedResolver,
            functionName: "setName",
            args: [target.dns, value],
          })
        : encodeFunctionData({
            abi: Abis.v1.publicResolver,
            functionName: "setName",
            args: [target.node, value],
          }),
    );
  }

  for (const [id, implementer] of Rec.toEntries(writes.interfaces ?? {})) {
    if (!isHex(id) || id.length !== 10) {
      throw new InvalidInputError({ code: "INVALID_RECORD_VALUE", field: "interfaces", input: id });
    }
    if (implementer !== null && !isAddress(implementer)) {
      throw new InvalidInputError({
        code: "INVALID_ADDRESS",
        field: "interfaces",
        input: implementer,
      });
    }
    const args = [id, implementer ?? zeroAddress] as const;
    calls.push(
      byName
        ? encodeFunctionData({
            abi: Abis.v2.permissionedResolver,
            functionName: "setInterface",
            args: [target.dns, ...args],
          })
        : encodeFunctionData({
            abi: Abis.v1.publicResolver,
            functionName: "setInterface",
            args: [target.node, ...args],
          }),
    );
  }

  for (const [key, value] of Rec.toEntries(writes.data ?? {})) {
    calls.push(
      byName
        ? encodeFunctionData({
            abi: Abis.v2.permissionedResolver,
            functionName: "setData",
            args: [target.dns, key, value ?? "0x"],
          })
        : encodeFunctionData({
            abi: Abis.v1.publicResolver,
            functionName: "setData",
            args: [target.node, key, value ?? "0x"],
          }),
    );
  }

  // A lone link to record 0 leaves the name reading the resolver's default record (the root
  // name's): one setter allocates a fresh, empty record of its own, as the ENS app does.
  if (writes.clear === true && byName && calls.length === 1) {
    calls.push(
      encodeFunctionData({
        abi: Abis.v2.permissionedResolver,
        functionName: "setText",
        args: [target.dns, "description", ""],
      }),
    );
  }
  return calls;
};

/**
 * The ERC-165 resolver profile each kind of record in `writes` is written through, with the name
 * of those records for errors. `clear` is not a profile: see `recordVersions`.
 */
export const writtenProfiles = (
  writes: RecordWrites,
): readonly (readonly [profile: keyof ResolverProfiles, records: string])[] => {
  const profiles: readonly (readonly [keyof ResolverProfiles, string, boolean])[] = [
    ["text", "text records", Rec.keys(writes.texts ?? {}).length > 0],
    ["addresses", "address records", Rec.keys(writes.addresses ?? {}).length > 0],
    [
      "contentHash",
      "content hash records",
      writes.contentHash !== undefined || writes.contentHashBytes !== undefined,
    ],
    ["abi", "ABI records", writes.abi !== undefined],
    ["pubkey", "public key records", writes.pubkey !== undefined],
    ["name", "name records", writes.nameRecord !== undefined],
    ["interfaces", "interface records", Rec.keys(writes.interfaces ?? {}).length > 0],
    ["data", "data records", Rec.keys(writes.data ?? {}).length > 0],
  ];
  return Arr.flatMap(profiles, ([profile, records, isWritten]) =>
    isWritten ? [[profile, records] as const] : [],
  );
};

/** One call on the resolver: the setter itself, or a resolver `multicall` of several. */
export const resolverCall = (resolver: Address, calls: readonly Hex[]): Plan.Call => ({
  to: resolver,
  data:
    calls.length === 1
      ? // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the collection is known to be non-empty or the index in range here; `noUncheckedIndexedAccess` cannot see it
        (calls[0] as Hex)
      : encodeFunctionData({
          abi: Abis.shared.multicallResolver,
          functionName: "multicall",
          args: [calls],
        }),
  value: 0n,
});
