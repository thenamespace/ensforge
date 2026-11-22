// `Executor` is a Promise interface, so executors can wrap Promise SDKs without Effect.
/* oxlint-disable effecttsgo/async-function */
import { Array as Arr, String as Str } from "effect";

import { Abis } from "@ensforge/contracts";
import { hcaRefundCaps, hcaSessionSalt } from "@ensforge/contracts/v2/experimental/hca";
import type { Plan, Write } from "@ensforge/sdk";
import type { Client } from "@ensforge/sdk/extension";
import {
  concat,
  isAddressEqual,
  zeroAddress,
  type Account,
  type Address,
  type Hex,
  type SignTypedDataParameters,
  type TypedDataDefinition,
} from "viem";
import { toAccount } from "viem/accounts";
import { readContract, signMessage, signTypedData } from "viem/actions";

import { HcaError } from "../errors/classes/HcaError.js";
import { decodeCall } from "../internal/decode.js";
import type { ExecutionRequest, Executor } from "../types.js";
import { routeFee, routeProblems, routeRefund, refundViolations } from "./rhinestone-route.js";

/**
 * The parts of a Rhinestone SDK instance the executor uses. It needs standalone HCA support
 * (`type: "hca"`, `version: "ens-standalone-1.1.0"`), which no SDK release has yet: use
 * `@rhinestone/sdk@1.22.0` with the ENS app's patch, as the ENS app does.
 *
 * @stability experimental
 * @category executors
 * @since 1.0.0
 */
export type RhinestoneSdk = {
  readonly createAccount: (config: unknown) => Promise<RhinestoneAccount>;
  readonly getIntentStatus: (id: bigint) => Promise<{
    readonly status: string;
    readonly fill?: { readonly hash?: Hex | undefined } | undefined;
  }>;
};

/**
 * A Rhinestone SDK account, as `createAccount` returns it.
 *
 * @stability experimental
 * @category executors
 * @since 1.0.0
 */
export type RhinestoneAccount = {
  readonly getAddress: () => Address;
  readonly prepareTransaction: (transaction: unknown) => Promise<unknown>;
  readonly signTransaction: (prepared: unknown) => Promise<unknown>;
  readonly submitTransaction: (signed: unknown) => Promise<{ readonly id: bigint | string }>;
  /** The typed data an owner signs for a prepared transaction; checked against the route. */
  readonly getTransactionMessages?:
    | ((prepared: unknown) => {
        readonly origin: readonly TypedDataDefinition[];
        readonly destination: TypedDataDefinition;
      })
    | undefined;
};

/**
 * Options of {@link rhinestone}.
 *
 * @stability experimental
 * @category executors
 * @since 1.0.0
 */
export type RhinestoneOptions = {
  /** A Rhinestone SDK instance with standalone HCA support, created by the app. */
  sdk: RhinestoneSdk;
  /** The session key's signer, for session executions. */
  sessionSigner?: Account | undefined;
  /**
   * The HCA owner's signer for owner-signed executions.
   *
   * @default the wallet's account; a browser wallet's signs through the wallet
   */
  ownerAccount?: Account | undefined;
  /**
   * Ask the orchestrator to sponsor fees. Needs a Rhinestone project that sponsors gas; otherwise
   * the HCA pays each execution's fee in `feeToken`.
   *
   * @default false
   */
  sponsored?: boolean | undefined;
  /**
   * Token the HCA pays fees in. A session pays only in its refund token.
   *
   * @default the session's refund token, else the deployment's USDC
   */
  feeToken?: Address | undefined;
  /**
   * Ceilings on an owner-signed execution's refund; a route above them is not signed
   * (`HCA_ROUTE_REJECTED`). Sessions use their own caps.
   *
   * @default 20e9 per gas, 100M gas of overhead and 100 USDC, as a session's widest caps
   */
  maxRefund?:
    | {
        readonly exchangeRate?: bigint | undefined;
        readonly gasOverhead?: bigint | undefined;
        readonly amount?: bigint | undefined;
      }
    | undefined;
};

