import { Effect } from "effect";

import { keccak256, stringToHex } from "viem";
import { normalize } from "viem/ens";

import type {
  HcaRegistrationOperation,
  StartHcaRegistrationParameters,
} from "../../../actions/hca/registration-types.js";
import { resumeHcaRegistration } from "../../../actions/hca/resume-hca-registration/index.js";
import { verifyHca } from "../../../actions/hca/verify-hca/index.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { HcaError } from "../../../errors/hca-error.js";
import { acquireWorkflow } from "../../workflows/acquire.js";
import { encodeWorkflowValue } from "../../workflows/codec.js";
import { registrationStorage } from "./storage.js";

export const startRegistrationWorkflow = (
  config: EnsforgeConfig,
  input: StartHcaRegistrationParameters,
  start: (
    parameters: StartHcaRegistrationParameters & { readonly id: string },
  ) => Effect.Effect<HcaRegistrationOperation, HcaError>,
) =>
  Effect.tryPromise({
    try: async (signal) => {
      if (input.id) return Effect.runPromise(start({ ...input, id: input.id }), { signal });
      const storage = input.storage ?? config.storage;
      if (!storage || !("kind" in storage))
        throw new HcaError({
          code: "INVALID_PARAMETERS",
          message:
            "Automatic registration IDs require shared workflow storage; legacy storage still accepts explicit IDs",
        });

      const account = await verifyHca(
        config,
        { hca: input.hca, ...(input.salt === undefined ? {} : { salt: input.salt }) },
        { signal },
      );
      const fingerprint = keccak256(
        stringToHex(
          encodeWorkflowValue({
            operation: "hcaRegistration",
            chainId: config.chainId,
            profileId: account.profileId,
            hca: account.address.toLowerCase(),
            owner: account.owner.toLowerCase(),
            name: normalize(input.name),
            duration: input.duration,
            resolver: input.resolver.toLowerCase(),
            paymentToken: input.paymentToken.toLowerCase(),
            subregistry: input.subregistry?.toLowerCase(),
            referrer: input.referrer?.toLowerCase(),
            primaryName: input.primaryName ?? false,
            authorization: input.authorization,
            limits: input.limits,
            route: input.execution
              ? { id: input.execution.id, instanceId: input.execution.instanceId }
              : { id: "owner" },
          }),
        ),
      );
      const session = await acquireWorkflow(storage, {
        fingerprint,
        operation: "hcaRegistration",
        chainId: config.chainId,
        account: account.owner.toLowerCase(),
      });

      try {
        const parameters = { ...input, storage, id: session.record.id };
        const saved = await registrationStorage(parameters).get(parameters.id);
        const result = saved
          ? await resumeHcaRegistration(config, parameters, { signal })
          : await Effect.runPromise(start(parameters), { signal });
        await session.update((record) => ({
          ...record,
          status: ["registered", "cancelled", "failed", "expired"].includes(result.progress.status)
            ? "completed"
            : "pending",
          progress: { id: result.id, status: result.progress.status },
        }));
        return result;
      } finally {
        await session.release();
      }
    },
    catch: (cause) =>
      cause instanceof HcaError
        ? cause
        : new HcaError({
            code: "INVALID_EXECUTION",
            message: "HCA workflow could not advance; saved state is retained",
            cause,
          }),
  });
