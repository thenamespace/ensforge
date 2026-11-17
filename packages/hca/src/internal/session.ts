import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { predictVerifiableProxyAddress } from "@ensforge/contracts/v2";
import {
  hcaSessionDigest,
  hcaSessionPermissionId,
  hcaSessionSalt,
  hcaSessionTypedData,
  hcaSignedSession,
  type HcaSessionTerms,
} from "@ensforge/contracts/v2/experimental/hca";
import type { Plan } from "@ensforge/sdk";
import { Rpc, type AnyError, type Client, type ViemWalletClient } from "@ensforge/sdk/extension";
import {
  decodeFunctionData,
  isAddressEqual,
  zeroAddress,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { signTypedData } from "viem/actions";

import { HcaError } from "../errors/classes/HcaError.js";
import type { HcaSession } from "../types.js";
import { readAccount } from "./account.js";
import { requireHca, type HcaDeployment } from "./deployment.js";

/** The ENS app's refund ceilings: $20k per ETH, 500k gas of overhead, 100 USDC per intent. */
export const defaultRefund = {
  maxExchangeRate: 20_000_000_000n,
  maxGasOverhead: 500_000n,
  maxAmount: 100_000_000n,
} as const;

/** Signs a session approval for the signer's HCA and returns the storable session. */
export const authorize = Effect.fnUntraced(function* (
  client: Client,
  wallet: ViemWalletClient,
  owner: Address,
  options: {
    readonly sessionKey: Address;
    readonly resolver: Address;
    readonly validUntil: number;
    readonly refund?:
      | {
          readonly token?: Address | undefined;
          readonly maxExchangeRate?: bigint | undefined;
          readonly maxGasOverhead?: bigint | undefined;
          readonly maxAmount?: bigint | undefined;
        }
      | undefined;
  },
): Effect.fn.Return<HcaSession, AnyError | HcaError> {
  const deployment = yield* requireHca(client);
  const account = yield* readAccount(client, { owner });
  const refundToken = options.refund?.token ?? deployment.v2.paymentTokens?.usdc;
  if (refundToken === undefined) {
    return yield* Effect.fail(
      new HcaError({
        code: "HCA_SESSION_INVALID",
        shortMessage: "This deployment has no default refund token; pass `refund.token`.",
      }),
    );
  }

  const terms: HcaSessionTerms = {
    sessionNonce: account.sessionNonce,
    validUntil: options.validUntil,
    resolver: options.resolver,
    refundToken,
    maxRefundExchangeRate: options.refund?.maxExchangeRate ?? defaultRefund.maxExchangeRate,
    maxRefundGasOverhead: options.refund?.maxGasOverhead ?? defaultRefund.maxGasOverhead,
    maxRefundAmount: options.refund?.maxAmount ?? defaultRefund.maxAmount,
  };
  const salt = hcaSessionSalt(terms);
  const session = hcaSignedSession({
    account: account.address,
    sessionKey: options.sessionKey,
    salt,
  });
  const sessionDigest = hcaSessionDigest(session);

  const ownerSignature = yield* Rpc.fromPromise(() =>
    signTypedData(wallet, {
      account: wallet.account ?? owner,
      ...hcaSessionTypedData([{ chainId: client.chain.id, session }]),
    }),
  );

  return {
    chainId: client.chain.id,
    hca: account.address,
    owner,
    sessionKey: options.sessionKey,
    terms,
    permissionId: hcaSessionPermissionId({ sessionKey: options.sessionKey, salt }),
    sessionDigest,
    chains: [{ chainId: client.chain.id, sessionDigest }],
    ownerSignature,
    signingDomain: client.deployment.v2?.capabilities.hcaSessionDomain ?? "smart-session",
  } satisfies HcaSession;
});

/** Why a stored session can no longer be used, or `undefined` when it can. */
export const sessionProblem = Effect.fnUntraced(function* (
  client: Client,
  session: HcaSession,
): Effect.fn.Return<
  "chain" | "expired" | "signing-domain" | "revoked" | undefined,
  AnyError | HcaError
> {
  if (session.chainId !== client.chain.id) return "chain" as const;
  if (session.terms.validUntil * 1000 < Date.now()) return "expired" as const;
  const domain = client.deployment.v2?.capabilities.hcaSessionDomain ?? "smart-session";
  if (session.signingDomain !== domain) return "signing-domain" as const;
  const account = yield* readAccount(client, { address: session.hca });
  if (account.sessionNonce !== session.terms.sessionNonce) return "revoked" as const;
  return undefined;
});

type Decoded = { readonly functionName: string; readonly args?: readonly unknown[] | undefined };

const decode = (abi: Abi, data: Hex): Decoded | undefined => {
  try {
    return decodeFunctionData({ abi, data }) as Decoded;
  } catch {
    return undefined;
  }
};

// Record calls a session may make on its resolver: HCAResolverPolicyLib (v1.0.1) allows these
// setters, and `multicall` only when every inner call is allowed too.
const recordSetters = new Set([
  "setAddress",
  "setText",
  "setContenthash",
  "setABI",
  "setInterface",
  "setData",
  "linkToNode",
  "linkToRecord",
  "setName",
]);

const isRecordCall = (data: Hex): boolean => {
  const decoded = decode(Abis.v2.permissionedResolver as Abi, data);
  if (decoded === undefined) return false;
  if (decoded.functionName === "multicall") {
    const [inner] = decoded.args as readonly [readonly Hex[]];
    return inner.every(isRecordCall);
  }
  return recordSetters.has(decoded.functionName);
};

const notAllowed = (call: Plan.Call, reason: string) =>
  new HcaError({
    code: "HCA_ACTION_NOT_ALLOWED",
    details: [`${call.to} ${call.data.slice(0, 10)}: ${reason}`],
    context: { contract: call.to, functionName: call.data.slice(0, 10) },
  });

/**
 * Checks calls against the session policy before anything is signed: registrations to the owner
 * with the session's resolver, the session resolver's deployment and records, primary names,
 * and payment approvals to the registrar. Value must be zero.
 */
export const checkSessionCalls = Effect.fnUntraced(function* (
  client: Client,
  session: HcaSession,
  calls: readonly Plan.Call[],
): Effect.fn.Return<void, AnyError | HcaError> {
  const deployment = yield* requireHca(client);
  const registrar = deployment.v2.contracts.ethRegistrar;
  const resolver = session.terms.resolver;

  for (const call of calls) {
    if (call.value !== 0n) return yield* Effect.fail(notAllowed(call, "sessions send no value"));

    if (isAddressEqual(call.to, registrar)) {
      const decoded = decode(Abis.v2.ethRegistrar as Abi, call.data);
      if (decoded?.functionName === "commit") continue;
      if (decoded?.functionName === "register") {
        const [, owner, , subregistry, registeredResolver] = decoded.args as readonly [
          string,
          Address,
          Hex,
          Address,
          Address,
        ];
        if (!isAddressEqual(owner, session.owner))
          return yield* Effect.fail(notAllowed(call, "names must be registered to the HCA owner"));
        if (!isAddressEqual(subregistry, zeroAddress))
          return yield* Effect.fail(notAllowed(call, "the subregistry must be empty"));
        if (!isAddressEqual(registeredResolver, resolver))
          return yield* Effect.fail(notAllowed(call, "the resolver must be the session's"));
        continue;
      }
      return yield* Effect.fail(notAllowed(call, "only commit and register are allowed"));
    }

    if (isAddressEqual(call.to, resolver)) {
      if (isRecordCall(call.data)) continue;
      return yield* Effect.fail(notAllowed(call, "only record setters on the session resolver"));
    }

    if (isAddressEqual(call.to, deployment.verifiableFactory)) {
      const decoded = decode(Abis.v2.verifiableFactory as Abi, call.data);
      if (decoded?.functionName === "deployProxy") {
        const [implementation, salt] = decoded.args as readonly [Address, bigint, Hex];
        const permitted = deployment.v2.implementations.permissionedResolver;
        if (!isAddressEqual(implementation, permitted))
          return yield* Effect.fail(notAllowed(call, "only the approved PermissionedResolver"));
        const predicted = yield* predictedResolver(client, deployment, session.hca, salt);
        if (isAddressEqual(predicted, resolver)) continue;
      }
      return yield* Effect.fail(notAllowed(call, "only the session resolver may be deployed"));
    }

    if (isAddressEqual(call.to, deployment.v2.contracts.defaultReverseRegistrarAdapter)) {
      const decoded = decode(Abis.v2.defaultReverseRegistrarAdapter as Abi, call.data);
      const [account] = (decoded?.args ?? []) as readonly [Address?];
      if (
        decoded?.functionName === "setNameWithHCA" &&
        account !== undefined &&
        isAddressEqual(account, session.owner)
      )
        continue;
      return yield* Effect.fail(notAllowed(call, "primary names are for the HCA owner only"));
    }
    if (isAddressEqual(call.to, deployment.v2.contracts.reverseRegistrarAdapter)) {
      const decoded = decode(Abis.v2.reverseRegistrarAdapter as Abi, call.data);
      const [account, claimed] = (decoded?.args ?? []) as readonly [Address?, Address?];
      if (
        decoded?.functionName === "claimWithHCA" &&
        account !== undefined &&
        claimed !== undefined &&
        isAddressEqual(account, session.owner) &&
        (isAddressEqual(claimed, resolver) || isAddressEqual(claimed, zeroAddress))
      )
        continue;
      return yield* Effect.fail(
        notAllowed(call, "reverse claims are for the owner and the session resolver"),
      );
    }

    const approval = decode(Abis.shared.erc20 as Abi, call.data);
    if (approval?.functionName === "approve") {
      const [spender] = approval.args as readonly [Address, bigint];
      if (isAddressEqual(spender, registrar)) continue;
      return yield* Effect.fail(notAllowed(call, "payment approvals go to the registrar only"));
    }

    return yield* Effect.fail(notAllowed(call, "not part of the session policy"));
  }
});

const predictedResolver = Effect.fnUntraced(function* (
  client: Client,
  deployment: HcaDeployment,
  hca: Address,
  salt: bigint,
): Effect.fn.Return<Address, AnyError> {
  const proxyLogic = yield* Rpc.readContract(client, {
    address: deployment.verifiableFactory,
    abi: Abis.v2.verifiableFactory,
    functionName: "proxyLogic",
  });
  return predictVerifiableProxyAddress({
    factory: deployment.verifiableFactory,
    proxyLogic,
    deployer: hca,
    salt,
  });
});
