import { Effect } from "effect";

import type { AssetGatewayUrls, PublicClient } from "viem";
import { parseAvatarRecord } from "viem/ens";

import type { ResolvedGatewayOptions } from "../../../config/gateway-options.js";
import { GatewayError } from "../../../errors/gateway-error.js";
import { validateGatewayUrl } from "../../../internal/gateway/validate-url.js";
import type { AvatarResult } from "./types.js";

export const resolveAvatarRecord: (
  client: PublicClient,
  name: string,
  record: string,
  chainId: number,
  policy: ResolvedGatewayOptions,
  gatewayUrls?: AssetGatewayUrls,
) => Effect.Effect<Exclude<AvatarResult, null>, GatewayError> = Effect.fn("resolveAvatarRecord")(
  function* (client, name, record, chainId, policy, gatewayUrls) {
    const nftChain = /^eip155:(\d+)\//i.exec(record)?.[1];

    if (nftChain !== undefined && Number(nftChain) !== chainId) {
      return { status: "unsupported-chain", record, chainId: Number(nftChain) };
    }

    if (/^https?:\/\//i.test(record)) yield* validateGatewayUrl(record, policy);

    for (const gateway of Object.values(gatewayUrls ?? {})) {
      if (gateway !== undefined) yield* validateGatewayUrl(gateway, policy);
    }

    const uri = yield* Effect.tryPromise({
      try: () =>
        parseAvatarRecord(client, {
          record,
          ...(gatewayUrls === undefined ? {} : { gatewayUrls }),
        }),
      catch: (cause) =>
        new GatewayError({
          code: "AVATAR_RESOLUTION_FAILED",
          message: `Unable to resolve the avatar record for ${name}`,
          cause,
        }),
    }).pipe(
      Effect.timeout(policy.timeout),
      Effect.catchTag(
        "TimeoutError",
        () =>
          new GatewayError({
            code: "GATEWAY_TIMEOUT",
            message: `Avatar resolution timed out for ${name}`,
            cause: { timeout: policy.timeout },
          }),
      ),
    );

    return { status: "resolved", record, uri };
  },
);
