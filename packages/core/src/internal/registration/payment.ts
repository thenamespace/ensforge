import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData, type Address } from "viem";

import type { Client } from "../../client/types.js";
import { InsufficientFundsError } from "../../errors/classes/InsufficientFundsError.js";
import { InvalidInputError } from "../../errors/classes/InvalidInputError.js";
import { UnsupportedError } from "../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import { requireAddress } from "../name/write.js";
import * as Rpc from "../rpc/index.js";
import type { RegistrationContracts } from "./contracts.js";

/** A payment token: a symbol listed in the deployment, or any ERC-20 address. */
export type PaymentTokenInput = "usdc" | "dai" | (string & {});

/** ERC-20 metadata returned with prices. */
export type TokenInfo = {
  readonly address: Address;
  readonly symbol: string;
  readonly decimals: number;
};

/** The address of `input` (USDC by default); no RPC, so its checks can join a batch. */
export const paymentTokenAddress = (
  contracts: RegistrationContracts,
  input: PaymentTokenInput | undefined,
): Effect.Effect<Address, AnyError> => {
  const symbol = input ?? "usdc";
  if (symbol !== "usdc" && symbol !== "dai") return requireAddress(symbol, "paymentToken");

  const listed = contracts.paymentTokens?.[symbol as "usdc" | "dai"];
  return listed === undefined
    ? Effect.fail(
        new InvalidInputError({
          code: "INVALID_ADDRESS",
          field: "paymentToken",
          input: symbol,
          shortMessage: `This deployment lists no ${symbol.toUpperCase()} address.`,
          hint: "Pass the token address instead.",
        }),
      )
    : Effect.succeed(listed);
};

/** Fails with `PAYMENT_TOKEN_UNSUPPORTED` unless the rent price oracle accepts `token`. */
export const requirePaymentToken = (
  client: Client,
  contracts: RegistrationContracts,
  token: Address,
): Effect.Effect<void, AnyError> =>
  Rpc.readContract(client, {
    address: contracts.oracle,
    abi: Abis.v2.standardRentPriceOracle,
    functionName: "isPaymentToken",
    args: [token],
  }).pipe(
    Effect.flatMap((accepted) =>
      accepted
        ? Effect.void
        : Effect.fail(new UnsupportedError({ code: "PAYMENT_TOKEN_UNSUPPORTED" })),
    ),
  );

/** ERC-20 symbol and decimals. */
export const tokenInfo = (client: Client, token: Address): Effect.Effect<TokenInfo, AnyError> =>
  Effect.all(
    {
      symbol: Rpc.readContract(client, {
        address: token,
        abi: Abis.shared.erc20,
        functionName: "symbol",
      }),
      decimals: Rpc.readContract(client, {
        address: token,
        abi: Abis.shared.erc20,
        functionName: "decimals",
      }),
    },
    { concurrency: "unbounded" },
  ).pipe(Effect.map(({ symbol, decimals }) => ({ address: token, symbol, decimals })));

/**
 * Metadata of an accepted payment token. Both reads share one batch; a token the oracle rejects
 * fails with `PAYMENT_TOKEN_UNSUPPORTED` even when it is not an ERC-20 at all.
 */
export const acceptedTokenInfo = Effect.fnUntraced(function* (
  client: Client,
  contracts: RegistrationContracts,
  token: Address,
): Effect.fn.Return<TokenInfo, AnyError> {
  const { accepted, info } = yield* Effect.all(
    {
      accepted: Effect.result(requirePaymentToken(client, contracts, token)),
      info: Effect.result(tokenInfo(client, token)),
    },
    { concurrency: "unbounded" },
  );
  yield* Effect.fromResult(accepted);
  return yield* Effect.fromResult(info);
});

/**
 * Checks that `payer` holds `balanceRequired` (default `amount`) of `token`, and returns the
 * approval `spender` still needs for `amount` (none when the allowance covers it). Checking up
 * front turns token reverts, which are plain strings for USDC and DAI, into
 * `InsufficientFundsError`.
 */
export const paymentCalls = Effect.fnUntraced(function* (
  client: Client,
  options: {
    readonly payer: Address;
    readonly token: Address;
    readonly spender: Address;
    readonly amount: bigint;
    readonly balanceRequired?: bigint | undefined;
  },
): Effect.fn.Return<readonly Plan.Call[], AnyError> {
  const required = options.balanceRequired ?? options.amount;
  const { balance, allowance } = yield* Effect.all(
    {
      balance: Rpc.readContract(client, {
        address: options.token,
        abi: Abis.shared.erc20,
        functionName: "balanceOf",
        args: [options.payer],
      }),
      allowance: Rpc.readContract(client, {
        address: options.token,
        abi: Abis.shared.erc20,
        functionName: "allowance",
        args: [options.payer, options.spender],
      }),
    },
    { concurrency: "unbounded" },
  );

  if (balance < required) {
    return yield* Effect.fail(
      new InsufficientFundsError({
        code: "INSUFFICIENT_TOKEN_BALANCE",
        required,
        available: balance,
        token: options.token,
      }),
    );
  }
  if (allowance >= options.amount) return [];
  return [
    {
      to: options.token,
      data: encodeFunctionData({
        abi: Abis.shared.erc20,
        functionName: "approve",
        args: [options.spender, options.amount],
      }),
      value: 0n,
    },
  ];
});
