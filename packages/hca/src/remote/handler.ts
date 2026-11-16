import { Schema } from "effect";

import { HcaError } from "@ensforge/core/legacy";
import {
  HcaRegistrationOperation,
  scopeHcaStorage,
  getHcaRegistration,
  resumeHcaRegistration,
  cancelHcaRegistration,
} from "@ensforge/core/legacy/hca";

import { HcaRemoteRequest, type HcaRemoteHandlerOptions, HcaRemoteProgressJson } from "./types.js";

const operationCodec = Schema.fromJsonString(Schema.toCodecJson(HcaRegistrationOperation));

/** Framework-neutral server boundary. The host supplies authentication and resource authorization. */
export const createHcaRemoteHandler =
  <Authentication, Principal>(options: HcaRemoteHandlerOptions<Authentication, Principal>) =>
  async (
    request: unknown,
    authentication: Authentication,
    signal?: AbortSignal,
  ): Promise<string> => {
    const principal = await options.authenticate(authentication);
    if (principal === null)
      throw new HcaError({
        code: "UNSUPPORTED_AUTHORIZATION",
        message: "Authentication is required",
      });

    const input = Schema.decodeUnknownSync(HcaRemoteRequest, { onExcessProperty: "error" })(
      request,
    );
    const config = await options.resolveConfig(principal);
    if (!config.storage)
      throw new HcaError({
        code: "INVALID_PARAMETERS",
        message: "Remote workflows require server storage",
      });

    const operation = await scopeHcaStorage(config.storage, "ens/registration", {
      encode: Schema.encodeSync(operationCodec),
      decode: Schema.decodeUnknownSync(operationCodec, { onExcessProperty: "error" }),
    }).get(input.id);
    if (
      !operation ||
      !(await options.authorize({
        principal,
        action: input.action,
        operationId: input.id,
        chainId: operation.chainId,
        hca: operation.hca,
        owner: operation.owner,
      }))
    )
      throw new HcaError({
        code: "UNSUPPORTED_AUTHORIZATION",
        message: "This operation is not authorized",
      });

    if (
      operation.chainId !== config.chainId ||
      operation.route.kind !== "adapter" ||
      operation.authorization.kind !== "session" ||
      !operation.signerReference
    )
      throw new HcaError({
        code: "UNSUPPORTED_AUTHORIZATION",
        message:
          "Remote progression requires a saved session and an explicit server signer reference",
      });

    const execution = await options.resolveExecution({
      principal,
      signerReference: operation.signerReference,
      operationId: operation.id,
    });
    const parameters = { id: input.id, execution };
    const runOptions = signal === undefined ? {} : { signal };
    const result =
      input.action === "resume"
        ? await resumeHcaRegistration(config, parameters, runOptions)
        : input.action === "cancel"
          ? await cancelHcaRegistration(config, parameters, runOptions)
          : await getHcaRegistration(config, parameters, runOptions);

    // Never send registration secrets, session keys, or provider payloads to the browser.
    return Schema.encodeSync(HcaRemoteProgressJson)({
      id: result.id,
      revision: result.revision,
      chainId: result.chainId,
      hca: result.hca,
      status: result.progress.status,
      ...(result.progress.status === "waiting"
        ? { readyAt: result.progress.readyAt, expiresAt: result.progress.expiresAt }
        : {}),
      ...(result.progress.status === "needs-funding"
        ? {
            token: result.progress.token,
            required: result.progress.required,
            balance: result.progress.balance,
          }
        : {}),
      ...(result.progress.status === "registered"
        ? { transactionHash: result.progress.transactionHash }
        : {}),
    });
  };
