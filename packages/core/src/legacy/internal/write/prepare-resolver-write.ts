import { Effect } from "effect";

import type { Account, Address } from "viem";

import { getRecordPermissions } from "../../actions/capabilities/get-record-permissions/index.js";
import { getResolverCapabilities } from "../../actions/capabilities/get-resolver-capabilities/index.js";
import { getWriteTarget } from "../../actions/capabilities/get-write-target/index.js";
import type { RecordOperation } from "../../actions/capabilities/types.js";
import type { EnsforgeConfig } from "../../config/config.js";
import { AuthorizationError } from "../../errors/authorization-error.js";
import { WritePlanError } from "../../errors/write-plan-error.js";
import { normalizeName } from "../../names/normalize.js";
import type { EthereumAddress } from "../../schemas/identity.js";

export const prepareResolverWrite = Effect.fn("prepareResolverWrite")(function* (
  config: EnsforgeConfig,
  parameters: {
    readonly name: string;
    readonly records: ReadonlyArray<RecordOperation>;
    readonly account: Account | Address;
  },
) {
  const name = yield* normalizeName.effect(parameters.name);
  const operation = parameters.records[0];

  if (operation === undefined) {
    return yield* new WritePlanError({
      code: "INVALID_CALL_PLAN",
      message: "A resolver write must contain at least one record mutation",
      cause: parameters.records,
    });
  }

  const account = (
    typeof parameters.account === "string" ? parameters.account : parameters.account.address
  ) as EthereumAddress;

  const target = yield* getWriteTarget.effect(config, { name, operation });

  if (!target.available || target.kind !== "resolver") {
    return yield* new AuthorizationError({
      code: "WRITE_TARGET_UNAVAILABLE",
      message: `No writable resolver is available for ${name}`,
    });
  }

  const permissions = yield* getRecordPermissions.effect(config, {
    name,
    account,
    records: parameters.records,
  });

  const unsupported = permissions.records.find((permission) => !permission.supported);

  if (unsupported !== undefined) {
    return yield* new AuthorizationError({
      code: "RECORD_UNSUPPORTED",
      message: `The resolver for ${name} does not support ${unsupported.record.type} records`,
    });
  }

  const unauthorized = permissions.records.find(
    (permission) => permission.authorization.status === "unauthorized",
  );

  if (unauthorized !== undefined) {
    return yield* new AuthorizationError({
      code: "UNAUTHORIZED",
      message: `${account} is not authorized to set ${unauthorized.record.type} records for ${name}`,
    });
  }

  const capabilities = yield* getResolverCapabilities.effect(config, { name });

  return { name, account, target, permissioned: capabilities.permissioned } as const;
});
