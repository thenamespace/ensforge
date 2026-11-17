import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import type { StepContext } from "@ensforge/test-devnet";
import { decodeFunctionResult, encodeFunctionData, namehash, type Address, type Hex } from "viem";

import { dnsEncode } from "./names.ts";

/** Records to write; addresses are raw bytes per coin type. */
export type Records = {
  readonly texts?: Readonly<Record<string, string>>;
  readonly addresses?: ReadonlyArray<readonly [coinType: bigint, value: Hex]>;
  readonly contenthash?: Hex;
  readonly abis?: ReadonlyArray<readonly [contentType: bigint, data: Hex]>;
  readonly interfaces?: ReadonlyArray<readonly [interfaceId: Hex, implementer: Address]>;
  /** ENSIP-24 data records (PermissionedResolver only). */
  readonly data?: Readonly<Record<string, Hex>>;
};

/** Writes `records` for `node` on an ENSv1 PublicResolver (any generation with these setters). */
export const setV1Records = Effect.fnUntraced(function* (
  c: StepContext,
  options: {
    readonly resolver: Address;
    readonly node: Hex;
    readonly from: Address;
    readonly records: Records;
  },
) {
  const target = [options.resolver, "v1/PublicResolver"] as const;
  const from = { from: options.from } as const;
  const { records, node } = options;
  for (const [key, value] of Object.entries(records.texts ?? {})) {
    yield* c.write(target, "setText", [node, key, value], from);
  }
  for (const [coinType, value] of records.addresses ?? []) {
    yield* c.write(target, "setAddr", [node, coinType, value], from);
  }
  if (records.contenthash !== undefined) {
    yield* c.write(target, "setContenthash", [node, records.contenthash], from);
  }
  for (const [contentType, data] of records.abis ?? []) {
    yield* c.write(target, "setABI", [node, contentType, data], from);
  }
  for (const [interfaceId, implementer] of records.interfaces ?? []) {
    yield* c.write(target, "setInterface", [node, interfaceId, implementer], from);
  }
});

/** Writes `records` for `name` on a PermissionedResolver (setters take the DNS-encoded name). */
export const setV2Records = Effect.fnUntraced(function* (
  c: StepContext,
  options: {
    readonly resolver: Address;
    readonly name: string;
    readonly from: Address;
    readonly records: Records;
  },
) {
  const target = [options.resolver, "v2/PermissionedResolverImpl"] as const;
  const from = { from: options.from } as const;
  const { records } = options;
  const name = dnsEncode(options.name);
  for (const [key, value] of Object.entries(records.texts ?? {})) {
    yield* c.write(target, "setText", [name, key, value], from);
  }
  for (const [coinType, value] of records.addresses ?? []) {
    yield* c.write(target, "setAddress", [name, coinType, value], from);
  }
  if (records.contenthash !== undefined) {
    yield* c.write(target, "setContenthash", [name, records.contenthash], from);
  }
  for (const [contentType, data] of records.abis ?? []) {
    yield* c.write(target, "setABI", [name, contentType, data], from);
  }
  for (const [interfaceId, implementer] of records.interfaces ?? []) {
    yield* c.write(target, "setInterface", [name, interfaceId, implementer], from);
  }
  for (const [key, value] of Object.entries(records.data ?? {})) {
    yield* c.write(target, "setData", [name, key, value], from);
  }
});

/** A text record read through ENSIP-10 `resolve`, as PermissionedResolvers answer. */
export const resolveText = Effect.fnUntraced(function* (
  c: StepContext,
  options: { readonly resolver: Address; readonly name: string; readonly key: string },
) {
  const call = encodeFunctionData({
    abi: Abis.shared.textResolver,
    functionName: "text",
    args: [namehash(options.name), options.key],
  });
  const answer = yield* c.read<Hex>([options.resolver, "v2/PermissionedResolverImpl"], "resolve", [
    dnsEncode(options.name),
    call,
  ]);
  return decodeFunctionResult({
    abi: Abis.shared.textResolver,
    functionName: "text",
    data: answer,
  });
});
