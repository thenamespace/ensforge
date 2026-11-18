import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { decodeFunctionResult, encodeFunctionData, type Address } from "viem";

import type { Client } from "../../../client/types.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import { NotFoundError } from "../../../errors/classes/NotFoundError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { normalizeName } from "../../../internal/name/normalize.js";
import { requireAddress } from "../../../internal/name/write.js";
import { primaryNameCoinType, reverseName } from "../../../internal/reverse/coin.js";
import * as Rpc from "../../../internal/rpc/index.js";
import { namehash } from "../../../utils/Name.js";
import type { get as Promises } from "./index.js";

/** The raw `name` record of the address's reverse name, without forward verification. */
const unverified = (
  client: Client,
  address: Address,
  coinType: bigint,
  options: Promises.Options,
): Effect.Effect<string, AnyError> => {
  const name = reverseName(address, coinType);
  return Rpc.resolve(client, {
    ...options,
    name,
    data: encodeFunctionData({
      abi: Abis.shared.nameResolver,
      functionName: "name",
      args: [namehash(name)],
    }),
  }).pipe(
    Effect.map(({ data }) =>
      decodeFunctionResult({ abi: Abis.shared.nameResolver, functionName: "name", data }),
    ),
  );
};

/** @internal Implementation of `Actions.primaryName.get`. */
export const get = Effect.fn("ensforge.primaryName.get")(
  function* (
    client: Client,
    options: Promises.Options,
  ): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
    const address = yield* requireAddress(options.address, "address");
    const coinType = yield* primaryNameCoinType(options.coin);
    const strict = options.strict === true;

    const name = yield* (
      options.verify === false
        ? unverified(client, address, coinType, options)
        : Rpc.reverse(client, { ...options, address, coinType }).pipe(
            Effect.map((reversed) => reversed.name),
          )
    ).pipe(
      // No reverse resolver (or one that cannot answer `name`, or a forward resolver that cannot
      // answer `addr`) means no primary name; a failed forward check means no valid one.
      Effect.catchIf(
        (error: AnyError) =>
          error.code === "RESOLVER_NOT_FOUND" ||
          error.code === "RESOLVER_PROFILE_UNSUPPORTED" ||
          (error.code === "PRIMARY_NAME_MISMATCH" && !strict),
        (error) => {
          if (!strict) return Effect.succeed("");
          // The Universal Resolver names the name without a resolver and the profile a resolver
          // lacks: either on the primary name's side means a name that does not resolve back. A
          // resolver that reverts without data says neither, and counts as no primary name.
          const forward =
            (error._tag === "NotFoundError" &&
              error.resource !== undefined &&
              error.resource !== reverseName(address, coinType)) ||
            // `addr(bytes32)` and `addr(bytes32,uint256)`.
            (error.context.selector !== undefined &&
              ["0x3b3b57de", "0xf1cb7e06"].includes(error.context.selector));
          return Effect.fail(
            new NotFoundError({
              code: forward ? "PRIMARY_NAME_MISMATCH" : "PRIMARY_NAME_NOT_SET",
              cause: error,
            }),
          );
        },
      ),
    );

    if (name === "") {
      return strict
        ? yield* Effect.fail(new NotFoundError({ code: "PRIMARY_NAME_NOT_SET" }))
        : null;
    }
    // The Universal Resolver returns the stored text; names that are not normalized are unsafe to
    // show. Encoded labels (`[af2c…]`) survive `normalizeName` but are no ENSIP-15 name.
    const normalized = yield* normalizeName(name).pipe(
      Effect.map((normalizedName) => normalizedName === name && !name.includes("[")),
      Effect.orElseSucceed(() => false),
    );
    if (!normalized) {
      return strict
        ? yield* Effect.fail(
            new InvalidInputError({ code: "INVALID_NAME", input: name, field: "primary name" }),
          )
        : null;
    }
    return name;
  },
  Action.withContext("primaryName.get", { contractKind: "resolver" }),
);
