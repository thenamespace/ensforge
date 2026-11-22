import { Effect, String as Str } from "effect";

import { Abis } from "@ensforge/contracts";
import { decodeFunctionResult, encodeFunctionData, type Address } from "viem";

import type { Client } from "../../../client/types.js";
import { GatewayError } from "../../../errors/classes/GatewayError.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import { NotFoundError } from "../../../errors/classes/NotFoundError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { normalizeName } from "../../../internal/name/normalize.js";
import { requireAddress } from "../../../internal/name/write.js";
import { defaultEvmCoinType } from "../../../internal/records/read-profiles.js";
import {
  ethCoinType,
  l2RegistrarsOf,
  primaryNameCoinType,
  reverseName,
} from "../../../internal/reverse/coin.js";
import * as Rpc from "../../../internal/rpc/index.js";
import { chainClient, hasChain } from "../../../internal/write/chain.js";
import * as CoinType from "../../../utils/CoinType.js";
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

/**
 * The primary name through Ethereum's Universal Resolver, verified unless `verify: false`. When
 * the proof of an `unreachable` L2's name fails, the error says how to read it on the L2.
 */
const throughEthereum = (
  client: Client,
  address: Address,
  coinType: bigint,
  options: Promises.Options,
  unreachable: number | null,
): Effect.Effect<string, AnyError> =>
  (options.verify === false
    ? unverified(client, address, coinType, options)
    : Rpc.reverse(client, { ...options, address, coinType }).pipe(
        Effect.map((reversed) => reversed.name),
      )
  ).pipe(
    Effect.mapError((error) =>
      error._tag === "GatewayError" && unreachable !== null
        ? new GatewayError({
            code: error.code,
            shortMessage: error.shortMessage,
            hint: `Ethereum could not prove chain ${unreachable}'s primary name; give the client a transport for chain ${unreachable} to read it there.`,
            context: error.context,
            cause: error,
          })
        : error,
    ),
  );

/**
 * The primary name, read where it lives: on the L2 itself for a chain with ENS's L2 reverse
 * registrar that the client reaches (reads at a past block stay on Ethereum, whose block numbers
 * they are), otherwise through Ethereum.
 */
const lookup = Effect.fnUntraced(function* (
  client: Client,
  address: Address,
  coinType: bigint,
  options: Promises.Options,
): Effect.fn.Return<string, AnyError> {
  const chainId =
    coinType === ethCoinType || coinType === defaultEvmCoinType
      ? null
      : CoinType.toChainId(coinType);
  const registrar = chainId === null ? undefined : l2RegistrarsOf(client.chain.id)[chainId];
  if (
    chainId === null ||
    registrar === undefined ||
    !hasChain(client, chainId) ||
    options.blockNumber !== undefined
  ) {
    return yield* throughEthereum(
      client,
      address,
      coinType,
      options,
      registrar !== undefined && chainId !== null && !hasChain(client, chainId) ? chainId : null,
    );
  }

  const l2 = yield* chainClient(client, chainId);
  const { reverseOnL2 } = yield* Effect.promise(
    () => import("../../../internal/reverse/read-l2.js"),
  );
  return yield* reverseOnL2(client, l2, registrar, {
    address,
    coinType,
    verify: options.verify !== false,
    defaultName: unverified(client, address, defaultEvmCoinType, options),
  });
});

/** @internal Implementation of `Actions.primaryName.get`. */
export const get = Effect.fn("ensforge.primaryName.get")(
  function* (
    client: Client,
    options: Promises.Options,
  ): Effect.fn.Return<Promises.ReturnType, AnyError> {
    const address = yield* requireAddress(options.address, "address");
    const coinType = yield* primaryNameCoinType(options.coin, client.chain.id);
    const strict = options.strict === true;

    const name = yield* lookup(client, address, coinType, options).pipe(
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
      Effect.map((normalizedName) => normalizedName === name && !Str.includes("[")(name)),
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
