import { Effect } from "effect";

import { isAddressEqual, keccak256, stringToHex, zeroAddress } from "viem";

import { defineAction } from "../../../action/action.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { AuthorizationError } from "../../../errors/authorization-error.js";
import { withWorkflow } from "../../../internal/workflows/run.js";
import { dnsEncodeName } from "../../../names/dns.js";
import { labelhash } from "../../../names/hashes.js";
import type { WritePlan } from "../../../write/types.js";
import { executeWritePlan } from "../../batch/execute-write-plan.js";
import { getOperatorApproval } from "../../capabilities/get-operator-approval/index.js";
import { getTokenApproval } from "../../capabilities/get-token-approval/index.js";
import { getManager } from "../../name/get-manager/index.js";
import { getNameState } from "../../name/get-name-state/index.js";
import { decodeOwnershipAddress } from "../../ownership/address.js";
import { setOperatorApproval } from "../../permissions/operator-approval/index.js";
import { setResolver } from "../../resolution/set-resolver/index.js";
import { encodeFuseMask, wrapperFuseMasks } from "../fuse-mask.js";
import { approveWrapperIntent, wrapEth2ldIntent, wrapIntent } from "../intents.js";
import { requireV1WrapperRoute } from "../route.js";
import type {
  WrapNameParameters,
  WrapNameResult,
  WrapperWriteError,
  WrapperWriteIntent,
} from "../types.js";

const confirmed = (write: WrapNameResult["write"]) =>
  write.status === "completed" &&
  write.completedStages.every((stage) =>
    stage.result.calls.every((call) => call.status === "confirmed"),
  );

