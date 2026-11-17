import { Abis } from "@ensforge/contracts";
import { hcaSessionSalt } from "@ensforge/contracts/v2/experimental/hca";
import type { Write } from "@ensforge/sdk";
import type { Client } from "@ensforge/sdk/extension";
import { concat, isAddressEqual, zeroAddress, type Account, type Address, type Hex } from "viem";
import { readContract } from "viem/actions";

import { HcaError } from "../errors/classes/HcaError.js";
import type { ExecutionRequest, Executor } from "../types.js";

/**
 * The parts of a Rhinestone SDK instance the executor uses; any SDK release with standalone
 * HCA support (`type: "hca"`, `version: "ens-standalone-1.1.0"`) fits.
 *
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
 * @category executors
 * @since 1.0.0
 */
export type RhinestoneOptions = {
  /** A Rhinestone SDK instance with standalone HCA support, created by the app. */
  sdk: RhinestoneSdk;
  /** The session key's signer, for session executions. */
  sessionSigner?: Account | undefined;
  /** Sponsor executions; otherwise fees are paid in the session's refund token. @default true */
  sponsored?: boolean | undefined;
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
 * @category executors
 * @since 1.0.0
 */
export const rhinestone = (options: RhinestoneOptions): Executor => {
  const sponsored = options.sponsored ?? true;

  const account = async (request: ExecutionRequest, context: Write.Via.Context) => {
    const v2 = (context.client as Client).deployment.v2;
    const hca = v2?.hca;
    const owner = context.walletClient?.account;
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
        calls: request.calls.map((call) => ({ to: call.to, data: call.data, value: call.value })),
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
                  hashesAndChainIds: session.chains.map((entry) => ({
                    chainId: BigInt(entry.chainId),
                    sessionDigest: entry.sessionDigest,
                  })),
                  sessionToEnableIndex: 0,
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
        return { status: "failed", reason: `the intent is ${intent.status.toLowerCase()}` };
      }
      return { status: "pending" };
    },
  };
};
