import { Array as Arr, Effect, Option, Record as Rec } from "effect";

import { Abis } from "@ensforge/contracts";
import { Errors, type Plan } from "@ensforge/sdk";
import { Rpc, type AnyError, type Client, type ViemWalletClient } from "@ensforge/sdk/extension";
import { encodeFunctionData, isAddressEqual, parseSignature, type Address } from "viem";
import { signTypedData } from "viem/actions";

import { HcaError } from "../errors/classes/HcaError.js";
import type { HcaFunding, HcaSession } from "../types.js";

/** The owner's calls that fund the HCA: a setup transfer, or permit pulls inside its execution. */
export type Funding = {
  /** Owner transactions, sent before the HCA spends (`token.transfer(hca, shortfall)`). */
  readonly transfers: readonly Plan.Call[];
  /** `permit` and `transferFrom` pairs that open the first HCA execution. */
  readonly pulls: readonly Plan.Call[];
  readonly requirements: readonly Plan.Requirement[];
  readonly warnings: readonly Plan.Warning[];
};

const none: Funding = { transfers: [], pulls: [], requirements: [], warnings: [] };

/**
 * What the HCA spends per token: the plan's balance requirements on the HCA, plus each quoted
 * execution fee with a 5% margin (never above its maximum), as the ENS app budgets intents.
 */
const needs = (plan: Plan, hca: Address, fees: readonly Plan.Fee[]) => {
  const totals: Record<Address, bigint> = {};
  const add = (token: Address, amount: bigint) => {
    const key = Option.getOrElse(
      Arr.findFirst(Rec.keys(totals), (known) => isAddressEqual(known, token)),
      () => token,
    );
    totals[key] = (totals[key] ?? 0n) + amount;
  };
  for (const requirement of plan.requirements) {
    if (
      requirement.kind === "balance" &&
      requirement.token !== undefined &&
      requirement.account !== undefined &&
      isAddressEqual(requirement.account, hca)
    ) {
      add(requirement.token, requirement.amount);
    }
  }
  for (const fee of fees) {
    if (fee.sponsored || fee.token === "native" || fee.amount === 0n) continue;
    const budget = fee.amount + fee.amount / 20n;
    add(fee.token, fee.maximum > 0n && budget > fee.maximum ? fee.maximum : budget);
  }
  return Rec.toEntries(totals);
};

const balanceOf = (client: Client, token: Address, account: Address) =>
  Rpc.readContract(client, {
    address: token,
    abi: Abis.shared.erc20,
    functionName: "balanceOf",
    args: [account],
  });

