import { Effect } from "effect";

import { textResolverAbi } from "@ensforge/contracts/shared";
import { decodeFunctionResult, encodeFunctionData } from "viem";

import type { Client } from "../../../client/types.js";
import { NotFoundError } from "../../../errors/classes/NotFoundError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { normalizeName } from "../../../internal/name/normalize.js";
import * as Rpc from "../../../internal/rpc/index.js";
import { namehash } from "../../../utils/Name.js";
import type { getText as Promises } from "./index.js";

// A missing resolver or a resolver without the text profile both mean "no record".
const missingRecordCodes = new Set(["RESOLVER_NOT_FOUND", "RESOLVER_PROFILE_UNSUPPORTED"]);

/** @internal Implementation of `Actions.record.getText`. */
export const getText = Effect.fn("ensforge.record.getText")(
  function* (
    client: Client,
    options: Promises.Options,
  ): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
    const name = yield* normalizeName(options.name);
    const data = encodeFunctionData({
      abi: textResolverAbi,
      functionName: "text",
      args: [namehash(name), options.key],
    });

    const resolved = yield* Rpc.resolve(client, { ...options, name, data }).pipe(
      Effect.catchIf(
        (error: AnyError) => !options.strict && missingRecordCodes.has(error.code),
        () => Effect.succeed(undefined),
      ),
    );
    if (resolved === undefined) return null;

    const value = decodeFunctionResult({
      abi: textResolverAbi,
      functionName: "text",
      data: resolved.data,
    });
    if (value !== "") return value;
    if (!options.strict) return null;
    return yield* Effect.fail(
      new NotFoundError({ code: "RECORD_NOT_FOUND", resource: options.key }),
    );
  },
  Action.withContext("record.getText", { contractKind: "resolver" }),
);
