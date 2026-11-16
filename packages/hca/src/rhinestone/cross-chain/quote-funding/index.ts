import { Effect } from "effect";

import { defineAction, HcaError } from "@ensforge/core/legacy";
import { getPermit2Address } from "@rhinestone/sdk";
import { encodeFunctionData, erc20Abi, isAddress, maxUint256 } from "viem";

import { createRhinestoneHca } from "../../account.js";
import { getFundingRoute, verifyFundingContracts, type FundingContext } from "../context.js";
import { reviewFunding } from "../review.js";
import type { RhinestoneCrossChain, RhinestoneFundingQuote } from "../types.js";

export const createQuoteFunding = (context: FundingContext): RhinestoneCrossChain["quoteFunding"] =>
  defineAction((config, input) =>
    Effect.tryPromise({
      try: async () => {
        if (
          !input.id.trim() ||
          !isAddress(input.destinationHca) ||
          input.amount <= 0n ||
          input.amount > maxUint256 ||
          input.maximumSourceSpend <= 0n ||
          input.maximumSourceSpend > maxUint256 ||
          !input.source.account.signTypedData
        )
          throw new HcaError({
            code: "INVALID_PARAMETERS",
            message: "Funding needs an ID, HCA, positive bounded amounts and EOA typed-data signer",
          });

        const route = getFundingRoute(context, input.routeId);
        await verifyFundingContracts(context, config, route, input.source);
        await createRhinestoneHca(
          context.options,
          context.sdk,
          config,
          input.destinationHca,
          input.salt,
        );
        const account = await context.sdk.createAccount({
          account: { type: "eoa" },
          eoa: input.source.account,
        });
        const prepared = await account.prepareTransaction({
          sourceChains: [input.source.chain],
          targetChain: context.options.chain,
          recipient: input.destinationHca,
          calls: [],
          sourceAssets: { [input.source.chain.id]: [route.sourceToken] },
          tokenRequests: [{ address: route.destinationToken, amount: input.amount }],
          settlementLayers: [route.settlementLayer],
          feeAsset: route.sourceToken,
          sponsored: input.sponsored ?? false,
          lockFunds: false,
        });
        const review = reviewFunding(
          account,
          prepared,
          route,
          input,
          context.options.crossChain?.maximumQuoteLifetimeSeconds ?? 600,
        );
        const allowance = await input.source.publicClient.readContract({
          address: route.sourceToken,
          abi: erc20Abi,
          functionName: "allowance",
          args: [input.source.account.address, getPermit2Address()],
        });
        const balance = await input.source.publicClient.readContract({
          address: route.sourceToken,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [input.source.account.address],
        });

        if (balance < review.sourceSpend)
          throw new HcaError({
            code: "INVALID_EXECUTION",
            message: "Source ERC-20 balance cannot fund this quote",
          });

        const approvals =
          allowance >= review.sourceSpend
            ? []
            : (allowance === 0n ? [review.sourceSpend] : [0n, review.sourceSpend]).map((amount) =>
                Object.freeze({
                  chainId: route.sourceChainId,
                  to: route.sourceToken,
                  value: 0n,
                  data: encodeFunctionData({
                    abi: erc20Abi,
                    functionName: "approve",
                    args: [getPermit2Address(), amount],
                  }),
                }),
              );
        const [sourceStartBlock, destinationStartBlock] = await Promise.all([
          input.source.publicClient.getBlockNumber({ cacheTime: 0 }),
          config.publicClient.getBlockNumber({ cacheTime: 0 }),
        ]);
        const quote: RhinestoneFundingQuote = Object.freeze({
          record: Object.freeze({
            version: 1,
            sourceStartBlock,
            destinationStartBlock,
            id: input.id,
            revision: 0,
            configurationFingerprint: context.fingerprint,
            routeId: route.id,
            sourceChainId: route.sourceChainId,
            destinationChainId: route.destinationChainId,
            sourceAccount: input.source.account.address,
            destinationHca: input.destinationHca,
            salt: input.salt ?? 0n,
            sourceToken: route.sourceToken,
            destinationToken: route.destinationToken,
            amount: input.amount,
            maximumSourceSpend: input.maximumSourceSpend,
            ...review,
            createdAt: BigInt(Math.floor(Date.now() / 1000)),
            state: "authorizing",
          }),
          approvals: Object.freeze(approvals),
        });
        context.quotes.set(quote, { source: input.source, account, prepared, used: false });

        return quote;
      },
      catch: (cause) =>
        cause instanceof HcaError
          ? cause
          : new HcaError({ code: "ADAPTER_FAILED", message: "Could not quote HCA funding", cause }),
    }),
  );
