import { Effect } from "effect";

import { isHex } from "viem";

import type { Client } from "../../../client/types.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import * as Action from "../../../internal/action/index.js";
import { normalizeName } from "../../../internal/name/normalize.js";
import * as Rpc from "../../../internal/rpc/index.js";
import type { resolve as Promises } from "./index.js";

/** @internal Implementation of `Actions.resolver.resolve`. */
export const resolve = Effect.fn("ensforge.resolver.resolve")(
  function* (
    client: Client,
    options: Promises.Options,
  ): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
    if (!isHex(options.data) || options.data.length < 10) {
      return yield* Effect.fail(
        new InvalidInputError({ code: "INVALID_RECORD_VALUE", field: "data", input: options.data }),
      );
    }

    const name = yield* normalizeName(options.name);
    return yield* Rpc.resolve(client, { ...options, name });
  },
  Action.withContext("resolver.resolve", { contractKind: "resolver" }),
);
