import { Effect } from "effect";

import {
  erc20DecimalsAbi,
  erc20SymbolAbi,
  standardRentPriceOracleV2IsPaymentTokenAbi,
} from "@ensforge/contracts/internal";

import type { EthereumAddress } from "../../schemas/identity.js";
import { EthereumClient } from "../client/ethereum-client.js";

export const readPaymentTokenSupport = Effect.fn("readPaymentTokenSupport")(function* (
  oracle: EthereumAddress,
  token: EthereumAddress,
) {
  const ethereum = yield* EthereumClient;

  const supported = yield* ethereum.readContract({
    address: oracle,
    abi: standardRentPriceOracleV2IsPaymentTokenAbi,
    functionName: "isPaymentToken",
    args: [token],
  });

  if (!supported) return { supported: false as const };

  const [symbol, decimals] = yield* Effect.all(
    [
      ethereum.readContract({ address: token, abi: erc20SymbolAbi, functionName: "symbol" }),
      ethereum.readContract({ address: token, abi: erc20DecimalsAbi, functionName: "decimals" }),
    ] as const,
    { concurrency: "unbounded" },
  );

  return { supported: true as const, symbol, decimals };
});
