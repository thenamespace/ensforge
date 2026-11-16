import { Effect } from "effect";

import { defineAction, HcaError } from "@ensforge/core/legacy";
import { erc20Abi, parseEventLogs, TransactionReceiptNotFoundError } from "viem";

import { loadFunding, type FundingContext } from "../context.js";
import type { RhinestoneCrossChain, RhinestoneFundingStatus } from "../types.js";

export const createGetFundingStatus = (
  context: FundingContext,
): RhinestoneCrossChain["getFundingStatus"] =>
  defineAction((config, input) =>
    Effect.tryPromise({
      try: async (): Promise<RhinestoneFundingStatus> => {
        const record = await loadFunding(context, config, input);
        const destinationBalance = await config.publicClient.readContract({
          address: record.destinationToken,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [record.destinationHca],
        });
        const pending: RhinestoneFundingStatus = {
          record,
          status: record.state === "cancelled" ? "cancelled" : "unknown",
          destination: { status: "pending" },
          claims: [],
          destinationBalance,
        };

        if (!record.intentId) return pending;

        const provider = await context.sdk.getIntentStatus(BigInt(record.intentId));
        const sourceClient = context.options.crossChain?.sourceClients[record.sourceChainId];

        if (
          !sourceClient ||
          (await sourceClient.getChainId()) !== record.sourceChainId ||
          (await config.publicClient.getChainId()) !== record.destinationChainId ||
          provider.fill.chainId !== record.destinationChainId ||
          provider.claims.some((claim) => claim.chainId !== record.sourceChainId)
        )
          throw new HcaError({
            code: "ADAPTER_MISMATCH",
            message: "Funding status or RPC belongs to another route",
          });

        const confirmations = BigInt(context.options.crossChain?.confirmations ?? 1);
        let destination: RhinestoneFundingStatus["destination"] = { status: "pending" };

        if (provider.fill.hash) {
          try {
            const receipt = await config.publicClient.getTransactionReceipt({
              hash: provider.fill.hash,
            });
            const block = await config.publicClient.getBlock({ blockNumber: receipt.blockNumber });
            const head = await config.publicClient.getBlockNumber({ cacheTime: 0 });
            let received = 0n;

            for (const log of parseEventLogs({
              abi: erc20Abi,
              eventName: "Transfer",
              logs: receipt.logs,
              strict: true,
            })) {
              if (log.address.toLowerCase() !== record.destinationToken.toLowerCase()) continue;
              if (log.args.to.toLowerCase() === record.destinationHca.toLowerCase())
                received += log.args.value;
              if (log.args.from.toLowerCase() === record.destinationHca.toLowerCase())
                received -= log.args.value;
            }

            const confirmed =
              receipt.status === "success" &&
              received >= record.amount &&
              block.hash === receipt.blockHash &&
              receipt.blockNumber > record.destinationStartBlock &&
              head - receipt.blockNumber + 1n >= confirmations;
            destination = {
              hash: provider.fill.hash,
              status:
                receipt.status === "reverted" ? "reverted" : confirmed ? "confirmed" : "pending",
            };
          } catch (cause) {
            if (!(cause instanceof TransactionReceiptNotFoundError)) throw cause;
          }
        }

        const claims = await Promise.all(
          provider.claims.map(async (claim): Promise<RhinestoneFundingStatus["claims"][number]> => {
            if (!claim.hash) {
              return { chainId: claim.chainId, status: "pending" };
            }

            try {
              const receipt = await sourceClient.getTransactionReceipt({ hash: claim.hash });
              const block = await sourceClient.getBlock({ blockNumber: receipt.blockNumber });
              const head = await sourceClient.getBlockNumber({ cacheTime: 0 });
              let spent = 0n;

              for (const log of parseEventLogs({
                abi: erc20Abi,
                eventName: "Transfer",
                logs: receipt.logs,
                strict: true,
              })) {
                if (log.address.toLowerCase() !== record.sourceToken.toLowerCase()) continue;
                if (log.args.from.toLowerCase() === record.sourceAccount.toLowerCase())
                  spent += log.args.value;
                if (log.args.to.toLowerCase() === record.sourceAccount.toLowerCase())
                  spent -= log.args.value;
              }

              const confirmed =
                receipt.status === "success" &&
                spent === record.sourceSpend &&
                block.hash === receipt.blockHash &&
                receipt.blockNumber > record.sourceStartBlock &&
                head - receipt.blockNumber + 1n >= confirmations;
              return {
                chainId: claim.chainId,
                hash: claim.hash,
                status:
                  receipt.status === "reverted" ? "reverted" : confirmed ? "confirmed" : "pending",
              };
            } catch (cause) {
              if (!(cause instanceof TransactionReceiptNotFoundError)) throw cause;
              return { chainId: claim.chainId, hash: claim.hash, status: "pending" };
            }
          }),
        );

        return {
          record,
          providerStatus: provider.status,
          destination,
          claims,
          destinationBalance,
          status:
            destination.status === "confirmed" && destinationBalance >= record.amount
              ? "funded"
              : ["PENDING", "PRECONFIRMED", "FILLED", "CLAIMED"].includes(provider.status) &&
                  destination.status !== "reverted"
                ? "pending"
                : "unknown",
        };
      },
      catch: (cause) =>
        cause instanceof HcaError
          ? cause
          : new HcaError({
              code: "ADAPTER_FAILED",
              message: "Could not reconcile funding receipts",
              cause,
            }),
    }),
  );
