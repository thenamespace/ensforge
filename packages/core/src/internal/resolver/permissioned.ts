import { Effect } from "effect";

import type { Address } from "viem";

import type { Client } from "../../client/types.js";
import { NotFoundError } from "../../errors/classes/NotFoundError.js";
import { UnsupportedError } from "../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../errors/types.js";
import type { LoadedName } from "../name/load.js";
import { setterKeying } from "../records/setter-keying.js";

/**
 * The name's own resolver, which must be an ENSv2 PermissionedResolver. `feature` names what
 * needs it, for the error message.
 */
export const requirePermissionedResolver = Effect.fnUntraced(function* (
  client: Client,
  { state }: LoadedName,
  feature: string,
): Effect.fn.Return<Address, AnyError> {
  if (state.resolver === null) {
    return yield* Effect.fail(new NotFoundError({ code: "RESOLVER_NOT_FOUND" }));
  }
  if ((yield* setterKeying(client, state.resolver)) !== "name") {
    return yield* Effect.fail(
      new UnsupportedError({
        code: "RESOLVER_PROFILE_UNSUPPORTED",
        feature,
        shortMessage: `Only PermissionedResolvers support ${feature}.`,
      }),
    );
  }
  return state.resolver;
});
