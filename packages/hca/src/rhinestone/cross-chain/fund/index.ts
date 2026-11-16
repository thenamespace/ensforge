import { Effect } from "effect";

import { defineAction, HcaError } from "@ensforge/core/legacy";
import { getPermit2Address } from "@rhinestone/sdk";
import { erc20Abi, recoverAddress } from "viem";

import { createRhinestoneHca } from "../../account.js";
import { getFundingRoute, verifyFundingContracts, type FundingContext } from "../context.js";
import { permit2NonceAbi } from "../permit.js";
import { reviewFunding } from "../review.js";
import { fundingStorage } from "../storage.js";
import type { RhinestoneCrossChain, RhinestoneFundingRecord } from "../types.js";

export const createFund = (context: FundingContext): RhinestoneCrossChain["fund"] =>
  defineAction((config, { quote, storage }) =>
    Effect.tryPromise({
      try: async () => {
        const local = context.quotes.get(quote);
        const record = quote.record;

        if (!local || local.used)
          throw new HcaError({
            code: "INVALID_EXECUTION",
            message:
              "Quote is unavailable or already used; reconcile saved funding before requesting another",
          });

        const route = getFundingRoute(context, record.routeId);
        await verifyFundingContracts(context, config, route, local.source);
        await createRhinestoneHca(
          context.options,
          context.sdk,
          config,
          record.destinationHca,
          record.salt,
        );
        const request = {
          id: record.id,
          routeId: record.routeId,
          source: local.source,
          destinationHca: record.destinationHca,
          amount: record.amount,
          maximumSourceSpend: record.maximumSourceSpend,
        };
        const maximumLifetime = context.options.crossChain?.maximumQuoteLifetimeSeconds ?? 600;
        const review = reviewFunding(
          local.account,
          local.prepared,
          route,
          request,
          maximumLifetime,
        );

        if (review.scopeHash !== record.scopeHash)
          throw new HcaError({
            code: "INVALID_EXECUTION",
            message: "Funding quote changed after review",
          });

        const allowance = await local.source.publicClient.readContract({
          address: route.sourceToken,
          abi: erc20Abi,
          functionName: "allowance",
          args: [record.sourceAccount, getPermit2Address()],
        });
        const balance = await local.source.publicClient.readContract({
          address: route.sourceToken,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [record.sourceAccount],
        });
        const bitmap = await local.source.publicClient.readContract({
          address: getPermit2Address(),
          abi: permit2NonceAbi,
          functionName: "nonceBitmap",
          args: [record.sourceAccount, record.permitNonce >> 8n],
        });

        if (
          allowance < record.sourceSpend ||
          balance < record.sourceSpend ||
          (bitmap & (1n << (record.permitNonce & 255n))) !== 0n
        )
          throw new HcaError({
            code: "INVALID_EXECUTION",
            message: "Confirm source funding/approval and use an unused Permit2 nonce",
          });

        if (!(await fundingStorage(storage ?? config.storage).create(record)))
          throw new HcaError({
            code: "INVALID_EXECUTION",
            message: "Funding ID already exists; no signature or submission was made",
          });

        local.used = true;
        const signed = await local.account.signTransaction(local.prepared);
        const signature = signed.originSignatures[0];

        if (
          typeof signature !== "string" ||
          signed.originSignatures.length !== 1 ||
          (await recoverAddress({ hash: record.scopeHash, signature })).toLowerCase() !==
            record.sourceAccount.toLowerCase()
        )
          throw new HcaError({
            code: "INVALID_EXECUTION",
            message: "Source signer did not authorize the reviewed funding mandate",
          });

        if (
          record.expiresAt <= BigInt(Math.floor(Date.now() / 1000)) ||
          record.fillDeadline <= BigInt(Math.floor(Date.now() / 1000))
        )
          throw new HcaError({
            code: "EXECUTION_EXPIRED",
            message: "Funding quote expired while signing",
          });

        // Wallet callbacks must not be able to change the prepared SDK object during signing.
        const signedReview = reviewFunding(local.account, signed, route, request, maximumLifetime);
        if (signedReview.scopeHash !== record.scopeHash)
          throw new HcaError({
            code: "INVALID_EXECUTION",
            message: "Signed funding route differs from the reviewed quote",
          });

        await verifyFundingContracts(context, config, route, local.source);

        const submitting: RhinestoneFundingRecord = { ...record, revision: 1, state: "submitting" };

        // Never release this claim on a timeout: the provider may have accepted the signed intent.
        if (
          !(await fundingStorage(storage ?? config.storage).compareAndSwap({
            id: record.id,
            expectedRevision: 0,
            operation: submitting,
          }))
        )
          throw new HcaError({
            code: "INVALID_EXECUTION",
            message: "Funding was cancelled or changed before submission",
          });

        const result = await local.account.submitTransaction(signed);

        if (
          result.type !== "intent" ||
          result.targetChain !== record.destinationChainId ||
          result.sourceChains?.some((chain) => chain !== record.sourceChainId)
        )
          throw new HcaError({
            code: "INVALID_SUBMISSION",
            message: "Unexpected provider result; recover the funding identifier before continuing",
          });

        const submitted: RhinestoneFundingRecord = {
          ...submitting,
          revision: 2,
          state: "submitted",
          intentId: result.id.toString(),
        };

        if (
          !(await fundingStorage(storage ?? config.storage).compareAndSwap({
            id: record.id,
            expectedRevision: 1,
            operation: submitted,
          }))
        )
          throw new HcaError({
            code: "INVALID_SUBMISSION",
            message: `Funding submitted as ${result.id}; recover this identifier into storage`,
          });

        context.quotes.delete(quote);

        return submitted;
      },
      catch: (cause) =>
        cause instanceof HcaError
          ? cause
          : new HcaError({
              code: "ADAPTER_FAILED",
              message: "Funding failed; inspect durable state before retrying",
              cause,
            }),
    }),
  );
