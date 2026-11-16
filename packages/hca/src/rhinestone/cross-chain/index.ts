import { HcaError } from "@ensforge/core/legacy";
import type { RhinestoneSDK } from "@rhinestone/sdk";

import type { RhinestoneOptions } from "../types.js";
import { createCancelFunding } from "./cancel-funding/index.js";
import { fundingFingerprint, type FundingContext } from "./context.js";
import { createFund } from "./fund/index.js";
import { createGetFundingCleanup } from "./get-funding-cleanup/index.js";
import { createGetFundingStatus } from "./get-funding-status/index.js";
import { createQuoteFunding } from "./quote-funding/index.js";
import { createRecoverFunding } from "./recover-funding/index.js";
import type { RhinestoneCrossChain } from "./types.js";
import { createWaitForFunding } from "./wait-for-funding/index.js";

export const createRhinestoneCrossChain = (
  options: RhinestoneOptions,
  sdk: RhinestoneSDK,
): RhinestoneCrossChain => {
  const settings = options.crossChain;
  const lifetime = settings?.maximumQuoteLifetimeSeconds ?? 600;
  const confirmations = settings?.confirmations ?? 1;

  if (
    !Number.isSafeInteger(lifetime) ||
    lifetime <= 0 ||
    lifetime > 3600 ||
    !Number.isSafeInteger(confirmations) ||
    confirmations <= 0 ||
    new Set(settings?.routes.map((route) => route.id)).size !== (settings?.routes.length ?? 0) ||
    settings?.routes.some(
      (route) => !route.id || !route.provenance || !settings.sourceClients[route.sourceChainId],
    )
  )
    throw new HcaError({
      code: "INVALID_PARAMETERS",
      message:
        "Funding requires unique reviewed routes, source RPCs, confirmations and a bounded quote lifetime",
    });

  const context: FundingContext = {
    options,
    sdk,
    fingerprint: fundingFingerprint(options),
    quotes: new WeakMap(),
  };
  const getFundingStatus = createGetFundingStatus(context);

  return Object.freeze({
    quoteFunding: createQuoteFunding(context),
    fund: createFund(context),
    getFundingStatus,
    waitForFunding: createWaitForFunding(getFundingStatus),
    cancelFunding: createCancelFunding(context),
    recoverFunding: createRecoverFunding(context),
    getFundingCleanup: createGetFundingCleanup(context),
  });
};
