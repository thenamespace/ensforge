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
    | { readonly contentType?: bigint | undefined; readonly value: Abi | Hex | null }
    | undefined;
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
    // its record (it then reads the resolver's default record), and the setters below allocate a
    // fresh one.
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
    // Only JSON (content type 1) is encoded from an `Abi`; other content types take raw bytes.
    const { value } = writes.abi;
    const contentType = writes.abi.contentType ?? 1n;
    const encodable = value === null || isHex(value) || contentType === 1n;
    if (![1n, 2n, 4n, 8n].includes(contentType) || !encodable) {
      throw new InvalidInputError({
        code: "INVALID_RECORD_VALUE",
        field: "abi.contentType",
        input: contentType,
      });
    }

    // oxlint-disable-next-line effecttsgo/global-json -- Effect's Schema is large, and this is on every ENS write's static path
    const data = value === null ? "0x" : isHex(value) ? value : stringToHex(JSON.stringify(value));
    calls.push(
      byName
        ? encodeFunctionData({
            abi: Abis.v2.permissionedResolver,
            functionName: "setABI",
            args: [target.dns, contentType, data],
          })
        : encodeFunctionData({
            abi: Abis.v1.publicResolver,
            functionName: "setABI",
            args: [target.node, contentType, data],
          }),
    );
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
