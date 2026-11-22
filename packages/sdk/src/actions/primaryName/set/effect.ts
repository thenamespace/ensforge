import { Effect, String as Str } from "effect";

import { isAddressEqual, type Address } from "viem";

import type { Client } from "../../../client/types.js";
import { ConfigError } from "../../../errors/classes/ConfigError.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import { NotFoundError } from "../../../errors/classes/NotFoundError.js";
import { UnsupportedError } from "../../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { addressOf, sameAddress } from "../../../internal/address.js";
import { normalizeName } from "../../../internal/name/normalize.js";
import { requireAddress } from "../../../internal/name/write.js";
import { defaultEvmCoinType } from "../../../internal/records/read-profiles.js";
import { readRecords } from "../../../internal/records/read.js";
import { ethCoinType, primaryNameCoinType } from "../../../internal/reverse/coin.js";
import { reverseCalls } from "../../../internal/reverse/plan.js";
import { routeSender } from "../../../internal/write/via.js";
import { make as makePlan } from "../../../plan/make.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import * as CoinType from "../../../utils/CoinType.js";
import type { set as Promises } from "./index.js";
import { claimPlan, l2Plan } from "./l2.js";

/**
 * Fails unless `name` resolves to `address`, so the primary name verifies. A default primary
 * name verifies on each EVM chain against that chain's address or the default EVM address; one
 * with only an Ethereum address works on Ethereum alone, which the plan warns about.
 */
const forwardMatch = Effect.fnUntraced(function* (
  client: Client,
  name: string,
  address: Address,
  coinType: bigint,
): Effect.fn.Return<readonly Plan.Warning[], AnyError> {
  const coins = coinType === ethCoinType ? [ethCoinType] : [coinType, ethCoinType];
  const records = yield* readRecords(client, { name, selection: { addresses: coins } });
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the `addresses` selection yields an address or null per coin type
  const resolved = records.addresses as Record<string, Address | null>;
  const matches = (coin: bigint) => sameAddress(resolved[String(coin)], address);

  if (matches(coinType)) return [];
  if (coinType !== ethCoinType && matches(ethCoinType)) {
    return [
      {
        code: "DEFAULT_PRIMARY_NAME_ETHEREUM_ONLY",
        message: `${name} only has an Ethereum address, so it verifies as the primary name on Ethereum alone; set its default EVM address for other chains.`,
      },
    ];
  }
  return yield* Effect.fail(
    new NotFoundError({
      code: "PRIMARY_NAME_MISMATCH",
      shortMessage: `${name} does not resolve to ${address}.`,
      hint: "Set the name's address record first, or pass `verify: false`.",
    }),
  );
});

/** @internal Builds the plan of `Actions.primaryName.set`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account" | "via">,
): Effect.fn.Return<Plan, AnyError> {
  if (options.claim !== undefined) return yield* claimPlan(client, options);

  const signer = addressOf(options.account) ?? client.account;
  if (signer === undefined)
    return yield* Effect.fail(new ConfigError({ code: "WALLET_NOT_CONFIGURED" }));
  const target =
    options.address === undefined ? signer : yield* requireAddress(options.address, "address");
  const coinType = yield* primaryNameCoinType(options.coin === "all" ? "default" : options.coin);
  const name = options.name === null ? "" : yield* normalizeName(options.name);
  // Readers show only ENSIP-15 names, which an encoded label (`[af2c…]`) is not.
  if (Str.includes("[")(name)) {
    return yield* Effect.fail(
      new InvalidInputError({
        code: "INVALID_NAME",
        input: options.name,
        shortMessage: "A primary name needs its plain labels, not their hashes.",
      }),
    );
  }

  // Other EVM chains keep their primary names in their own reverse registrar (ENSIP-19).
  const chainId = CoinType.toChainId(coinType);
  const sender = (yield* routeSender(client, options.via, signer)) ?? signer;
  if (coinType !== ethCoinType && coinType !== defaultEvmCoinType && chainId !== null) {
    if (!isAddressEqual(sender, signer)) {
      return yield* Effect.fail(
        new UnsupportedError({
          code: "UNSUPPORTED_ON_DEPLOYMENT",
          feature: "L2 primary names through a route that sends as another account",
          hint: "Send without `via`, or relay a claim from `primaryName.signClaim`.",
        }),
      );
    }
    return yield* l2Plan(client, options, chainId, name);
  }

  const warnings =
    name !== "" && options.verify !== false
      ? yield* forwardMatch(client, name, target, coinType)
      : [];
  const reverse = yield* reverseCalls(client, {
    target,
    signer,
    sender,
    scope: options.coin === "all" ? "all" : coinType === ethCoinType ? "eth" : "default",
    name,
  });

  const description = name === "" ? "Clear primary name" : "Set primary name";
  return makePlan({
    operation: "primaryName.set",
    chainId: client.chain.id,
    account: signer,
    steps: [
      ...(reverse.calls.length === 0 ? [] : [{ id: "write", description, calls: reverse.calls }]),
      ...(reverse.signerCalls.length === 0
        ? []
        : [
            {
              id: reverse.calls.length === 0 ? "write" : "signer",
              description,
              calls: reverse.signerCalls,
              from: "signer" as const,
            },
          ]),
    ],
    warnings: [...warnings, ...reverse.warnings],
  });
});

// L2 reverse records took routes in 1.0, unlike writes on L2 namespace names.
const write = Action.write("primaryName.set", plan, { contractKind: "registrar" }, undefined, {
  routesOnOtherChains: true,
});

/** @internal Implementation of `Actions.primaryName.set`. */
export const set = write.send;

/** @internal Implementation of `Actions.primaryName.setSync`. */
export const setSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.primaryName.set`. */
export const setMethods = write.methods;
