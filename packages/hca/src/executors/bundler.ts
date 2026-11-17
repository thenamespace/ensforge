import {
  standaloneHcaFactoryV2Abi,
  standaloneSingleOwnerHcaV2Abi,
} from "@ensforge/contracts/v2/experimental/hca";
import type { Write } from "@ensforge/sdk";
import type { Client } from "@ensforge/sdk/extension";
import { encodeAbiParameters, encodeFunctionData, http, padHex, type Hex } from "viem";
import {
  createBundlerClient,
  createPaymasterClient,
  entryPoint07Abi,
  getUserOperationHash,
  toSmartAccount,
  type UserOperationReceipt,
} from "viem/account-abstraction";
import { readContract, signMessage } from "viem/actions";

import { HcaError } from "../errors/classes/HcaError.js";
import type { ExecutionRequest, Executor } from "../types.js";

/**
 * Options of {@link bundler}.
 *
 * @category executors
 * @since 1.0.0
 */
export type BundlerOptions = {
  /** ERC-4337 bundler RPC URL (EntryPoint v0.7). */
  url: string;
  /** Paymaster RPC URL (ERC-7677) that sponsors the UserOperations, often the bundler's own. */
  paymaster?: string | undefined;
  /** Paymaster context, e.g. a sponsorship policy id. */
  paymasterContext?: Readonly<Record<string, unknown>> | undefined;
  /** Id reported on plans and errors. @default "bundler" */
  id?: string | undefined;
};

const batchMode = padHex("0x01", { size: 32, dir: "right" });

const execution = (calls: ExecutionRequest["calls"]): Hex =>
  encodeFunctionData({
    abi: standaloneSingleOwnerHcaV2Abi,
    functionName: "execute",
    args: [
      batchMode,
      encodeAbiParameters(
        [
          {
            type: "tuple[]",
            components: [
              { name: "target", type: "address" },
              { name: "value", type: "uint256" },
              { name: "callData", type: "bytes" },
            ],
          },
        ],
        [calls.map((call) => ({ target: call.to, value: call.value, callData: call.data }))],
      ),
    ],
  });

/** The HCA as a viem smart account whose UserOperations the owner signs. */
const hcaAccount = (request: ExecutionRequest, context: Write.Via.Context) => {
  const client = context.client as Client;
  const hca = client.deployment.v2?.hca;
  const wallet = context.walletClient;
  if (hca === undefined || wallet === undefined) {
    throw new HcaError({ code: "HCA_EXECUTOR_UNSUPPORTED", executor: "bundler" });
  }
  const entryPoint = { address: hca.entryPoint, abi: entryPoint07Abi, version: "0.7" } as const;

  return toSmartAccount({
    client: context.publicClient as Parameters<typeof toSmartAccount>[0]["client"],
    entryPoint,
    getAddress: async () => request.hca,
    getFactoryArgs: async () => ({
      factory: hca.standaloneFactory,
      factoryData: encodeFunctionData({
        abi: standaloneHcaFactoryV2Abi,
        functionName: "deploy",
        args: [request.owner, hca.standaloneImplementation, 0n],
      }),
    }),
    // Key 0 selects the account's fixed validator.
    getNonce: async () =>
      readContract(context.publicClient, {
        address: hca.entryPoint,
        abi: entryPoint07Abi,
        functionName: "getNonce",
        args: [request.hca, 0n],
      }),
    encodeCalls: async (calls) =>
      execution(
        calls.map((call) => ({ to: call.to, data: call.data ?? "0x", value: call.value ?? 0n })),
      ),
    // A well-formed signature that is not the owner's, for gas estimation only.
    getStubSignature: async () => `0x${"11".repeat(32)}${"22".repeat(32)}1b`,
    signMessage: async () => {
      throw new HcaError({ code: "HCA_EXECUTOR_UNSUPPORTED", executor: "bundler" });
    },
    signTypedData: async () => {
      throw new HcaError({ code: "HCA_EXECUTOR_UNSUPPORTED", executor: "bundler" });
    },
    // The validator accepts the owner's personal_sign over the UserOperation hash.
    signUserOperation: async (operation) =>
      signMessage(wallet, {
        account: wallet.account ?? request.owner,
        message: {
          raw: getUserOperationHash({
            userOperation: { ...operation, sender: request.hca },
            entryPointAddress: hca.entryPoint,
            entryPointVersion: "0.7",
            chainId: context.chainId,
          }),
        },
      }),
  });
};

