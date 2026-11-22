import { Array as Arr, Effect, Option, String as Str } from "effect";

import { Abis } from "@ensforge/contracts";
import { predictVerifiableProxyAddress } from "@ensforge/contracts/v2";
import {
  hcaRefundCaps,
  hcaSessionDigest,
  hcaSessionPermissionId,
  hcaSessionSalt,
  hcaSessionTypedData,
  hcaSignedSession,
  type HcaSessionTerms,
} from "@ensforge/contracts/v2/experimental/hca";
import { Errors, type Plan } from "@ensforge/sdk";
import { Rpc, type AnyError, type Client, type ViemWalletClient } from "@ensforge/sdk/extension";
import {
  encodeFunctionData,
  isAddressEqual,
  maxUint48,
  maxUint96,
  zeroAddress,
  zeroHash,
  type Address,
  type Hex,
} from "viem";
import { signTypedData } from "viem/actions";

import { HcaError } from "../errors/classes/HcaError.js";
import type { Executor, HcaSession } from "../types.js";
import { readAccount } from "./account.js";
import { decodeCall } from "./decode.js";
import { requireHca } from "./deployment.js";

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
    readonly executor?: Executor | undefined;
  },
): Effect.fn.Return<HcaSession, AnyError | HcaError> {
  const deployment = yield* requireHca(client);
  // The approval is always signed under the smart-session domain; a deployment whose validator
  // expects the `"hca"` domain would reject it, and that domain's name and version are unknown.
  const signingDomain = deployment.v2.capabilities.hcaSessionDomain ?? "smart-session";
  if (signingDomain !== "smart-session") {
    return yield* Effect.fail(
      new HcaError({
        code: "HCA_UNAVAILABLE",
        shortMessage:
          "This deployment's HCA validator expects a session domain ensforge cannot sign.",
      }),
    );
  }
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

  // The overhead ceiling is sized from a commit-shaped quote when an executor can give one, as
  // the ENS app does; a failed quote keeps the 500k floor rather than failing the approval.
  const quoteRefund = options.executor?.quoteRefund;
  const quoted =
    options.refund?.maxGasOverhead !== undefined || quoteRefund === undefined
      ? undefined
      : yield* Rpc.fromPromise(() =>
          quoteRefund(
            {
              chainId: client.chain.id,
              hca: account.address,
              owner,
              deployed: account.deployed,
              calls: [
                {
                  to: deployment.v2.contracts.ethRegistrar,
                  data: encodeFunctionData({
                    abi: Abis.v2.ethRegistrar,
                    functionName: "commit",
                    args: [zeroHash],
                  }),
                  value: 0n,
                },
              ],
              description: "Quote a session's refund",
            },
            {
              client,
              chainId: client.chain.id,
              account: owner,
              publicClient: client.client(),
              walletClient: wallet,
            },
          ),
        ).pipe(Effect.orElseSucceed(() => undefined));
  const caps = hcaRefundCaps(quoted?.gasOverhead);

  const terms: HcaSessionTerms = {
    sessionNonce: account.sessionNonce,
    validUntil: options.validUntil,
    resolver: options.resolver,
    refundToken,
    maxRefundExchangeRate: options.refund?.maxExchangeRate ?? caps.maxExchangeRate,
    maxRefundGasOverhead: options.refund?.maxGasOverhead ?? caps.maxGasOverhead,
    maxRefundAmount: options.refund?.maxAmount ?? caps.maxAmount,
  };
  // The validator packs the caps as uint96 and uint48: a larger value would be signed truncated.
  const overflow = Arr.findFirst(
    [
      ["refund.maxExchangeRate", terms.maxRefundExchangeRate, maxUint96],
      ["refund.maxGasOverhead", terms.maxRefundGasOverhead, maxUint48],
      ["refund.maxAmount", terms.maxRefundAmount, maxUint96],
    ] as const,
    ([, value, max]) => value < 0n || value > max,
  );
  if (Option.isSome(overflow)) {
    const [field, value] = overflow.value;
    return yield* Effect.fail(
      new Errors.InvalidInputError({
        code: "INVALID_RECORD_VALUE",
        field,
        input: value,
        shortMessage: `\`${field}\` is outside what the HCA validator can store.`,
      }),
    );
  }
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
    signingDomain,
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
  if (session.chainId !== client.chain.id) return "chain";
  // The validator compares `validUntil` with the block's timestamp, not the local clock.
  const now = yield* Rpc.blockTimestamp(client, {});
  if (BigInt(session.terms.validUntil) < now) return "expired";
  const domain = client.deployment.v2?.capabilities.hcaSessionDomain ?? "smart-session";
  if (session.signingDomain !== domain) return "signing-domain";
  const account = yield* readAccount(client, { address: session.hca });
  if (account.sessionNonce !== session.terms.sessionNonce) return "revoked";
  return undefined;
});

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
  const decoded = decodeCall(Abis.v2.permissionedResolver, data);
  if (decoded === undefined) return false;
  if (decoded.functionName === "multicall") {
    const [inner] = decoded.args;
    return Arr.every(inner, isRecordCall);
  }
  return recordSetters.has(decoded.functionName);
};

