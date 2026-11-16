import { Effect } from "effect";

import { defineAction, HcaError } from "@ensforge/core/legacy";
import { getPermit2Address } from "@rhinestone/sdk";
import { encodeFunctionData, erc20Abi } from "viem";

import { loadFunding, type FundingContext } from "../context.js";
import { permit2NonceAbi } from "../permit.js";
import type { RhinestoneCrossChain } from "../types.js";

export const createGetFundingCleanup = (
  context: FundingContext,
): RhinestoneCrossChain["getFundingCleanup"] =>
  defineAction((config, input) =>
    Effect.tryPromise({
      try: async () => {
        const record = await loadFunding(context, config, input);

        return [
          {
            chainId: record.sourceChainId,
            to: getPermit2Address(),
            value: 0n,
            data: encodeFunctionData({
              abi: permit2NonceAbi,
              functionName: "invalidateUnorderedNonces",
              args: [record.permitNonce >> 8n, 1n << (record.permitNonce & 255n)],
            }),
          },
          {
            chainId: record.sourceChainId,
            to: record.sourceToken,
            value: 0n,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [getPermit2Address(), 0n],
            }),
          },
        ];
      },
      catch: (cause) =>
        cause instanceof HcaError
          ? cause
          : new HcaError({
              code: "ADAPTER_FAILED",
              message: "Could not prepare funding cleanup",
              cause,
            }),
    }),
  );
