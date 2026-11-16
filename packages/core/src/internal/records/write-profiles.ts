import { Abis } from "@ensforge/contracts";
import {
  encodeFunctionData,
  isAddress,
  isHex,
  zeroAddress,
  zeroHash,
  type Abi,
  type Address,
  type Hex,
} from "viem";

import { InvalidInputError } from "../../errors/classes/InvalidInputError.js";
import { UnsupportedError } from "../../errors/classes/UnsupportedError.js";
import type { Plan } from "../../plan/Plan.js";
import * as CoinType from "../../utils/CoinType.js";
import * as ContentHash from "../../utils/ContentHash.js";
import { encodeAbiJson } from "./abi-record.js";
import type { SetterKeying } from "./setter-keying.js";

/** Records to write; `null` deletes one. */
export type RecordWrites = {
  readonly texts?: Readonly<Record<string, string | null>> | undefined;
  readonly addresses?: Readonly<Record<string, string | null>> | undefined;
  readonly contentHash?: string | null | undefined;
  readonly abi?:
    | { readonly contentType?: bigint | undefined; readonly value: Abi | Hex | null }
    | undefined;
  readonly pubkey?: { readonly x: Hex; readonly y: Hex } | null | undefined;
  readonly nameRecord?: string | null | undefined;
  readonly interfaces?: Readonly<Record<Hex, Address | null>> | undefined;
  readonly data?: Readonly<Record<string, Hex | null>> | undefined;
  readonly clear?: boolean | undefined;
};

const unsupported = (feature: string) =>
  new UnsupportedError({
    code: "RESOLVER_PROFILE_UNSUPPORTED",
    feature,
    shortMessage: `The PermissionedResolver does not support ${feature}.`,
  });

/** Coin by symbol (`btc`) or decimal coin type (`2147492101`). */
const coinTypeOf = (key: string): bigint => (/^\d+$/.test(key) ? BigInt(key) : CoinType.from(key));

const abiContentTypes = new Set([1n, 2n, 4n, 8n]);

// Only JSON (content type 1) is encoded from an `Abi`; other content types take raw bytes.
const abiPayload = (abi: NonNullable<RecordWrites["abi"]>): { contentType: bigint; data: Hex } => {
  const contentType = abi.contentType ?? 1n;
  const encodable = abi.value === null || isHex(abi.value) || contentType === 1n;
  if (!abiContentTypes.has(contentType) || !encodable) {
    throw new InvalidInputError({
      code: "INVALID_RECORD_VALUE",
      field: "abi.contentType",
      input: contentType,
    });
  }

  if (abi.value === null) return { contentType, data: "0x" };
  return { contentType, data: isHex(abi.value) ? abi.value : encodeAbiJson(abi.value) };
};

const requireInterfaceId = (id: string): Hex => {
  if (isHex(id) && id.length === 10) return id;
  throw new InvalidInputError({ code: "INVALID_RECORD_VALUE", field: "interfaces", input: id });
};

const requireImplementer = (implementer: Address | null): Address => {
  if (implementer === null) return zeroAddress;
  if (isAddress(implementer)) return implementer;
  throw new InvalidInputError({ code: "INVALID_ADDRESS", field: "interfaces", input: implementer });
};

/**
 * Encodes resolver setter calls for `writes`. Node-based resolvers take the node; the ENSv2
 * PermissionedResolver takes the DNS-encoded name and has no pubkey or `clearRecords`.
 * Throws `InvalidInputError` / `UnsupportedError` for invalid or unsupported writes.
 */
export const encodeRecordWrites = (
  keying: SetterKeying,
  target: { readonly node: Hex; readonly dns: Hex },
  writes: RecordWrites,
): Hex[] => {
  const byName = keying === "name";
  const calls: Hex[] = [];
  const node = (fn: (abi: typeof Abis.v1.publicResolver) => Hex) =>
    calls.push(fn(Abis.v1.publicResolver));

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

  for (const [key, value] of Object.entries(writes.texts ?? {})) {
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

  for (const [key, value] of Object.entries(writes.addresses ?? {})) {
    const coinType = coinTypeOf(key);
    // ENSv1 PublicResolvers store coin 60 as a 20-byte address and revert on empty bytes, so a
    // deletion there writes the zero address; the PermissionedResolver accepts empty bytes.
    const bytes =
      value !== null
        ? CoinType.encodeAddress(coinType, value)
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

  if (writes.contentHash !== undefined) {
    const hash = writes.contentHash === null ? "0x" : ContentHash.encode(writes.contentHash);
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
    const { contentType, data } = abiPayload(writes.abi);
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
    if (byName) throw unsupported("public key records");
    const { x, y } = writes.pubkey ?? { x: zeroHash, y: zeroHash };
    node((abi) =>
      encodeFunctionData({ abi, functionName: "setPubkey", args: [target.node, x, y] }),
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

  for (const [id, implementer] of Object.entries(writes.interfaces ?? {})) {
    const args = [requireInterfaceId(id), requireImplementer(implementer)] as const;
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

  for (const [key, value] of Object.entries(writes.data ?? {})) {
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

/** One call on the resolver: the setter itself, or a resolver `multicall` of several. */
export const resolverCall = (resolver: Address, calls: readonly Hex[]): Plan.Call => ({
  to: resolver,
  data:
    calls.length === 1
      ? (calls[0] as Hex)
      : encodeFunctionData({
          abi: Abis.shared.multicallResolver,
          functionName: "multicall",
          args: [calls],
        }),
  value: 0n,
});
