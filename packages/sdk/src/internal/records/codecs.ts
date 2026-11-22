import { Effect, Array as Arr } from "effect";

import { coinTypeToNameMap } from "@ensdomains/address-encoder";
import type { Abi, Hex } from "viem";

import type * as ContentHash from "../../utils/ContentHash.js";
import type { AbiRecord } from "./abi-record.js";
import {
  decodeAddressWith,
  encodeAddressWith,
  isEvmCoinType,
  type AddressCoder,
} from "./address-codec.js";

/**
 * Record codecs, loaded for what one read or write needs. Non-EVM coins, content hashes and ABI
 * records pull in sizeable libraries, so apps only download them when they use them.
 */
export type RecordCodecs = {
  readonly decodeAddress: (coinType: bigint, data: Hex) => string | null;
  readonly encodeAddress: (coinType: bigint, address: string) => Hex;
  readonly contentHash: typeof ContentHash | undefined;
  readonly decodeAbiRecord: ((contentType: bigint, data: Hex) => AbiRecord | null) | undefined;
  readonly encodeAbiRecord: ((contentType: bigint, abi: Abi) => Hex) | undefined;
};

/** Loads the codecs for these coin types, and the content-hash or ABI codecs when asked. */
export const loadRecordCodecs = (needs: {
  readonly coinTypes: readonly bigint[];
  readonly contentHash?: boolean | undefined;
  readonly abi?: boolean | undefined;
  readonly abiEncode?: boolean | undefined;
}): Effect.Effect<RecordCodecs> => {
  const nonEvm = [...new Set(Arr.filter(needs.coinTypes, (coinType) => !isEvmCoinType(coinType)))];
  return Effect.all(
    {
      // Every non-EVM codec lives in one lazily loaded chunk. A coin without a codec stays out:
      // decoding it fails as INVALID_COIN_TYPE, encoding as INVALID_ADDRESS, as with `CoinType`.
      // (address-encoder's own async loader imports extensionless paths, which Node rejects.)
      coders:
        nonEvm.length === 0
          ? Effect.succeed([])
          : Effect.promise(() => import("@ensdomains/address-encoder/coins")).pipe(
              Effect.map((coins) =>
                Arr.flatMap(nonEvm, (coinType) => {
                  const name =
                    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- coin type names key the generated map, and the coins module exports address coders by name
                    coinTypeToNameMap[String(coinType) as keyof typeof coinTypeToNameMap]?.[0];
                  const coder =
                    name === undefined ? undefined : (coins as Record<string, unknown>)[name];
                  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- coin type names key the generated map, and the coins module exports address coders by name
                  return coder === undefined ? [] : [[coinType, coder as AddressCoder] as const];
                }),
              ),
            ),
      contentHash:
        needs.contentHash === true
          ? Effect.promise(() => import("../../utils/ContentHash.js"))
          : Effect.undefined,
      abi:
        needs.abi === true
          ? Effect.promise(() => import("./abi-record-decode.js"))
          : Effect.undefined,
      abiEncode:
        needs.abiEncode === true
          ? Effect.promise(() => import("./abi-record-encode.js"))
          : Effect.undefined,
    },
    { concurrency: "unbounded" },
  ).pipe(
    Effect.map(({ coders, contentHash, abi, abiEncode }) => {
      const byCoinType = new Map(coders);
      return {
        decodeAddress: (coinType, data) =>
          decodeAddressWith(coinType, data, byCoinType.get(coinType)),
        encodeAddress: (coinType, address) =>
          encodeAddressWith(coinType, address, byCoinType.get(coinType)),
        contentHash,
        decodeAbiRecord: abi?.decodeAbiRecord,
        encodeAbiRecord: abiEncode?.encodeAbiRecord,
      };
    }),
  );
};