// The gas a quote prices an execution at, from the ENS app's measured fills: the orchestrator
// cannot estimate a step that depends on an earlier one, such as a registration's reveal.
const quoteGasLimit = (request: ExecutionRequest, client: Client): bigint => {
  const v2 = client.deployment.v2;
  const count = (matches: (call: Plan.Call) => boolean) =>
    BigInt(Arr.filter(request.calls, matches).length);
  const registers = count(
    (call) =>
      v2 !== undefined &&
      isAddressEqual(call.to, v2.contracts.ethRegistrar) &&
      decodeCall(Abis.v2.ethRegistrar, call.data)?.functionName === "register",
  );
  const deploys = count(
    (call) =>
      v2 !== undefined &&
      isAddressEqual(call.to, v2.contracts.verifiableFactory) &&
      decodeCall(Abis.v2.verifiableFactory, call.data)?.functionName === "deployProxy",
  );
  return (
    450_000n + (request.deployed ? 0n : 300_000n) + registers * 800_000n + deploys * 1_070_000n
  );
};

// Rhinestone signs with the account itself. A browser wallet's account (`json-rpc`) cannot sign
// on its own, so it signs through the wallet client, which asks the wallet.
const ownerAccountOf = (context: Write.Via.Context): Account | undefined => {
  const walletClient = context.walletClient;
  const account = walletClient?.account;
  if (walletClient === undefined || account === undefined || account.type === "local") {
    return account;
  }
  return toAccount({
    address: account.address,
    signMessage: ({ message }) => signMessage(walletClient, { account, message }),
    signTypedData: (typedData) =>
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- viem's generic typed-data definition and the action's parameters cannot be related
      signTypedData(walletClient, { ...typedData, account } as SignTypedDataParameters),
    signTransaction: () =>
      Promise.reject(
        new HcaError({
          code: "HCA_EXECUTOR_UNSUPPORTED",
          executor: "rhinestone",
          shortMessage: "Rhinestone intents are signed as messages, not transactions.",
        }),
      ),
  });
};

/**
 * Runs HCA executions as Rhinestone intents: owner-signed, or prompt-free with an HCA session.
 * Experimental; bring a Rhinestone SDK with standalone HCA support.
 *
 * **When to use**
 *
 * Use for prompt-free registration and record updates with a session (`hca.authorizeSession`),
 * and for sponsored or stablecoin-paid executions.
 *
 * **Details**
 *
 * - ensforge checks session calls against the HCA policy before anything is signed.
 * - The orchestrator's route is checked before signing: an owner-signed intent must run exactly
 *   the requested calls from the HCA with a refund within `maxRefund` (`HCA_ROUTE_REJECTED`),
 *   and a session's refund must stay within its caps (`HCA_SESSION_INVALID`).
 * - Fees are paid by the HCA in `feeToken` unless `sponsored`; `quote` prices each execution.
 * - The SDK account must derive the same HCA address, or the executor fails with
 *   `HCA_SDK_UNSUPPORTED` (stock SDK releases without the standalone HCA derive another).
 * - Status follows the intent until its fill transaction is mined.
 *
 * **Example** (With a session)
 *
 * ```ts
 * import { hca, rhinestone } from "@ensforge/hca"
 *
 * const via = hca({ executors: [rhinestone({ sdk, sessionSigner })], session })
 * ```
 *
 * **Example** (Owner-signed, fees paid in USDC by the HCA)
 *
 * ```ts
 * import { hca, rhinestone } from "@ensforge/hca"
 *
 * const via = hca({ executors: [rhinestone({ sdk })] })
 * ```
 *
 * **Example** (Sponsored by the app's Rhinestone project)
 *
 * ```ts
 * import { rhinestone } from "@ensforge/hca"
 *
 * rhinestone({ sdk, sessionSigner, sponsored: true })
 * ```
 *
 * @stability experimental
 * @category executors
 * @since 1.0.0
 */
