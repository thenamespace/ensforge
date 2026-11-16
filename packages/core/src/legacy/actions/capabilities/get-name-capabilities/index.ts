import { Effect } from "effect";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { normalizeName } from "../../../names/normalize.js";
import type { EthereumAddress } from "../../../schemas/identity.js";
import { getRecordPermissions } from "../get-record-permissions/index.js";
import { getRegistryCapabilities } from "../get-registry-capabilities/index.js";
import { getRequiredAuthorization } from "../get-required-authorization/index.js";
import { getResolverCapabilities } from "../get-resolver-capabilities/index.js";
import type {
  CapabilityError,
  NameCapabilities,
  NameCapabilityParameters,
  RecordOperation,
} from "../types.js";

export type GetNameCapabilitiesParameters = NameCapabilityParameters & {
  readonly account: EthereumAddress;
  readonly records?: ReadonlyArray<RecordOperation>;
};

const getNameCapabilitiesEffect = Effect.fn("ensforge.getNameCapabilities")(function* (
  config: EnsforgeConfig,
  parameters: GetNameCapabilitiesParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const records = parameters.records ?? [];

      const [registry, resolver, recordPermissions, authorizations] = yield* Effect.all(
        [
          getRegistryCapabilities.effect(config, parameters),
          getResolverCapabilities.effect(config, parameters),
          getRecordPermissions.effect(config, { ...parameters, records }),
          Effect.all(
            {
              setOwner: getRequiredAuthorization.effect(config, {
                ...parameters,
                operation: { type: "setOwner" },
              }),
              setResolver: getRequiredAuthorization.effect(config, {
                ...parameters,
                operation: { type: "setResolver" },
              }),
              createSubname: getRequiredAuthorization.effect(config, {
                ...parameters,
                operation: { type: "createSubname" },
              }),
              transfer: getRequiredAuthorization.effect(config, {
                ...parameters,
                operation: { type: "transfer" },
              }),
              setExpiry: getRequiredAuthorization.effect(config, {
                ...parameters,
                operation: { type: "setExpiry" },
              }),
            },
            { concurrency: "unbounded" },
          ),
        ] as const,
        { concurrency: "unbounded" },
      );

      return {
        name,
        account: parameters.account,
        registry,
        resolver,
        records: recordPermissions.records,
        ownership: {
          setOwner: authorizations.setOwner.authorization.status === "authorized",
          setResolver: authorizations.setResolver.authorization.status === "authorized",
          createSubname: authorizations.createSubname.authorization.status === "authorized",
          transfer: authorizations.transfer.authorization.status === "authorized",
          setExpiry: authorizations.setExpiry.authorization.status === "authorized",
        },
      } satisfies NameCapabilities;
    }),
  );
});

export const getNameCapabilities = defineReadAction<
  GetNameCapabilitiesParameters,
  NameCapabilities,
  CapabilityError
>(getNameCapabilitiesEffect);

export type { CapabilityError as GetNameCapabilitiesError, NameCapabilities } from "../types.js";
