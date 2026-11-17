import { Abis } from "@ensforge/contracts";
import {
  decodeFunctionResult,
  encodeFunctionData,
  isAddressEqual,
  zeroAddress,
  zeroHash,
  type Hex,
} from "viem";

import type { Selection } from "../../actions/record/get/types.js";
import * as CoinType from "../../utils/CoinType.js";
import * as ContentHash from "../../utils/ContentHash.js";
import { allAbiContentTypes, decodeAbiRecord } from "./abi-record.js";

/** ENSIP-19 default EVM coin type: the fallback address for EVM chains without their own record. */
export const defaultEvmCoinType = 0x8000_0000n;

/** One resolver call and how its result lands in the output. */
type Read = {
  readonly call: Hex;
  readonly apply: (result: Hex | undefined, output: Output, results: Results) => void;
};

type Output = Record<string, Record<string, unknown> | unknown>;
type Results = { readonly defaultAddress: Hex | undefined };

// One single-function ENSIP profile ABI per read, so overloads such as `addr` never get mixed up.
const profileAbis = {
  text: Abis.shared.textResolver,
  addr: Abis.shared.addressResolver,
  contenthash: Abis.shared.contenthashResolver,
  ABI: Abis.shared.abiResolver,
  pubkey: Abis.shared.pubkeyResolver,
  name: Abis.shared.nameResolver,
  interfaceImplementer: Abis.shared.interfaceResolver,
  data: Abis.shared.dataResolver,
} as const;

const decode = (functionName: keyof typeof profileAbis, data: Hex): unknown =>
  decodeFunctionResult({ abi: profileAbis[functionName], functionName, data } as never);

const orNull = <value>(read: () => value): value | null => {
  try {
    return read();
  } catch {
    return null;
  }
};

const textReads = (node: Hex, keys: readonly string[]): Read[] =>
  keys.map((key) => ({
    call: encodeFunctionData({
      abi: Abis.shared.textResolver,
      functionName: "text",
      args: [node, key],
    }),
    apply: (result, output) => {
      const value = result === undefined ? "" : (decode("text", result) as string);
      (output.texts as Record<string, unknown>)[key] = value === "" ? null : value;
    },
  }));

const decodeAddress = (coinType: bigint, result: Hex | undefined): string | null => {
  if (result === undefined) return null;
  const bytes = decode("addr", result) as Hex;
  return bytes === "0x" ? null : orNull(() => CoinType.decodeAddress(coinType, bytes));
};

const addressReads = (node: Hex, coins: readonly (string | bigint)[]): Read[] =>
  coins.map((coin) => {
    const coinType = CoinType.from(coin);
    const usesDefault = CoinType.isEvm(coinType) && coinType !== 60n;
    return {
      call: encodeFunctionData({
        abi: Abis.shared.addressResolver,
        functionName: "addr",
        args: [node, coinType],
      }),
      apply: (result, output, results) => {
        const own = decodeAddress(coinType, result);
        (output.addresses as Record<string, unknown>)[String(coin)] =
          own ?? (usesDefault ? decodeAddress(coinType, results.defaultAddress) : null);
      },
    };
  });

const keyedReads = <value>(
  keys: readonly string[],
  field: string,
  call: (key: string) => Hex,
  read: (result: Hex) => value | null,
): Read[] =>
  keys.map((key) => ({
    call: call(key),
    apply: (result, output) => {
      (output[field] as Record<string, unknown>)[key] =
        result === undefined ? null : orNull(() => read(result));
    },
  }));

const singleRead = (field: string, call: Hex, read: (result: Hex) => unknown): Read => ({
  call,
  apply: (result, output) => {
    output[field] = result === undefined ? null : orNull(() => read(result));
  },
});

/**
 * The resolver calls for a selection, in order, plus a function that assembles their results
 * into the `record.get` shape. Throws `InvalidInputError` for unknown coins.
 */
export const planRecordReads = (node: Hex, selection: Selection) => {
  const reads: Read[] = [
    ...textReads(node, selection.texts ?? []),
    ...addressReads(node, selection.addresses ?? []),
    ...keyedReads(
      selection.interfaces ?? [],
      "interfaces",
      (id) =>
        encodeFunctionData({
          abi: Abis.shared.interfaceResolver,
          functionName: "interfaceImplementer",
          args: [node, id as Hex],
        }),
      (result) => {
        const implementer = decode("interfaceImplementer", result) as Hex;
        return isAddressEqual(implementer, zeroAddress) ? null : implementer;
      },
    ),
    ...keyedReads(
      selection.data ?? [],
      "data",
      (key) =>
        encodeFunctionData({
          abi: Abis.shared.dataResolver,
          functionName: "data",
          args: [node, key],
        }),
      (result) => {
        const value = decode("data", result) as Hex;
        return value === "0x" ? null : value;
      },
    ),
  ];

  if (selection.contentHash === true) {
    reads.push(
      singleRead(
        "contentHash",
        encodeFunctionData({
          abi: Abis.shared.contenthashResolver,
          functionName: "contenthash",
          args: [node],
        }),
        (result) => ContentHash.decode(decode("contenthash", result) as Hex),
      ),
    );
  }
  if (selection.abi !== undefined) {
    const contentTypes = selection.abi === true ? allAbiContentTypes : selection.abi.contentTypes;
    reads.push(
      singleRead(
        "abi",
        encodeFunctionData({
          abi: Abis.shared.abiResolver,
          functionName: "ABI",
          args: [node, contentTypes],
        }),
        (result) => {
          const [contentType, data] = decode("ABI", result) as [bigint, Hex];
          return decodeAbiRecord(contentType, data);
        },
      ),
    );
  }
  if (selection.pubkey === true) {
    reads.push(
      singleRead(
        "pubkey",
        encodeFunctionData({
          abi: Abis.shared.pubkeyResolver,
          functionName: "pubkey",
          args: [node],
        }),
        (result) => {
          const [x, y] = decode("pubkey", result) as [Hex, Hex];
          return x === zeroHash && y === zeroHash ? null : { x, y };
        },
      ),
    );
  }
  if (selection.nameRecord === true) {
    reads.push(
      singleRead(
        "nameRecord",
        encodeFunctionData({ abi: Abis.shared.nameResolver, functionName: "name", args: [node] }),
        (result) => {
          const value = decode("name", result) as string;
          return value === "" ? null : value;
        },
      ),
    );
  }

  // EVM chains other than mainnet fall back to the default EVM address (ENSIP-19).
  const needsDefault = (selection.addresses ?? []).some((coin) => {
    const coinType = CoinType.from(coin);
    return CoinType.isEvm(coinType) && coinType !== 60n;
  });
  const defaultCall = encodeFunctionData({
    abi: Abis.shared.addressResolver,
    functionName: "addr",
    args: [node, defaultEvmCoinType],
  });
  const calls = [...reads.map((read) => read.call), ...(needsDefault ? [defaultCall] : [])];

  const assemble = (results: readonly (Hex | undefined)[]): Output => {
    const output: Output = {
      ...(selection.texts === undefined ? {} : { texts: {} }),
      ...(selection.addresses === undefined ? {} : { addresses: {} }),
      ...(selection.interfaces === undefined ? {} : { interfaces: {} }),
      ...(selection.data === undefined ? {} : { data: {} }),
    };
    const shared: Results = { defaultAddress: needsDefault ? results.at(-1) : undefined };
    for (const [index, read] of reads.entries()) read.apply(results[index], output, shared);
    return output;
  };

  return { calls, assemble };
};
