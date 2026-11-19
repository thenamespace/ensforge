/* oxlint-disable typescript/no-unsafe-type-assertion -- results are decoded against a profile ABI chosen by name at runtime */
import { Array as Arr } from "effect";

import { Abis } from "@ensforge/contracts";
import { decodeFunctionResult, encodeFunctionData, zeroHash, type Address, type Hex } from "viem";

import type { Selection } from "../../actions/record/get/types.js";
import * as CoinType from "../../utils/CoinType.js";
import { nonZeroAddress } from "../address.js";
import { loadRecordCodecs, type RecordCodecs } from "./codecs.js";

/** ENSIP-19 default EVM coin type: the fallback address for EVM chains without their own record. */
export const defaultEvmCoinType = 0x8000_0000n;

/** One resolver call and how its result lands in the output. */
type Read = {
  readonly call: Hex;
  readonly apply: (
    result: Hex | undefined,
    output: Output,
    results: Results,
    codecs: RecordCodecs,
  ) => void;
};

type Output = Record<string, unknown>;
type Results = {
  readonly defaultAddress: Hex | undefined;
  /** The legacy `addr(bytes32)` answer, for resolvers older than ENSIP-9. */
  readonly legacyEth: Hex | undefined;
};

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
  // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- tsc requires this assertion; tsgolint resolves the parameter type differently
  decodeFunctionResult({ abi: profileAbis[functionName], functionName, data } as never);

const orNull = <value>(read: () => value): value | null => {
  try {
    return read();
  } catch {
    return null;
  }
};

const textReads = (node: Hex, keys: readonly string[]): Read[] =>
  Arr.map(keys, (key) => ({
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

// An answer that is not ABI-encoded bytes counts as none: World's resolver answers
// `addr(bytes32,uint256)` with a bare address word.
const addressBytes = (result: Hex | undefined): Hex | undefined =>
  result === undefined ? undefined : (orNull(() => decode("addr", result) as Hex) ?? undefined);

const decodeAddress = (
  codecs: RecordCodecs,
  coinType: bigint,
  result: Hex | undefined,
): string | null => {
  const bytes = addressBytes(result);
  return bytes === undefined || bytes === "0x"
    ? null
    : orNull(() => codecs.decodeAddress(coinType, bytes));
};

const decodeLegacyEth = (codecs: RecordCodecs, result: Hex | undefined): string | null => {
  if (result === undefined) return null;
  const address = nonZeroAddress(
    orNull(() =>
      decodeFunctionResult({ abi: Abis.shared.addrResolver, functionName: "addr", data: result }),
    ),
  );
  return address === null ? null : orNull(() => codecs.decodeAddress(60n, address));
};

const addressReads = (node: Hex, coins: readonly (string | bigint)[]): Read[] =>
  Arr.map(coins, (coin) => {
    const coinType = CoinType.from(coin);
    const usesDefault = CoinType.isEvm(coinType) && coinType !== 60n;
    return {
      call: encodeFunctionData({
        abi: Abis.shared.addressResolver,
        functionName: "addr",
        args: [node, coinType],
      }),
      apply: (result, output, results, codecs) => {
        // Only a coin without a record of its own uses the default; an explicit zero address
        // is a record and blocks it.
        const bytes = addressBytes(result);
        (output.addresses as Record<string, unknown>)[String(coin)] =
          (bytes === undefined || bytes === "0x") && usesDefault
            ? decodeAddress(codecs, coinType, results.defaultAddress)
            : // A resolver without ENSIP-9 answers ETH only through the legacy `addr(bytes32)`.
              bytes === undefined && coinType === 60n
              ? decodeLegacyEth(codecs, results.legacyEth)
              : decodeAddress(codecs, coinType, result);
      },
    };
  });

const keyedReads = (
  keys: readonly string[],
  field: string,
  call: (key: string) => Hex,
  read: (result: Hex) => unknown,
): Read[] =>
  Arr.map(keys, (key) => ({
    call: call(key),
    apply: (result, output) => {
      (output[field] as Record<string, unknown>)[key] =
        result === undefined ? null : orNull(() => read(result));
    },
  }));

const singleRead = (
  field: string,
  call: Hex,
  read: (result: Hex, codecs: RecordCodecs) => unknown,
): Read => ({
  call,
  apply: (result, output, _results, codecs) => {
    output[field] = result === undefined ? null : orNull(() => read(result, codecs));
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
      (result) => nonZeroAddress(decode("interfaceImplementer", result) as Address),
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
        (result, codecs) =>
          codecs.contentHash?.decode(decode("contenthash", result) as Hex) ?? null,
      ),
    );
  }
  if (selection.abi !== undefined) {
    // ENSIP-4 content types 1 JSON, 2 zlib-compressed JSON, 4 CBOR and 8 URI; all by default.
    const contentTypes = selection.abi === true ? 1n | 2n | 4n | 8n : selection.abi.contentTypes;
    reads.push(
      singleRead(
        "abi",
        encodeFunctionData({
          abi: Abis.shared.abiResolver,
          functionName: "ABI",
          args: [node, contentTypes],
        }),
        (result, codecs) => {
          const [contentType, data] = decode("ABI", result) as [bigint, Hex];
          return codecs.decodeAbiRecord?.(contentType, data) ?? null;
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
  const needsDefault = Arr.some(selection.addresses ?? [], (coin) => {
    const coinType = CoinType.from(coin);
    return CoinType.isEvm(coinType) && coinType !== 60n;
  });
  const defaultCall = encodeFunctionData({
    abi: Abis.shared.addressResolver,
    functionName: "addr",
    args: [node, defaultEvmCoinType],
  });
  // ETH also asks the legacy `addr(bytes32)` in the same request, for pre-ENSIP-9 resolvers.
  const needsLegacyEth = Arr.some(selection.addresses ?? [], (coin) => CoinType.from(coin) === 60n);
  const legacyEthCall = encodeFunctionData({
    abi: Abis.shared.addrResolver,
    functionName: "addr",
    args: [node],
  });
  const calls = [
    ...Arr.map(reads, (read) => read.call),
    ...(needsDefault ? [defaultCall] : []),
    ...(needsLegacyEth ? [legacyEthCall] : []),
  ];

  // Only the codecs this selection decodes with are loaded.
  const codecs = loadRecordCodecs({
    coinTypes: Arr.map(selection.addresses ?? [], (coin) => CoinType.from(coin)),
    contentHash: selection.contentHash === true,
    abi: selection.abi !== undefined,
  });

  const assemble = (results: readonly (Hex | undefined)[], loaded: RecordCodecs): Output => {
    const output: Output = {
      ...(selection.texts === undefined ? {} : { texts: {} }),
      ...(selection.addresses === undefined ? {} : { addresses: {} }),
      ...(selection.interfaces === undefined ? {} : { interfaces: {} }),
      ...(selection.data === undefined ? {} : { data: {} }),
    };
    const shared: Results = {
      defaultAddress: needsDefault ? results[reads.length] : undefined,
      legacyEth: needsLegacyEth ? results[reads.length + (needsDefault ? 1 : 0)] : undefined,
    };
    for (const [index, read] of reads.entries()) read.apply(results[index], output, shared, loaded);
    return output;
  };

  return { calls, codecs, assemble };
};