const wrapNameEffect = Effect.fn("ensforge.wrapName")(function* (
  config: EnsforgeConfig,
  parameters: WrapNameParameters,
): Effect.fn.Return<WrapNameResult, WrapperWriteError> {
  const route = yield* requireV1WrapperRoute(config, parameters.name);
  const strategy = route.analysis.isSecondLevelEth ? "eth-2ld" : "registry";

  if (route.wrapped && (parameters.resume === undefined || strategy !== "registry")) {
    return yield* new AuthorizationError({
      code: "WRITE_TARGET_UNAVAILABLE",
      message: `${route.name} is already wrapped`,
    });
  }

  const owner = yield* decodeOwnershipAddress(parameters.owner, "wrapped owner");

  const resolver =
    parameters.resolver === undefined
      ? zeroAddress
      : yield* decodeOwnershipAddress(parameters.resolver, "wrapper resolver");

  const requestedFuses = yield* encodeFuseMask(
    parameters.fuses ?? 0,
    wrapperFuseMasks.ownerControlledMask,
  );

  if (!route.analysis.isSecondLevelEth && requestedFuses !== 0) {
    return yield* new AuthorizationError({
      code: "WRITE_TARGET_UNAVAILABLE",
      message: "Initial owner-controlled fuses are only supported while wrapping a .eth 2LD",
    });
  }

  const approvalCalls: Array<WrapperWriteIntent> = [];
  const wrapCalls: Array<WrapperWriteIntent> = [];
  const cleanupCalls: Array<WrapperWriteIntent> = [];
  let registrarApprovalAdded = parameters.resume?.approvals.registrar ?? false;
  let registryApprovalAdded = parameters.resume?.approvals.registry ?? false;

  if (strategy === "eth-2ld") {
    const tokenId = BigInt(labelhash(route.analysis.ethSecondLevelLabel ?? ""));

    if (parameters.resume === undefined) {
      const approval = yield* getTokenApproval.effect(config, { name: route.name });

      registrarApprovalAdded =
        approval.supported &&
        (approval.approved === null ||
          !isAddressEqual(approval.approved, route.deployment.contracts.nameWrapper));
    }

    if (registrarApprovalAdded) {
      approvalCalls.push(
        yield* approveWrapperIntent(
          route.deployment.contracts.baseRegistrar,
          route.deployment.contracts.nameWrapper,
          tokenId,
        ),
      );
    }

    wrapCalls.push(
      yield* wrapEth2ldIntent({
        wrapper: route.deployment.contracts.nameWrapper,
        label: route.analysis.ethSecondLevelLabel ?? "",
        owner,
        resolver,
        fuses: requestedFuses,
      }),
    );
  } else {
    if (parameters.resume === undefined) {
      const manager = yield* getManager.effect(config, { name: route.name });

      if (manager === null) {
        return yield* new AuthorizationError({
          code: "WRITE_TARGET_UNAVAILABLE",
          message: `Registry ownership is unavailable for ${route.name}`,
        });
      }

      const approval = yield* getOperatorApproval.effect(config, {
        name: route.name,
        owner: manager,
        operator: route.deployment.contracts.nameWrapper,
      });

      registryApprovalAdded = !approval.targets.some(
        (target) => target.kind === "registry" && target.supported && target.approved,
      );
    }

    if (registryApprovalAdded) {
      approvalCalls.push(
        setOperatorApproval.call({
          name: route.name,
          target: "registry",
          operator: route.deployment.contracts.nameWrapper,
          approved: true,
        }),
      );

      cleanupCalls.push(
        setOperatorApproval.call({
          name: route.name,
          target: "registry",
          operator: route.deployment.contracts.nameWrapper,
          approved: false,
        }),
      );
    }

    if (!isAddressEqual(resolver, zeroAddress)) {
      wrapCalls.push(setResolver.call({ name: route.name, resolver }));
    }

    wrapCalls.push(
      yield* wrapIntent({
        wrapper: route.deployment.contracts.nameWrapper,
        name: yield* dnsEncodeName.effect(route.name),
        owner,
        resolver: zeroAddress,
      }),
    );
  }

  const stages: WritePlan["stages"] extends ReadonlyArray<infer Stage> ? Array<Stage> : never = [];

  if (approvalCalls.length > 0) {
    stages.push({
      type: "calls",
      id: "approve-name-wrapper",
      calls: approvalCalls,
      mode: parameters.mode ?? "auto",
      atomicity: "none",
      confirmation: parameters.confirmation ?? { type: "confirmed" },
    });
  }

  stages.push({
    type: "calls",
    id: "wrap-name",
    calls: wrapCalls,
    mode: parameters.mode ?? "auto",
    atomicity: wrapCalls.length > 1 ? "preferred" : "none",
    confirmation: parameters.confirmation ?? { type: "confirmed" },
  });

  if (cleanupCalls.length > 0) {
    stages.push({
      type: "calls",
      id: "revoke-name-wrapper-approval",
      calls: cleanupCalls,
      mode: parameters.mode ?? "auto",
      atomicity: "none",
      confirmation: parameters.confirmation ?? { type: "confirmed" },
    });
  }

  const write = yield* executeWritePlan.effect(config, {
    plan: {
      id: `wrapName:${keccak256(stringToHex(JSON.stringify({ name: route.name, owner, strategy })))}`,
      stages,
    },
    ...(parameters.resume === undefined ? {} : { resume: parameters.resume.write }),
    ...(parameters.walletClient === undefined ? {} : { walletClient: parameters.walletClient }),
    ...(parameters.account === undefined ? {} : { account: parameters.account }),
  });

  return {
    name: route.name,
    protocol: "v1",
    strategy,
    owner,
    approvals: { registrar: registrarApprovalAdded, registry: registryApprovalAdded },
    write,
    finalState: confirmed(write) ? yield* getNameState.effect(config, { name: route.name }) : null,
  };
});

export const wrapName = defineAction<WrapNameParameters, WrapNameResult, WrapperWriteError>(
  withWorkflow("wrapName", wrapNameEffect),
);

export type {
  WrapNameParameters,
  WrapNameResult,
  WrapperWriteError as WrapNameError,
} from "../types.js";
