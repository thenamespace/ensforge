// `Executor` is a Promise interface, so executors can wrap Promise SDKs without Effect.
/* oxlint-disable effecttsgo/async-function */
import { Array as Arr, String as Str } from "effect";

import { Abis } from "@ensforge/contracts";
import { hcaSessionSalt } from "@ensforge/contracts/v2/experimental/hca";
import type { Write } from "@ensforge/sdk";
import type { Client } from "@ensforge/sdk/extension";
import {
  concat,
  isAddressEqual,
  zeroAddress,
  type Account,
  type Address,
  type Hex,
  type SignTypedDataParameters,
} from "viem";
import { toAccount } from "viem/accounts";
import { readContract, signMessage, signTypedData } from "viem/actions";

import { HcaError } from "../errors/classes/HcaError.js";
import type { ExecutionRequest, Executor } from "../types.js";

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
  /** Sponsor executions; otherwise fees are paid in the session's refund token. @default true */
  sponsored?: boolean | undefined;
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
 * **Example** (Owner-signed, sponsored)
 *
 * ```ts
 * import { hca, rhinestone } from "@ensforge/hca"
 *
 * const via = hca({ executors: [rhinestone({ sdk })] })
 * ```
 *
 * **Example** (Paying fees in the refund token)
 *
 * ```ts
 * import { rhinestone } from "@ensforge/hca"
 *
 * rhinestone({ sdk, sessionSigner, sponsored: false })
 * ```
 *
 * @stability experimental
 * @category executors
 * @since 1.0.0
 */
export const rhinestone = (options: RhinestoneOptions): Executor => {
  const sponsored = options.sponsored ?? true;

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
    return created;
  };

  return {
    id: "rhinestone",
    capabilities: { sessions: true, sponsorship: true, deploys: true },
    send: async (request, context) => {
      const created = await account(request, context);
      const { session } = request;
      if (session !== undefined && options.sessionSigner === undefined) {
        throw new HcaError({
          code: "HCA_EXECUTOR_UNSUPPORTED",
          executor: "rhinestone",
          shortMessage: "Session executions need `sessionSigner`.",
        });
      }

      const chain = context.publicClient.chain;
      const prepared = await created.prepareTransaction({
        chain,
        calls: Arr.map(request.calls, (call) => ({
          to: call.to,
          data: call.data,
          value: call.value,
        })),
        sponsored,
        ...(sponsored || session === undefined ? {} : { feeAsset: session.terms.refundToken }),
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
      });
      const signed = await created.signTransaction(prepared);
      const { id } = await created.submitTransaction(signed);
      return String(id);
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
