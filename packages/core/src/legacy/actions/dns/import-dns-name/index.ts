import { Effect } from "effect";

import { keccak256, stringToHex } from "viem";

import { defineAction } from "../../../action/action.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { DnsImportError } from "../../../errors/dns-import-error.js";
import { withWorkflow } from "../../../internal/workflows/run.js";
import { normalizeName } from "../../../names/normalize.js";
import type { WriteError, WritePlan } from "../../../write/types.js";
import { executeWritePlan } from "../../batch/execute-write-plan.js";
import { claimDnsName } from "../claim-dns-name/index.js";
import { getDnsClaimStatus } from "../get-dns-claim-status/index.js";
import { getDnsImportPlan } from "../get-dns-import-plan/index.js";
import type { ImportDnsNameParameters, ImportDnsNameResult } from "../types.js";

const importDnsNameEffect = Effect.fn("ensforge.importDnsName")(function* (
  config: EnsforgeConfig,
  parameters: ImportDnsNameParameters,
): Effect.fn.Return<ImportDnsNameResult, WriteError> {
  const name = yield* normalizeName.effect(parameters.name);

  const planId = `importDnsName:${keccak256(
    stringToHex(
      JSON.stringify({
        name,
        proof: parameters.proof,
        resolver: parameters.resolver ?? null,
        address: parameters.address ?? null,
      }),
    ),
  )}`;

  if (
    parameters.resume !== undefined &&
    parameters.resume.write !== null &&
    parameters.resume.write.planId !== planId
  ) {
    return yield* new DnsImportError({
      code: "RESUME_MISMATCH",
      message: `DNS import progress does not match ${name}`,
    });
  }

  const importPlan = yield* getDnsImportPlan.effect(config, { name });

  if (importPlan.status === "unsupported") {
    return yield* new DnsImportError({
      code: "DNS_REGISTRAR_UNAVAILABLE",
      message: `DNS imports are unavailable for ${name}`,
    });
  }

  if (importPlan.status === "already-claimed") {
    return {
      status: "not-required",
      name,
      owner: importPlan.owner,
      resolver: importPlan.resolver,
      write: parameters.resume?.write ?? null,
    };
  }

  const plan: WritePlan = {
    id: planId,
    stages: [
      {
        type: "calls",
        id: "claim",
        calls: [
          claimDnsName.call({
            name,
            proof: parameters.proof,
            ...(parameters.resolver === undefined ? {} : { resolver: parameters.resolver }),
            ...(parameters.address === undefined ? {} : { address: parameters.address }),
          }),
        ],
        mode: parameters.mode ?? "sequential",
        atomicity: "none",
        confirmation: parameters.confirmation ?? { type: "confirmed" },
      },
    ],
  };

  const write = yield* executeWritePlan.effect(config, {
    plan,
    ...(parameters.resume?.write === undefined || parameters.resume.write === null
      ? {}
      : { resume: parameters.resume.write }),
    ...(parameters.walletClient === undefined ? {} : { walletClient: parameters.walletClient }),
    ...(parameters.account === undefined ? {} : { account: parameters.account }),
  });

  if (write.status !== "completed") {
    return { status: "partial", name, owner: null, resolver: null, write };
  }

  const claimed = yield* getDnsClaimStatus.effect(config, { name });

  if (claimed.status !== "claimed") {
    return yield* new DnsImportError({
      code: "CLAIM_NOT_CONFIRMED",
      message: `The DNS Registrar did not report ${name} as claimed after execution`,
    });
  }

  return {
    status: "completed",
    name,
    owner: claimed.owner,
    resolver: claimed.resolver,
    write,
  };
});

export const importDnsName = defineAction<ImportDnsNameParameters, ImportDnsNameResult, WriteError>(
  withWorkflow("importDnsName", importDnsNameEffect),
);

export type { ImportDnsNameError, ImportDnsNameParameters, ImportDnsNameResult } from "../types.js";
