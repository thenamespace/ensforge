import { Effect, Schema } from "effect";

import { permissionedResolverV2InterfaceHasRootRolesAbi } from "@ensforge/contracts/internal";
import { enhancedAccessControlRoles } from "@ensforge/contracts/v2";
import { bytesToHex, zeroAddress, zeroHash } from "viem";

import { defineAction } from "../../../action/action.js";
import { HcaError } from "../../../errors/hca-error.js";
import { startRegistrationWorkflow } from "../../../internal/hca/registration/start-workflow.js";
import { registrationStorage } from "../../../internal/hca/registration/storage.js";
import { getRegistrationParameters } from "../../registration/get-registration-parameters/index.js";
import { makeRegistrationCommitment } from "../../registration/make-registration-commitment/index.js";
import {
  HcaRegistrationLimits,
  HcaRegistrationOperation,
  type StartHcaRegistrationParameters,
} from "../registration-types.js";
import { resumeHcaRegistration } from "../resume-hca-registration/index.js";
import { verifyHca } from "../verify-hca/index.js";

export const startHcaRegistration = defineAction<
  StartHcaRegistrationParameters,
  HcaRegistrationOperation,
  HcaError
>((config, provided) =>
  startRegistrationWorkflow(config, provided, (input) => {
    const storage = input.storage ?? config.storage;
    const parameters = { ...input, ...(storage === undefined ? {} : { storage }) };
    return Effect.tryPromise({
      try: async (signal) => {
        const limits = Schema.decodeUnknownSync(HcaRegistrationLimits)(parameters.limits);
        const account = await verifyHca(
          config,
          {
            hca: parameters.hca,
            ...(parameters.salt === undefined ? {} : { salt: parameters.salt }),
          },
          { signal },
        );

        if (
          parameters.authorization.kind === "session" &&
          (!parameters.execution || !parameters.signerReference)
        )
          throw new HcaError({
            code: "INVALID_PARAMETERS",
            message:
              "Session registration requires an execution adapter and a protected signer reference",
          });

        const settings = await getRegistrationParameters(config, {}, { signal });

        if (
          settings.protocol !== "v2" ||
          parameters.duration < settings.minimumRegistrationDuration
        )
          throw new HcaError({
            code: "INVALID_PARAMETERS",
            message: "HCA registration requires ENSv2 and its minimum registration duration",
          });

        const controlsResolver = await config.publicClient.readContract({
          address: parameters.resolver,
          abi: permissionedResolverV2InterfaceHasRootRolesAbi,
          functionName: "hasRootRoles",
          args: [enhancedAccessControlRoles.allRoles, account.address],
        });

        const ownerControlsResolver = await config.publicClient.readContract({
          address: parameters.resolver,
          abi: permissionedResolverV2InterfaceHasRootRolesAbi,
          functionName: "hasRootRoles",
          args: [enhancedAccessControlRoles.allRoles, account.owner],
        });

        if (!controlsResolver || !ownerControlsResolver)
          throw new HcaError({
            code: "INVALID_PARAMETERS",
            message:
              "Deploy a permissioned resolver with ALL root roles for both the HCA and owner before starting registration",
          });

        const secret = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
        const registration = {
          name: parameters.name,
          duration: parameters.duration,
          secret,
          resolver: parameters.resolver,
          paymentToken: parameters.paymentToken,
          subregistry: parameters.subregistry ?? zeroAddress,
          referrer: parameters.referrer ?? zeroHash,
          primaryName: parameters.primaryName ?? false,
        };

        const commitment = await makeRegistrationCommitment(
          config,
          { ...registration, owner: account.owner },
          { signal },
        );

        const now = BigInt(Date.now());
        const operation = Schema.decodeUnknownSync(Schema.toType(HcaRegistrationOperation), {
          onExcessProperty: "error",
        })({
          schemaVersion: 1,
          id: parameters.id,
          revision: 0,
          chainId: config.chainId,
          profileId: account.profileId,
          hca: account.address,
          owner: account.owner,
          salt: account.salt,
          registration: {
            ...registration,
            name: commitment.name,
            commitment: commitment.commitment,
            registrar: commitment.registrar,
          },
          authorization: parameters.authorization,
          ...(parameters.signerReference === undefined
            ? {}
            : { signerReference: parameters.signerReference }),
          route: parameters.execution
            ? {
                kind: "adapter",
                id: parameters.execution.id,
                instanceId: parameters.execution.instanceId,
              }
            : { kind: "owner" },
          limits,
          progress: { status: "created" },
          createdAt: now,
          updatedAt: now,
        });

        if (!(await registrationStorage(parameters).create(operation)))
          throw new HcaError({
            code: "INVALID_PARAMETERS",
            message: "Registration ID already exists; resume that operation instead",
          });

        return resumeHcaRegistration(
          config,
          {
            id: operation.id,
            ...(parameters.storage === undefined ? {} : { storage: parameters.storage }),
            ...(parameters.execution ? { execution: parameters.execution } : {}),
          },
          { signal },
        );
      },
      catch: (cause) =>
        cause instanceof HcaError
          ? cause
          : new HcaError({
              code: "INVALID_EXECUTION",
              message: "HCA registration could not progress; saved state is retained",
              cause,
            }),
    });
  }),
);