const notAllowed = (call: Plan.Call, reason: string) => {
  const selector = Str.slice(0, 10)(call.data);
  return new HcaError({
    code: "HCA_ACTION_NOT_ALLOWED",
    details: [`${call.to} ${selector}: ${reason}`],
    context: { contract: call.to, functionName: selector },
  });
};

/**
 * Checks calls against the session policy before anything is signed: registrations to the owner
 * with the session's resolver, the session resolver's deployment and records, primary names,
 * payment approvals to the registrar, and one permit pull of the refund token from the owner.
 * Value must be zero.
 */
export const checkSessionCalls = Effect.fnUntraced(function* (
  client: Client,
  session: HcaSession,
  calls: readonly Plan.Call[],
): Effect.fn.Return<void, AnyError | HcaError> {
  const deployment = yield* requireHca(client);
  const registrar = deployment.v2.contracts.ethRegistrar;
  const resolver = session.terms.resolver;

  // The validator lets a session pull its refund token from the owner once per execution: a
  // permit followed by a transferFrom of the same amount to the HCA, next to an action.
  let pulled = false;
  let skip = false;
  for (const [index, call] of calls.entries()) {
    if (skip) {
      skip = false;
      continue;
    }
    if (call.value !== 0n) return yield* Effect.fail(notAllowed(call, "sessions send no value"));

    const permit = decodeCall(Abis.shared.erc2612, call.data);
    if (permit?.functionName === "permit") {
      const [permitOwner, spender, value] = permit.args;
      const next = calls[index + 1];
      const pull = next === undefined ? undefined : decodeCall(Abis.shared.erc20, next.data);
      const paired =
        next !== undefined &&
        pull?.functionName === "transferFrom" &&
        isAddressEqual(next.to, call.to) &&
        next.value === 0n &&
        isAddressEqual(pull.args[0], session.owner) &&
        isAddressEqual(pull.args[1], session.hca) &&
        pull.args[2] === value;
      if (
        pulled ||
        !paired ||
        calls.length < 3 ||
        !isAddressEqual(call.to, session.terms.refundToken) ||
        !isAddressEqual(permitOwner, session.owner) ||
        !isAddressEqual(spender, session.hca)
      ) {
        return yield* Effect.fail(
          notAllowed(
            call,
            "a session pulls only its refund token from the owner, once, as a permit and a transferFrom of the same amount next to an action",
          ),
        );
      }
      pulled = true;
      skip = true;
      continue;
    }

    if (isAddressEqual(call.to, registrar)) {
      const decoded = decodeCall(Abis.v2.ethRegistrar, call.data);
      if (decoded?.functionName === "commit") continue;
      if (decoded?.functionName === "register") {
        const [, owner, , subregistry, registeredResolver] = decoded.args;
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
      const decoded = decodeCall(Abis.v2.verifiableFactory, call.data);
      if (decoded?.functionName === "deployProxy") {
        const [implementation, salt] = decoded.args;
        const permitted = deployment.v2.implementations.permissionedResolver;
        if (!isAddressEqual(implementation, permitted))
          return yield* Effect.fail(notAllowed(call, "only the approved PermissionedResolver"));
        const proxyLogic = yield* Rpc.readContract(client, {
          address: deployment.verifiableFactory,
          abi: Abis.v2.verifiableFactory,
          functionName: "proxyLogic",
        });
        const predicted = predictVerifiableProxyAddress({
          factory: deployment.verifiableFactory,
          proxyLogic,
          deployer: session.hca,
          salt,
        });
        if (isAddressEqual(predicted, resolver)) continue;
      }
      return yield* Effect.fail(notAllowed(call, "only the session resolver may be deployed"));
    }

    if (isAddressEqual(call.to, deployment.v2.contracts.defaultReverseRegistrarAdapter)) {
      const decoded = decodeCall(Abis.v2.defaultReverseRegistrarAdapter, call.data);
      if (
        decoded?.functionName === "setNameWithHCA" &&
        isAddressEqual(decoded.args[0], session.owner)
      )
        continue;
      return yield* Effect.fail(notAllowed(call, "primary names are for the HCA owner only"));
    }
    if (isAddressEqual(call.to, deployment.v2.contracts.reverseRegistrarAdapter)) {
      const decoded = decodeCall(Abis.v2.reverseRegistrarAdapter, call.data);
      if (
        decoded?.functionName === "claimWithHCA" &&
        isAddressEqual(decoded.args[0], session.owner) &&
        (isAddressEqual(decoded.args[1], resolver) || isAddressEqual(decoded.args[1], zeroAddress))
      )
        continue;
      return yield* Effect.fail(
        notAllowed(call, "reverse claims are for the owner and the session resolver"),
      );
    }

    const approval = decodeCall(Abis.shared.erc20, call.data);
    if (approval?.functionName === "transferFrom") {
      return yield* Effect.fail(notAllowed(call, "a pull needs its permit in the same execution"));
    }
    if (approval?.functionName === "approve") {
      const [spender] = approval.args;
      if (isAddressEqual(spender, registrar)) continue;
      return yield* Effect.fail(notAllowed(call, "payment approvals go to the registrar only"));
    }

    return yield* Effect.fail(notAllowed(call, "not part of the session policy"));
  }

  return undefined;
});
