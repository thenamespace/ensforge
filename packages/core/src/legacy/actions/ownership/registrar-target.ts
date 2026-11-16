import { Effect } from "effect";

import type { EnsforgeConfig } from "../../config/config.js";
import { AuthorizationError } from "../../errors/authorization-error.js";
import type { WriteError } from "../../write/types.js";
import { getWriteTarget } from "../capabilities/get-write-target/index.js";
import { getRegistrant } from "../name/get-registrant/index.js";

export const getRegistrarTarget = Effect.fn("ensforge.getRegistrarTarget")(function* (
  config: EnsforgeConfig,
  name: string,
): Effect.fn.Return<
  {
    readonly address: `0x${string}`;
    readonly tokenId: bigint;
    readonly registrant: `0x${string}`;
  },
  WriteError
> {
  const target = yield* getWriteTarget.effect(config, {
    name,
    operation: { type: "transfer" },
  });

  const registrant = yield* getRegistrant.effect(config, { name });

  if (
    !target.available ||
    target.protocol !== "v1" ||
    target.kind !== "registrar" ||
    target.tokenId === null ||
    registrant === null
  ) {
    return yield* new AuthorizationError({
      code: "WRITE_TARGET_UNAVAILABLE",
      message: `An unwrapped V1 .eth registrar token is unavailable for ${name}`,
    });
  }

  return { address: target.address, tokenId: target.tokenId, registrant };
});
