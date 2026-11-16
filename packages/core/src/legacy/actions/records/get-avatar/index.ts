import { Effect } from "effect";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { getText } from "../get-text/index.js";
import { resolveAvatarRecord } from "./resolve.js";
import type { AvatarResult, GetAvatarError, GetAvatarParameters } from "./types.js";

const getAvatarEffect = Effect.fn("ensforge.getAvatar")(function* (
  config: EnsforgeConfig,
  parameters: GetAvatarParameters,
) {
  const avatar = yield* getText.effect(config, {
    ...parameters,
    key: "avatar",
  });

  if (avatar.value === null) return null;

  return yield* resolveAvatarRecord(
    config.publicClient,
    parameters.name,
    avatar.value,
    config.chainId,
    config.gateways,
    parameters.gatewayUrls,
  );
});

export const getAvatar = defineReadAction<GetAvatarParameters, AvatarResult, GetAvatarError>(
  getAvatarEffect,
);

export { AvatarResult, type GetAvatarError, type GetAvatarParameters } from "./types.js";