export const rhinestone = (options: RhinestoneOptions): Executor => {
  const sponsored = options.sponsored ?? false;

  const account = async (request: ExecutionRequest, context: Write.Via.Context) => {
    const v2 = (context.client as Client).deployment.v2;
    const hca = v2?.hca;
    const owner = options.ownerAccount ?? ownerAccountOf(context);
    if (v2 === undefined || hca === undefined || owner === undefined) {
      throw new HcaError({ code: "HCA_EXECUTOR_UNSUPPORTED", executor: "rhinestone" });
    }
    const { verifiableFactory } = v2.contracts;
    const proxyLogic = await readContract(context.publicClient, {
      address: verifiableFactory,
      abi: Abis.v2.verifiableFactory,
      functionName: "proxyLogic",
    });

    const created = await options.sdk.createAccount({
      ...(request.deployed ? { initData: { address: request.hca } } : {}),
      account: {
        type: "hca",
        version: "ens-standalone-1.1.0",
        factory: hca.standaloneFactory,
        implementation: hca.standaloneImplementation,
        validator: hca.ownerAndSessionValidator,
        verifiableFactory,
        proxyLogic,
        userSalt: 0n,
      },
      owners: { type: "ecdsa", accounts: [owner], module: hca.ownerAndSessionValidator },
      experimental_sessions: { enabled: true, module: hca.ownerAndSessionValidator },
    });
    if (!isAddressEqual(created.getAddress(), request.hca)) {
      throw new HcaError({ code: "HCA_SDK_UNSUPPORTED", executor: "rhinestone" });
    }
    return { created, hca, feeToken: feeTokenOf(request, v2.paymentTokens?.usdc) };
  };

  // Unsponsored intents always name the token they pay in; a session refunds only in its own.
  const feeTokenOf = (request: ExecutionRequest, usdc: Address | undefined): Address => {
    const { session } = request;
    const token = options.feeToken ?? session?.terms.refundToken ?? usdc;
    if (
      token === undefined ||
      (session !== undefined && !isAddressEqual(token, session.terms.refundToken))
    ) {
      throw new HcaError({
        code: "HCA_EXECUTOR_UNSUPPORTED",
        executor: "rhinestone",
        shortMessage:
          token === undefined
            ? "This deployment has no default fee token; pass `feeToken`."
            : "A session pays fees only in its refund token.",
      });
    }
    return token;
  };

  const transaction = (
    request: ExecutionRequest,
    context: Write.Via.Context,
    feeToken: Address,
    extra: { readonly gasLimit?: bigint | undefined } = {},
  ) => {
    const { session } = request;
    if (session !== undefined && options.sessionSigner === undefined) {
      throw new HcaError({
        code: "HCA_EXECUTOR_UNSUPPORTED",
        executor: "rhinestone",
        shortMessage: "Session executions need `sessionSigner`.",
      });
    }
    const chain = context.publicClient.chain;
    // Funds the calls pull into the HCA (a permit and transferFrom first), declared so the
    // planner prices an execution the HCA can pay only once they arrive.
    const [opening] = request.calls;
    const permit =
      opening === undefined ? undefined : decodeCall(Abis.shared.erc2612, opening.data);
    const inflow =
      opening === undefined || permit?.functionName !== "permit"
        ? undefined
        : { token: opening.to, amount: permit.args[2] };
    return {
      chain,
      ...(inflow === undefined
        ? {}
        : {
            auxiliaryFunds: { [chain?.id ?? request.chainId]: { [inflow.token]: inflow.amount } },
            sourceAssets: [inflow.token],
          }),
      calls: Arr.map(request.calls, (call) => ({
        to: call.to,
        data: call.data,
        value: call.value,
      })),
      sponsored,
      ...(sponsored ? {} : { feeAsset: feeToken }),
      ...(extra.gasLimit === undefined ? {} : { gasLimit: extra.gasLimit }),
      ...(session === undefined
        ? {}
        : {
            signers: {
              type: "experimental_session",
              verifyExecutions: true,
              session: {
                chain,
                account: session.hca,
                salt: hcaSessionSalt(session.terms),
                owners: { type: "ecdsa", accounts: [options.sessionSigner] },
              },
              enableData: {
                // Rhinestone prefixes owner signatures with the validator selector slot.
                userSignature: concat([zeroAddress, session.ownerSignature]),
                hashesAndChainIds: Arr.map(session.chains, (entry) => ({
                  chainId: BigInt(entry.chainId),
                  sessionDigest: entry.sessionDigest,
                })),
                sessionToEnableIndex: 0,
                // The ENS SDK patch packs these into the proof the validator checks on every
                // session-signed intent; it hashes them back into the session's salt.
                hcaSessionNonce: session.terms.sessionNonce,
                hcaSessionConfig: {
                  sessionKey: session.sessionKey,
                  validUntil: session.terms.validUntil,
                  resolver: session.terms.resolver,
                  refundToken: session.terms.refundToken,
                  maxRefundExchangeRate: session.terms.maxRefundExchangeRate,
                  maxRefundGasOverhead: Number(session.terms.maxRefundGasOverhead),
                  maxRefundAmount: session.terms.maxRefundAmount,
                },
              },
            },
          }),
    };
  };

  const prepare = async (
    request: ExecutionRequest,
    context: Write.Via.Context,
    extra: { readonly gasLimit?: bigint | undefined } = {},
  ) => {
    const { created, hca, feeToken } = await account(request, context);
    const prepared = await created.prepareTransaction(
      transaction(request, context, feeToken, extra),
    );
    return { created, hca, feeToken, prepared };
  };

  return {
    id: "rhinestone",
    capabilities: { sessions: true, sponsorship: true, deploys: true },
    send: async (request, context) => {
      const { created, hca, feeToken, prepared } = await prepare(request, context);

      // Checked before signing: the route comes from the orchestrator, not from ensforge.
      const { session } = request;
      if (session !== undefined) {
        const refund = routeRefund(prepared);
        const violations =
          refund === undefined
            ? []
            : refundViolations(refund, {
                token: session.terms.refundToken,
                maxExchangeRate: session.terms.maxRefundExchangeRate,
                maxGasOverhead: session.terms.maxRefundGasOverhead,
                maxAmount: session.terms.maxRefundAmount,
              });
        if (violations.length > 0) {
          throw new HcaError({
            code: "HCA_SESSION_INVALID",
            executor: "rhinestone",
            shortMessage: "The execution's gas refund is above the session's caps.",
            hint: "Authorize a new session with higher `refund` caps.",
            details: violations,
          });
        }
      } else {
        // Owner intents have no session caps; the defaults are a session's widest.
        const widest = { ...hcaRefundCaps(), maxGasOverhead: 100_000_000n };
        const problems = routeProblems(prepared, {
          chainId: request.chainId,
          hca: request.hca,
          calls: request.calls,
          intentExecutor: hca.intentExecutor,
          gasRefundPaymaster: hca.gasRefundPaymaster,
          caps: {
            token: feeToken,
            maxExchangeRate: options.maxRefund?.exchangeRate ?? widest.maxExchangeRate,
            maxGasOverhead: options.maxRefund?.gasOverhead ?? widest.maxGasOverhead,
            maxAmount: options.maxRefund?.amount ?? widest.maxAmount,
          },
          messages: created.getTransactionMessages?.(prepared),
        });
        if (problems.length > 0) {
          throw new HcaError({
            code: "HCA_ROUTE_REJECTED",
            executor: "rhinestone",
            details: problems,
          });
        }
      }

      const signed = await created.signTransaction(prepared);
      const { id } = await created.submitTransaction(signed);
      return String(id);
    },
    quote: async (request, context) => {
      const gasLimit = quoteGasLimit(request, context.client);
      const { feeToken, prepared } = await prepare(request, context, { gasLimit });
      const fee = routeFee(prepared, { chainId: request.chainId, gasLimit });
      if (sponsored || fee === undefined) {
        return [{ kind: "execution", token: feeToken, amount: 0n, maximum: 0n, sponsored: true }];
      }
      return [
        {
          kind: "execution",
          token: fee.refund.token,
          amount: fee.amount,
          maximum: fee.refund.amount,
          sponsored: false,
        },
      ];
    },
    quoteRefund: async (request, context) => {
      const gasLimit = quoteGasLimit(request, context.client);
      const { prepared } = await prepare(request, context, { gasLimit });
      return routeRefund(prepared);
    },
    status: async (reference) => {
      const intent = await options.sdk.getIntentStatus(BigInt(reference));
      const hash = intent.fill?.hash;
      if (hash !== undefined) return { status: "success", hashes: [hash] };
      if (intent.status === "FAILED" || intent.status === "EXPIRED") {
        return { status: "failed", reason: `the intent is ${Str.toLowerCase(intent.status)}` };
      }
      return { status: "pending" };
    },
  };
};
