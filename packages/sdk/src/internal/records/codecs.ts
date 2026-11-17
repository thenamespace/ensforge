import { Effect } from "effect";

import { coinTypeToNameMap } from "@ensdomains/address-encoder";
import type { Hex } from "viem";

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
};

/** Loads the codecs for these coin types, and the content-hash or ABI codecs when asked. */
export const loadRecordCodecs = (needs: {
  readonly coinTypes: readonly bigint[];
  readonly contentHash?: boolean | undefined;
  readonly abi?: boolean | undefined;
}): Effect.Effect<RecordCodecs> => {
  const nonEvm = [...new Set(needs.coinTypes.filter((coinType) => !isEvmCoinType(coinType)))];
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
                nonEvm.flatMap((coinType) => {
                  const name =
                    coinTypeToNameMap[String(coinType) as keyof typeof coinTypeToNameMap]?.[0];
                  const coder =
                    name === undefined ? undefined : (coins as Record<string, unknown>)[name];
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
    },
    { concurrency: "unbounded" },
  ).pipe(
    Effect.map(({ coders, contentHash, abi }) => {
      const byCoinType = new Map(coders);
      return {
        decodeAddress: (coinType, data) =>
          decodeAddressWith(coinType, data, byCoinType.get(coinType)),
        encodeAddress: (coinType, address) =>
          encodeAddressWith(coinType, address, byCoinType.get(coinType)),
        contentHash,
        decodeAbiRecord: abi?.decodeAbiRecord,
      };
    }),
  );
};