/**
 * Runs HCA executions as owner-signed ERC-4337 UserOperations through any bundler, optionally
 * sponsored by a paymaster. Experimental: the HCA's bundler path has no production proof
 * upstream yet.
 *
 * **When to use**
 *
 * Use for gasless owner actions (renewals, transfers, migration) when the owner holds no ETH; the
 * owner signs each operation instead of sending a transaction.
 *
 * **Details**
 *
 * - Owner operations only: HCA sessions run through Rhinestone's intent executor, not ERC-4337.
 * - EntryPoint v0.7; the first operation deploys the HCA through its factory.
 * - The owner signs with `personal_sign` over the UserOperation hash.
 *
 * **Example** (A bundler URL)
 *
 * ```ts
 * import { bundler, hca } from "@ensforge/hca"
 *
 * const via = hca({ executors: [bundler({ url: bundlerUrl, paymaster: bundlerUrl })] })
 * ```
 *
 * **Example** (Renewing gaslessly)
 *
 * ```ts
 * await ens.registration.renewSync({ names: ["alice.eth"], duration, via })
 * ```
 *
 * **Example** (With a sponsorship policy)
 *
 * ```ts
 * bundler({ url, paymaster: url, paymasterContext: { sponsorshipPolicyId: "sp_…" } })
 * ```
 *
 * @category executors
 * @since 1.0.0
 */
export const bundler = (options: BundlerOptions): Executor => {
  const id = options.id ?? "bundler";
  const paymaster =
    options.paymaster === undefined
      ? undefined
      : createPaymasterClient({ transport: http(options.paymaster) });
  const clientFor = (context: Write.Via.Context) =>
    createBundlerClient({
      client: context.publicClient,
      transport: http(options.url),
      ...(paymaster === undefined
        ? {}
        : {
            paymaster,
            ...(options.paymasterContext === undefined
              ? {}
              : { paymasterContext: options.paymasterContext }),
          }),
    });

  return {
    id,
    capabilities: { sessions: false, sponsorship: paymaster !== undefined, deploys: true },
    send: async (request, context) => {
      if (request.session !== undefined) {
        throw new HcaError({ code: "HCA_EXECUTOR_UNSUPPORTED", executor: id });
      }
      try {
        return await clientFor(context).sendUserOperation({
          account: await hcaAccount(request, context),
          calls: request.calls.map((call) => ({ to: call.to, data: call.data, value: call.value })),
        });
      } catch (cause) {
        if (cause instanceof HcaError) throw cause;
        const message = cause instanceof Error ? cause.message : String(cause);
        throw new HcaError({
          code:
            paymaster !== undefined && /paymaster/i.test(message)
              ? "HCA_PAYMASTER_REJECTED"
              : "HCA_BUNDLER_REJECTED",
          executor: id,
          cause,
        });
      }
    },
    status: async (reference, context) => {
      let receipt: UserOperationReceipt;
      try {
        receipt = await clientFor(context).getUserOperationReceipt({ hash: reference as Hex });
      } catch {
        return { status: "pending" };
      }
      const hash = receipt.receipt.transactionHash;
      return receipt.success
        ? { status: "success", hashes: [hash] }
        : {
            status: "failed",
            reason: receipt.reason ?? "the UserOperation reverted",
            hashes: [hash],
          };
    },
  };
};

/**
 * Options of {@link pimlico}.
 *
 * @category executors
 * @since 1.0.0
 */
export type PimlicoOptions = {
  /** Pimlico API key. */
  apiKey: string;
  /** Sponsor UserOperations with Pimlico's paymaster. @default false */
  sponsor?: boolean | undefined;
  /** Pimlico sponsorship policy id. */
  sponsorshipPolicyId?: string | undefined;
};

/**
 * {@link bundler} preset for Pimlico's hosted bundler and paymaster. Experimental, as `bundler`.
 *
 * **When to use**
 *
 * Use with a Pimlico API key for gasless owner actions on mainnet or Sepolia.
 *
 * **Example** (Sponsored)
 *
 * ```ts
 * import { hca, pimlico } from "@ensforge/hca"
 *
 * const via = hca({ executors: [pimlico({ apiKey, sponsor: true }), owner()] })
 * ```
 *
 * **Example** (With a policy)
 *
 * ```ts
 * pimlico({ apiKey, sponsor: true, sponsorshipPolicyId: "sp_…" })
 * ```
 *
 * **Example** (Unsponsored: the HCA pays gas)
 *
 * ```ts
 * pimlico({ apiKey })
 * ```
 *
 * @category executors
 * @since 1.0.0
 */
export const pimlico = (options: PimlicoOptions): Executor => {
  const url = (chainId: number) =>
    `https://api.pimlico.io/v2/${chainId}/rpc?apikey=${options.apiKey}`;
  const forChain = new Map<number, Executor>();
  const executorFor = (chainId: number) => {
    let executor = forChain.get(chainId);
    if (executor === undefined) {
      executor = bundler({
        id: "pimlico",
        url: url(chainId),
        ...(options.sponsor === true ? { paymaster: url(chainId) } : {}),
        ...(options.sponsorshipPolicyId === undefined
          ? {}
          : { paymasterContext: { sponsorshipPolicyId: options.sponsorshipPolicyId } }),
      });
      forChain.set(chainId, executor);
    }
    return executor;
  };

  return {
    id: "pimlico",
    capabilities: { sessions: false, sponsorship: options.sponsor === true, deploys: true },
    send: (request, context) =>
      (executorFor(context.chainId).send as NonNullable<Executor["send"]>)(request, context),
    status: (reference, context) =>
      (executorFor(context.chainId).status as NonNullable<Executor["status"]>)(reference, context),
  };
};
