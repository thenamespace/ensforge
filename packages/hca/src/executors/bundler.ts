import { Array as Arr, String as Str } from "effect";

// `Executor` is a Promise interface, so executors can wrap Promise SDKs without Effect: async
// functions and the wall clock are the boundary here.
/* oxlint-disable effecttsgo/async-function, effecttsgo/global-date */
import {
  standaloneHcaFactoryV2Abi,
  standaloneSingleOwnerHcaV2Abi,
} from "@ensforge/contracts/v2/experimental/hca";
import type { Write } from "@ensforge/sdk";
import type { Client } from "@ensforge/sdk/extension";
import { encodeAbiParameters, encodeFunctionData, http, isHex, padHex } from "viem";
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
 * @stability experimental
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
  /**
   * Milliseconds a UserOperation may stay pending before the write fails with
   * `HCA_EXECUTION_TIMEOUT`. Bundlers can keep an operation they cannot land forever.
   *
   * @default 180_000
   */
  timeout?: number | undefined;
};

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
    // viem's smart-account client type cannot express a public client with any account.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
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
    // ERC-7579 batch mode: the calls are ABI-encoded executions run in order.
    encodeCalls: async (calls) =>
      encodeFunctionData({
        abi: standaloneSingleOwnerHcaV2Abi,
        functionName: "execute",
        args: [
          padHex("0x01", { size: 32, dir: "right" }),
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
            [
              Arr.map(calls, (call) => ({
                target: call.to,
                value: call.value ?? 0n,
                callData: call.data ?? "0x",
              })),
            ],
          ),
        ],
      }),
    // A well-formed signature that is not the owner's, for gas estimation only.
    getStubSignature: async () => `0x${Str.repeat(32)("11")}${Str.repeat(32)("22")}1b`,
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

// Errors thrown by the paymaster client itself. Bundler errors print the UserOperation,
// `paymaster…` fields included, so their message cannot tell the two apart.
const paymasterErrors = new WeakSet();

const markPaymasterError = (cause: unknown): never => {
  if (typeof cause === "object" && cause !== null) paymasterErrors.add(cause);
  throw cause;
};

const isPaymasterError = (error: unknown): boolean => {
  for (let current = error; typeof current === "object" && current !== null;) {
    if (paymasterErrors.has(current)) return true;
    current = (current as { readonly cause?: unknown }).cause;
  }
  return false;
};

/**
 * Runs HCA executions as owner-signed ERC-4337 UserOperations through any bundler, optionally
 * sponsored by a paymaster. Experimental: the HCA's bundler path has no production proof
 * upstream yet.
 *
 * **When to use**
 *
 * Use for gasless owner actions (renewals, registration, migration) when the owner holds no ETH; the
 * owner signs each operation instead of sending a transaction.
 *
 * **Details**
 *
 * - Writes other than registration, migration and `hca.execute` succeed only where the HCA holds
 *   the roles they need, so transfers and record edits through it usually fail.
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
 * import { bundler } from "@ensforge/hca"
 *
 * bundler({ url, paymaster: url, paymasterContext: { sponsorshipPolicyId: "sp_…" } })
 * ```
 *
 * @stability experimental
 * @category executors
 * @since 1.0.0
 */
export const bundler = (options: BundlerOptions): Executor => bundlerExecutor(options);

type BundlerExecutor = Executor & {
  readonly send: NonNullable<Executor["send"]>;
  readonly status: NonNullable<Executor["status"]>;
};

const bundlerExecutor = (options: BundlerOptions): BundlerExecutor => {
  const id = options.id ?? "bundler";
  const timeout = options.timeout ?? 180_000;
  // When each UserOperation was first seen pending; a resumed plan starts its wait afresh.
  const pendingSince = new Map<string, number>();
  const paymasterClient =
    options.paymaster === undefined
      ? undefined
      : createPaymasterClient({ transport: http(options.paymaster) });
  const paymaster =
    paymasterClient === undefined
      ? undefined
      : {
          getPaymasterStubData: (
            parameters: Parameters<typeof paymasterClient.getPaymasterStubData>[0],
          ) => paymasterClient.getPaymasterStubData(parameters).catch(markPaymasterError),
          getPaymasterData: (parameters: Parameters<typeof paymasterClient.getPaymasterData>[0]) =>
            paymasterClient.getPaymasterData(parameters).catch(markPaymasterError),
        };
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
          calls: Arr.map(request.calls, (call) => ({
            to: call.to,
            data: call.data,
            value: call.value,
          })),
        });
      } catch (cause) {
        if (cause instanceof HcaError) throw cause;
        throw new HcaError({
          code: isPaymasterError(cause) ? "HCA_PAYMASTER_REJECTED" : "HCA_BUNDLER_REJECTED",
          executor: id,
          cause,
        });
      }
    },
    status: async (reference, context) => {
      if (!isHex(reference)) {
        throw new HcaError({
          code: "HCA_EXECUTION_FAILED",
          executor: id,
          details: [`${reference} is not a UserOperation hash`],
        });
      }
      let receipt: UserOperationReceipt;
      try {
        receipt = await clientFor(context).getUserOperationReceipt({ hash: reference });
      } catch {
        const since = pendingSince.get(reference) ?? Date.now();
        pendingSince.set(reference, since);
        if (Date.now() - since < timeout) return { status: "pending" };
        pendingSince.delete(reference);
        throw new HcaError({
          code: "HCA_EXECUTION_TIMEOUT",
          executor: id,
          details: [`UserOperation ${reference}`],
        });
      }
      pendingSince.delete(reference);
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
 * @stability experimental
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
 * const via = hca({ executors: [pimlico({ apiKey, sponsor: true })] })
 * ```
 *
 * **Example** (With a policy)
 *
 * ```ts
 * import { pimlico } from "@ensforge/hca"
 *
 * pimlico({ apiKey, sponsor: true, sponsorshipPolicyId: "sp_…" })
 * ```
 *
 * **Example** (Unsponsored: the HCA pays gas)
 *
 * ```ts
 * import { pimlico } from "@ensforge/hca"
 *
 * pimlico({ apiKey })
 * ```
 *
 * @stability experimental
 * @category executors
 * @since 1.0.0
 */
export const pimlico = (options: PimlicoOptions): Executor => {
  const url = (chainId: number) =>
    `https://api.pimlico.io/v2/${chainId}/rpc?apikey=${options.apiKey}`;
  const forChain = new Map<number, BundlerExecutor>();
  const executorFor = (chainId: number) => {
    let executor = forChain.get(chainId);
    if (executor === undefined) {
      executor = bundlerExecutor({
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
    send: (request, context) => executorFor(context.chainId).send(request, context),
    status: (reference, context) => executorFor(context.chainId).status(reference, context),
  };
};
