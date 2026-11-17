import { Effect } from "effect";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { normalizeName } from "../../../names/normalize.js";
import { getResolver } from "../../resolution/get-resolver/index.js";
import { getCanonicalResource } from "../get-canonical-resource/index.js";
import { getExpiry } from "../get-expiry/index.js";
import { getManager } from "../get-manager/index.js";
import { getNameStatus } from "../get-name-status/index.js";
import { getOwner } from "../get-owner/index.js";
import { getProtocol } from "../get-protocol/index.js";
import { getRegistrant } from "../get-registrant/index.js";
import { getRegistry } from "../get-registry/index.js";
import { getTokenId } from "../get-token-id/index.js";
import { isAvailable } from "../is-available/index.js";
import { isMigrated } from "../is-migrated/index.js";
import { isRenewable } from "../is-renewable/index.js";
import { isReserved } from "../is-reserved/index.js";
import { isWrapped } from "../is-wrapped/index.js";
import type { GetNameStateError, GetNameStateParameters, NameState } from "./types.js";

const getNameStateEffect = Effect.fn("ensforge.getNameState")(function* (
  config: EnsforgeConfig,
  parameters: GetNameStateParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const [
        protocol,
        ownerResult,
        manager,
        registrant,
        status,
        registry,
        resolver,
        expiry,
        tokenId,
        resource,
        wrapped,
        migrated,
        reserved,
        available,
        renewable,
      ] = yield* Effect.all(
        [
          getProtocol.effect(config, parameters),
          getOwner.effect(config, parameters),
          getManager.effect(config, parameters),
          getRegistrant.effect(config, parameters),
          getNameStatus.effect(config, parameters),
          getRegistry.effect(config, parameters),
          getResolver.effect(config, parameters),
          getExpiry.effect(config, parameters),
          getTokenId.effect(config, parameters),
          getCanonicalResource.effect(config, parameters),
          isWrapped.effect(config, parameters),
          isMigrated.effect(config, parameters),
          isReserved.effect(config, parameters),
          isAvailable.effect(config, parameters),
          isRenewable.effect(config, parameters),
        ] as const,
        { concurrency: "unbounded" },
      );

      const fields = {
        name,
        status,
        owner: ownerResult?.owner ?? null,
        manager,
        registrant,
        registry,
        resolver,
        expiry: expiry?.expiry ?? null,
        gracePeriodEnd: expiry?.gracePeriodEnd ?? null,
        tokenId,
        resource,
        available,
        renewable,
      } as const;

      if (status === "available" && expiry === null) {
        return {
          ...fields,
          kind: "available",
          protocol,
          wrapped: false,
          migrated: false,
        } as const;
      }

      if (reserved) {
        return {
          ...fields,
          kind: "v2-reserved",
          protocol: "v1",
          wrapped,
          migrated: false,
        } as const;
      }

      if (protocol === "v1") {
        return wrapped
          ? ({
              ...fields,
              kind: "v1-wrapped",
              protocol: "v1",
              wrapped: true,
              migrated: false,
            } as const)
          : ({
              ...fields,
              kind: "v1-unwrapped",
              protocol: "v1",
              wrapped: false,
              migrated: false,
            } as const);
      }

      return migrated
        ? ({ ...fields, kind: "v2-migrated", protocol: "v2", wrapped, migrated: true } as const)
        : ({ ...fields, kind: "v2-native", protocol: "v2", wrapped, migrated: false } as const);
    }),
  );
});

export const getNameState = defineReadAction<GetNameStateParameters, NameState, GetNameStateError>(
  getNameStateEffect,
);

export {
  AvailableNameState,
  NameState,
  NameStatus,
  V1UnwrappedNameState,
  V1WrappedNameState,
  V2MigratedNameState,
  V2NativeNameState,
  V2ReservedNameState,
  type GetNameStateError,
  type GetNameStateParameters,
} from "./types.js";