/** The owner's EIP-2612 signature letting the HCA pull `value`, or `undefined` without permits. */
const permitPull = Effect.fnUntraced(function* (
  client: Client,
  wallet: ViemWalletClient,
  options: {
    readonly token: Address;
    readonly owner: Address;
    readonly hca: Address;
    readonly value: bigint;
    readonly deadline: number;
  },
): Effect.fn.Return<readonly Plan.Call[] | undefined, AnyError> {
  const { token, owner, hca, value } = options;
  const read = { address: token, abi: Abis.shared.erc2612 } as const;
  const nonce = yield* Rpc.readContractOrUndefined(client, {
    ...read,
    functionName: "nonces",
    args: [owner],
  });
  if (nonce === undefined) return undefined;

  // ERC-5267 names the domain; older tokens answer `name()` and `version()` (USDC: "2").
  const reported = yield* Rpc.readContractOrUndefined(client, {
    ...read,
    functionName: "eip712Domain",
  });
  const name =
    reported?.[1] ??
    (yield* Rpc.readContract(client, {
      address: token,
      abi: Abis.shared.erc20,
      functionName: "name",
    }));
  const version =
    reported?.[2] ??
    (yield* Rpc.readContractOrUndefined(client, { ...read, functionName: "version" })) ??
    "1";
  const now = yield* Rpc.blockTimestamp(client, {});
  const deadline = now + BigInt(options.deadline);

  const signature = yield* Rpc.fromPromise(() =>
    signTypedData(wallet, {
      account: wallet.account ?? owner,
      domain: { name, version, chainId: client.chain.id, verifyingContract: token },
      types: {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "Permit",
      message: { owner, spender: hca, value, nonce, deadline },
    }),
  );
  const { r, s, v, yParity } = parseSignature(signature);

  return [
    {
      to: token,
      data: encodeFunctionData({
        ...read,
        functionName: "permit",
        args: [owner, hca, value, deadline, Number(v ?? BigInt(27 + yParity)), r, s],
      }),
      value: 0n,
    },
    {
      to: token,
      data: encodeFunctionData({
        abi: Abis.shared.erc20,
        functionName: "transferFrom",
        args: [owner, hca, value],
      }),
      value: 0n,
    },
  ];
});

/**
 * How the owner funds the HCA for `plan`: nothing when the HCA holds what it spends. Otherwise
 * the shortfall moves from the owner's wallet: as a setup transfer for executors the owner's
 * wallet sends (`owner()`), or as an EIP-2612 permit and `transferFrom` inside the first HCA
 * execution for executors that relay it (the ENS app's shape; a session may pull its refund
 * token this way). The owner signs the permit while the plan is prepared.
 */
export const planFunding = Effect.fnUntraced(function* (
  client: Client,
  options: {
    readonly plan: Plan;
    readonly owner: Address;
    readonly hca: Address;
    readonly fees: readonly Plan.Fee[];
    readonly relayed: boolean;
    readonly session: HcaSession | undefined;
    readonly wallet: ViemWalletClient | undefined;
    readonly mode: HcaFunding;
  },
): Effect.fn.Return<Funding, AnyError | HcaError> {
  const { owner, hca, session } = options;
  const funding = { transfers: [] as Plan.Call[], pulls: [] as Plan.Call[] };
  const requirements: Plan.Requirement[] = [];
  const warnings: Plan.Warning[] = [];

  for (const [token, needed] of needs(options.plan, hca, options.fees)) {
    const held = yield* balanceOf(client, token, hca);
    const shortfall = needed - held;
    if (shortfall <= 0n) continue;
    if (options.mode === "none") {
      return yield* Effect.fail(
        new Errors.InsufficientFundsError({
          code: "INSUFFICIENT_TOKEN_BALANCE",
          required: needed,
          available: held,
          token,
          hint: "Fund your HCA, or let `hca()` move the shortfall from your wallet.",
        }),
      );
    }
    const funds = yield* balanceOf(client, token, owner);
    if (funds < shortfall) {
      return yield* Effect.fail(
        new Errors.InsufficientFundsError({
          code: "INSUFFICIENT_TOKEN_BALANCE",
          required: shortfall,
          available: funds,
          token,
        }),
      );
    }

    const deadline = typeof options.mode === "object" ? (options.mode.deadline ?? 3600) : 3600;
    const pulls =
      options.relayed && options.wallet !== undefined
        ? yield* permitPull(client, options.wallet, {
            token,
            owner,
            hca,
            value: shortfall,
            deadline,
          })
        : undefined;
    if (
      session !== undefined &&
      (pulls === undefined || !isAddressEqual(token, session.terms.refundToken))
    ) {
      return yield* Effect.fail(
        new HcaError({
          code: "HCA_ACTION_NOT_ALLOWED",
          shortMessage: `Your HCA needs ${shortfall} more of ${token}, which a session cannot pull.`,
          hint: "Sessions fund only their refund token, with a permit. Fund your HCA first, or send as the owner.",
          details: [`${token}: short ${shortfall}`],
        }),
      );
    }
    if (pulls === undefined) {
      funding.transfers.push({
        to: token,
        data: encodeFunctionData({
          abi: Abis.shared.erc20,
          functionName: "transfer",
          args: [hca, shortfall],
        }),
        value: 0n,
      });
    } else {
      funding.pulls.push(...pulls);
    }
    requirements.push({ kind: "balance", amount: shortfall, token, account: owner });
    warnings.push({
      code: "HCA_FUNDING",
      message: `${shortfall} of ${token} moves from your wallet to your HCA to pay for this.`,
    });
  }

  return requirements.length === 0 ? none : { ...funding, requirements, warnings };
});
