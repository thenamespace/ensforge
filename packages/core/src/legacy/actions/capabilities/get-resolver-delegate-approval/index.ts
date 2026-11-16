import { Effect } from "effect";

import { publicResolverV1IsApprovedForAbi } from "@ensforge/contracts/internal";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import { readNameRoute } from "../../../internal/name/name-route.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { normalizeName } from "../../../names/normalize.js";
import type { EthereumAddress } from "../../../schemas/identity.js";
import { findResolver } from "../../resolution/get-resolver/find.js";
import type {
  CapabilityError,
  NameCapabilityParameters,
  ResolverDelegateApprovalResult,
} from "../types.js";

export type GetResolverDelegateApprovalParameters = NameCapabilityParameters & {
  readonly owner: EthereumAddress;
  readonly delegate: EthereumAddress;
};

const getResolverDelegateApprovalEffect = Effect.fn("ensforge.getResolverDelegateApproval")(
  function* (config: EnsforgeConfig, parameters: GetResolverDelegateApprovalParameters) {
    const name = yield* normalizeName.effect(parameters.name);

    return yield* executeRead(
      config,
      parameters,
      Effect.gen(function* () {
        const [route, discovery] = yield* Effect.all(
          [readNameRoute(name), findResolver(name)] as const,
          { concurrency: "unbounded" },
        );

        const protocol = route.kind === "v1" || route.kind === "reserved" ? "v1" : "v2";

        if (discovery === null) {
          return { supported: false, protocol, reason: "RESOLVER_NOT_FOUND" } as const;
        }

        const ethereum = yield* EthereumClient;

        const approved = yield* ethereum
          .readContract({
            address: discovery.address,
            abi: publicResolverV1IsApprovedForAbi,
            functionName: "isApprovedFor",
            args: [parameters.owner, discovery.node, parameters.delegate],
          })
          .pipe(Effect.catchTag("ContractError", () => Effect.succeed(null)));

        if (approved === null) {
          return {
            supported: false,
            protocol,
            reason: "DELEGATE_APPROVAL_UNSUPPORTED",
          } as const;
        }

        return {
          supported: true,
          protocol,
          resolver: discovery.address,
          owner: parameters.owner,
          delegate: parameters.delegate,
          approved,
        } as const;
      }),
    );
  },
);

export const getResolverDelegateApproval = defineReadAction<
  GetResolverDelegateApprovalParameters,
  ResolverDelegateApprovalResult,
  CapabilityError
>(getResolverDelegateApprovalEffect);

export type {
  CapabilityError as GetResolverDelegateApprovalError,
  ResolverDelegateApprovalResult,
} from "../types.js";
