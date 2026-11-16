import { Effect } from "effect";

import { isAddressEqual, keccak256, stringToHex } from "viem";

import { defineAction } from "../../../action/action.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { AuthorizationError } from "../../../errors/authorization-error.js";
import { WritePlanError } from "../../../errors/write-plan-error.js";
import { withWorkflow } from "../../../internal/workflows/run.js";
import { normalizeName } from "../../../names/normalize.js";
import type { EthereumAddress } from "../../../schemas/identity.js";
import type { EnsProtocol } from "../../../schemas/protocol.js";
import type { WritePlan } from "../../../write/types.js";
import { executeWritePlan } from "../../batch/execute-write-plan.js";
import { getWriteTarget } from "../../capabilities/get-write-target/index.js";
import { getNameState } from "../../name/get-name-state/index.js";
import { getOwner } from "../../name/get-owner/index.js";
import { decodeTransferRecipient } from "../address.js";
import { reclaimName } from "../reclaim-name/index.js";
import { setManager } from "../set-manager/index.js";
import { transferRegistrant } from "../transfer-registrant/index.js";
import { transferOwnershipToken } from "../transfer-token.js";
import type {
  TransferNameError,
  TransferNameParameters,
  TransferNameResult,
  TransferNameStrategy,
} from "../types.js";

interface TransferRoute {
  readonly protocol: EnsProtocol;
  readonly strategy: TransferNameStrategy;
  readonly from: EthereumAddress;
  readonly contract: EthereumAddress;
  readonly tokenId: bigint | null;
}

const resolveTransferRoute = Effect.fn("ensforge.transferName.resolveRoute")(function* (
  config: EnsforgeConfig,
  name: string,
): Effect.fn.Return<TransferRoute, TransferNameError> {
  const [target, owner] = yield* Effect.all(
    [
      getWriteTarget.effect(config, { name, operation: { type: "transfer" } }),
      getOwner.effect(config, { name }),
    ] as const,
    { concurrency: "unbounded" },
  );

  if (!target.available || owner === null) {
    return yield* new AuthorizationError({
      code: "WRITE_TARGET_UNAVAILABLE",
      message: `Ownership is unavailable for ${name}`,
    });
  }

  const from = target.kind === "registrar" ? owner.registrant : owner.owner;

  if (from === null) {
    return yield* new AuthorizationError({
      code: "WRITE_TARGET_UNAVAILABLE",
      message: `The current transferable owner is unavailable for ${name}`,
    });
  }

  const strategy: TransferNameStrategy =
    target.protocol === "v2"
      ? "v2-registry"
      : target.kind === "registrar"
        ? "registrar-and-manager"
        : target.kind === "name-wrapper"
          ? "name-wrapper"
          : "registry";

  return {
    protocol: target.protocol,
    strategy,
    from,
    contract: target.address,
    tokenId: target.tokenId,
  };
});

const makePlanId = (name: string, to: EthereumAddress, strategy: TransferNameStrategy) =>
  `transferName:${keccak256(stringToHex(JSON.stringify({ name, to, strategy })))}`;

const makePlan = (
  name: string,
  to: EthereumAddress,
  route: TransferRoute,
  parameters: TransferNameParameters,
): WritePlan => {
  const calls =
    route.strategy === "registrar-and-manager"
      ? [reclaimName.call({ name, manager: to }), transferRegistrant.call({ name, to })]
      : route.strategy === "registry"
        ? [setManager.call({ name, manager: to })]
        : [
            transferOwnershipToken.call({
              name,
              protocol: route.protocol,
              contract: route.contract,
              tokenId: route.tokenId ?? 0n,
              from: route.from,
              ...(parameters.unsafe === undefined ? {} : { unsafe: parameters.unsafe }),
              to,
            }),
          ];

  return {
    id: makePlanId(name, to, route.strategy),
    stages: [
      {
        type: "calls",
        id: "transfer-ownership",
        calls,
        mode: parameters.mode ?? "auto",
        atomicity: calls.length > 1 ? "preferred" : "none",
        confirmation: parameters.confirmation ?? { type: "confirmed" },
      },
    ],
  };
};

const isConfirmed = (write: TransferNameResult["write"]) =>
  write.status === "completed" &&
  write.completedStages.every((stage) =>
    stage.result.calls.every((call) => call.status === "confirmed"),
  );

const implementation = Effect.fn("ensforge.transferName")(function* (
  config: EnsforgeConfig,
  parameters: TransferNameParameters,
): Effect.fn.Return<TransferNameResult, TransferNameError> {
  const name = yield* normalizeName.effect(parameters.name);
  const to = yield* decodeTransferRecipient(parameters.to);
  const current = yield* resolveTransferRoute(config, name);

  const route: TransferRoute =
    parameters.resume === undefined ? current : { ...current, from: parameters.resume.from };

  if (
    parameters.resume !== undefined &&
    (parameters.resume.name !== name ||
      !isAddressEqual(parameters.resume.to, to) ||
      parameters.resume.protocol !== current.protocol ||
      parameters.resume.strategy !== current.strategy)
  ) {
    return yield* new WritePlanError({
      code: "INVALID_CALL_PLAN",
      message: "Transfer progress does not match the current name and transfer parameters",
      cause: parameters.resume,
    });
  }

  const write = yield* executeWritePlan.effect(config, {
    plan: makePlan(name, to, route, parameters),
    ...(parameters.resume === undefined ? {} : { resume: parameters.resume.write }),
    ...(parameters.walletClient === undefined ? {} : { walletClient: parameters.walletClient }),
    ...(parameters.account === undefined ? {} : { account: parameters.account }),
  });

  const finalState = isConfirmed(write) ? yield* getNameState.effect(config, { name }) : null;

  return {
    name,
    protocol: route.protocol,
    strategy: route.strategy,
    from: route.from,
    to,
    write,
    finalState,
  };
});

export const transferName = defineAction<
  TransferNameParameters,
  TransferNameResult,
  TransferNameError
>(withWorkflow("transferName", implementation));

export type {
  TransferNameError,
  TransferNameParameters,
  TransferNameProgress,
  TransferNameResult,
  TransferNameStrategy,
} from "../types.js";
