import { Effect } from "effect";

import { isAddressEqual, type Address } from "viem";

import type { Client } from "../../../client/types.js";
import { ConfigError } from "../../../errors/classes/ConfigError.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import { NotFoundError } from "../../../errors/classes/NotFoundError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { sameAddress } from "../../../internal/address.js";
import { normalizeName } from "../../../internal/name/normalize.js";
import { requireAddress } from "../../../internal/name/write.js";
import { defaultEvmCoinType } from "../../../internal/records/read-profiles.js";
import { readRecords } from "../../../internal/records/read.js";
import { defaultPrimaryNameCall, ethPrimaryNameCall } from "../../../internal/reverse/calls.js";
import { ethCoinType, reverseName } from "../../../internal/reverse/coin.js";
import { addressOf } from "../../../internal/write/signer.js";
import { make as makePlan } from "../../../plan/make.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { set as Promises } from "./index.js";

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

/**
 * An `addr.reverse` name outranks `default.reverse` for Ethereum (coin 60), so setting the
 * default while another `addr.reverse` name exists would change nothing there. The fix sets
 * `addr.reverse` to the same name (or clears it with the default).
 */
const shadowingEthCall = Effect.fnUntraced(function* (
  client: Client,
  target: Address,
  self: boolean,
  name: string,
): Effect.fn.Return<Plan.Call[], AnyError> {
  const current = yield* readRecords(client, {
    name: reverseName(target, ethCoinType),
    selection: { nameRecord: true },
  });
  const existing = (current as { readonly nameRecord?: string | null }).nameRecord ?? null;
  if (existing === null || existing === "" || existing === name) return [];
  return [yield* ethPrimaryNameCall(client, target, self, name)];
});

/** @internal Builds the plan of `Actions.primaryName.set`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  const signer = addressOf(options.account) ?? client.account;
  if (signer === undefined)
    return yield* Effect.fail(new ConfigError({ code: "WALLET_NOT_CONFIGURED" }));
  const target =
    options.address === undefined ? signer : yield* requireAddress(options.address, "address");
  const coinType = options.coin === "default" ? defaultEvmCoinType : ethCoinType;
  const name = options.name === null ? "" : yield* normalizeName(options.name);
  // Readers show only ENSIP-15 names, which an encoded label (`[af2c…]`) is not.
  if (name.includes("[")) {
    return yield* Effect.fail(
      new InvalidInputError({
        code: "INVALID_NAME",
        input: options.name,
        shortMessage: "A primary name needs its plain labels, not their hashes.",
      }),
    );
  }

  const warnings =
    name !== "" && options.verify !== false
      ? yield* forwardMatch(client, name, target, coinType)
      : [];

  const self = isAddressEqual(target, signer);
  const calls =
    coinType === ethCoinType
      ? [yield* ethPrimaryNameCall(client, target, self, name)]
      : [
          yield* defaultPrimaryNameCall(client, target, self, name),
          ...(yield* shadowingEthCall(client, target, self, name)),
        ];

  return makePlan({
    operation: "primaryName.set",
    chainId: client.chain.id,
    account: signer,
    steps: [
      { id: "write", description: name === "" ? "Clear primary name" : "Set primary name", calls },
    ],
    warnings,
  });
});

const write = Action.write("primaryName.set", plan, { contractKind: "registrar" });

/** @internal Implementation of `Actions.primaryName.set`. */
export const set = write.send;

/** @internal Implementation of `Actions.primaryName.setSync`. */
export const setSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.primaryName.set`. */
export const setMethods = write.methods;
