import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import type { Query } from "../../../indexer/Indexer.js";
import * as Action from "../../../internal/action/index.js";
import { callIndexer } from "../../../internal/indexer/call.js";
import {
  contractInput,
  optionalAddress,
  optionalName,
  queryOf,
} from "../../../internal/indexer/input.js";
import type { getPermissions as Promises } from "./index.js";

/** @internal Implementation of `Actions.indexer.getPermissions`. */
export const getPermissions = Effect.fn("ensforge.indexer.getPermissions")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
  const subjects = [options.name, options.registrationId, options.address, options.registry];
  if (subjects.filter((subject) => subject !== undefined).length !== 1) {
    return yield* Effect.fail(
      new InvalidInputError({
        code: "INVALID_RECORD_VALUE",
        field: "name",
        input: undefined,
        shortMessage: "Pass exactly one of `name`, `registrationId`, `address` or `registry`.",
      }),
    );
  }

  const name = yield* optionalName(options.name);
  const address = yield* optionalAddress(options.address, "address");
  const registry =
    options.registry === undefined
      ? undefined
      : yield* contractInput(client, options.registry, "registry");

  return yield* callIndexer(client, "getPermissions", {
    ...queryOf(options),
    name,
    address,
    registry,
  } as Query.GetPermissions);
}, Action.withContext("indexer.getPermissions"));
