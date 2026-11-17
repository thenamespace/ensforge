import { afterEach, assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { bundler } from "@ensforge/hca/internal/executors/bundler";
import type { ExecutionRequest } from "@ensforge/hca/internal/types";
import { scriptedTransport } from "@ensforge/test-harness";
import { expectRejection } from "@ensforge/test-harness";
import { contractScript } from "@ensforge/test-harness/contracts-eth-call";
import { createWalletClient, type Hex } from "viem";
import { entryPoint07Abi } from "viem/account-abstraction";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

import { contracts, hcaAddress, makeClient, owner, proxyLogic, v2 } from "../fixtures";

const bundlerUrl = "https://bundler.test/rpc";
const paymasterUrl = "https://paymaster.test/rpc";

type Rpc = { readonly method: string; readonly id: number };
type Answer = { readonly result: unknown } | { readonly error: { code: number; message: string } };

// Bundler and paymaster JSON-RPC, answered in memory; no request leaves the process.
const serveRpc = (answer: (url: string, method: string) => Answer) => {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as Rpc | readonly Rpc[];
    const reply = (rpc: Rpc) => ({ jsonrpc: "2.0", id: rpc.id, ...answer(url, rpc.method) });
    return new Response(
      JSON.stringify(Array.isArray(body) ? body.map(reply) : reply(body as Rpc)),
      {
        headers: { "content-type": "application/json" },
      },
    );
  }) as typeof fetch;
};

const defined = <value>(value: value | undefined): value => {
  assert.isDefined(value);
  return value as value;
};

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const gas = {
  preVerificationGas: "0x1",
  verificationGasLimit: "0x1",
  callGasLimit: "0x1",
  paymasterVerificationGasLimit: "0x1",
  paymasterPostOpGasLimit: "0x1",
};
const stubData = {
  paymaster: "0x0000000000000000000000000000000000000Fee",
  paymasterData: "0x",
  paymasterVerificationGasLimit: "0x1",
  paymasterPostOpGasLimit: "0x1",
};

const contextFor = () => {
  const { context } = makeClient({ deployed: true });
  const chain = contractScript({
    code: [hcaAddress],
    contracts: [
      {
        address: contracts.entryPoint,
        abi: entryPoint07Abi,
        functions: { getNonce: () => 0n },
      },
      {
        address: v2.contracts.verifiableFactory,
        abi: Abis.v2.verifiableFactory,
        functions: { proxyLogic: () => proxyLogic },
      },
    ],
    fallback: ({ method }) => {
      if (method === "eth_getBlockByNumber") return { baseFeePerGas: "0x1", number: "0x1" };
      if (method === "eth_maxPriorityFeePerGas") return "0x1";
      if (method === "eth_gasPrice") return "0x1";
      return undefined;
    },
  });
  const { transport } = scriptedTransport(chain);
  const walletClient = createWalletClient({
    chain: sepolia,
    transport,
    account: privateKeyToAccount(`0x${"11".repeat(32)}`),
  });
  return { ...context, publicClient: walletClient, walletClient };
};

const request: ExecutionRequest = {
  chainId: sepolia.id,
  hca: hcaAddress,
  owner,
  deployed: true,
  calls: [{ to: owner, data: "0x", value: 0n }],
  description: "test",
};

const rejection = (message: string) => ({ error: { code: -32500, message } });

const estimateFails = (method: string): Answer =>
  method === "eth_estimateUserOperationGas" ? rejection("AA23 reverted") : { result: gas };
const paymasterFails = (method: string): Answer =>
  method.startsWith("pm_")
    ? rejection("sponsorship policy rejected the operation")
    : { result: gas };
const paymasterOk = (method: string): Answer =>
  method.startsWith("pm_") ? { result: stubData } : estimateFails(method);

describe("bundler executor: error classification", () => {
  // Bundler error messages print the UserOperation's `paymaster…` fields once a paymaster is set,
  // and hosted services (Pimlico) serve both from one URL: neither may decide the code.
  it.effect.each([
    ["a bundler rejection without a paymaster", undefined, estimateFails, "HCA_BUNDLER_REJECTED"],
    ["a bundler rejection with a paymaster", paymasterUrl, paymasterOk, "HCA_BUNDLER_REJECTED"],
    ["a bundler rejection with a shared URL", bundlerUrl, paymasterOk, "HCA_BUNDLER_REJECTED"],
    ["a paymaster refusal", paymasterUrl, paymasterFails, "HCA_PAYMASTER_REJECTED"],
    ["a paymaster refusal with a shared URL", bundlerUrl, paymasterFails, "HCA_PAYMASTER_REJECTED"],
  ] as const)("classifies %s", ([, paymaster, answer, code]) =>
    Effect.gen(function* () {
      serveRpc((_, method) => answer(method));
      const executor = bundler({ url: bundlerUrl, ...(paymaster ? { paymaster } : {}) });
      const error = yield* expectRejection(() => defined(executor.send)(request, contextFor()), {
        _tag: "HcaError",
        code,
      });
      assert.strictEqual((error as { executor?: string }).executor, "bundler");
    }),
  );

  it.effect.each([
    ["a session request", { ...request, session: {} as never }, true],
    ["a context without a wallet", request, false],
  ] as const)("refuses %s before any request", ([, sent, withWallet]) =>
    Effect.gen(function* () {
      serveRpc(() => {
        throw new Error("no request expected");
      });
      const context = withWallet ? contextFor() : { ...contextFor(), walletClient: undefined };
      yield* expectRejection(() => defined(bundler({ url: bundlerUrl }).send)(sent, context), {
        _tag: "HcaError",
        code: "HCA_EXECUTOR_UNSUPPORTED",
      });
    }),
  );
});

describe("bundler executor: status", () => {
  const hash: Hex = `0x${"ab".repeat(32)}`;
  const receipt = (success: boolean) => ({
    result: {
      userOpHash: hash,
      entryPoint: contracts.entryPoint,
      sender: hcaAddress,
      nonce: "0x0",
      actualGasUsed: "0x1",
      actualGasCost: "0x1",
      success,
      reason: success ? undefined : "AA reverted",
      logs: [],
      receipt: {
        transactionHash: hash,
        blockHash: hash,
        blockNumber: "0x1",
        transactionIndex: "0x0",
        from: owner,
        to: contracts.entryPoint,
        cumulativeGasUsed: "0x1",
        gasUsed: "0x1",
        effectiveGasPrice: "0x1",
        logs: [],
        logsBloom: `0x${"00".repeat(256)}`,
        status: "0x1",
        type: "0x2",
        contractAddress: null,
      },
    },
  });

  it.effect.each([
    ["success", receipt(true), { status: "success", hashes: [hash] }],
    ["failed", receipt(false), { status: "failed", reason: "AA reverted", hashes: [hash] }],
    ["pending", { result: null }, { status: "pending" }],
  ] as const)("reports %s", ([, answer, expected]) =>
    Effect.gen(function* () {
      serveRpc(() => answer);
      const status = yield* Effect.promise(() =>
        defined(bundler({ url: bundlerUrl }).status)(hash, contextFor()),
      );
      assert.deepStrictEqual(status, expected);
    }),
  );

  // Executor hooks are Promise interfaces the write runtime calls.
  it.effect("gives up on an operation pending longer than its timeout", () =>
    Effect.gen(function* () {
      serveRpc(() => ({ result: null }));
      const status = defined(bundler({ url: bundlerUrl, timeout: 0 }).status);
      yield* expectRejection(() => status(hash, contextFor()), {
        _tag: "HcaError",
        code: "HCA_EXECUTION_TIMEOUT",
      });
    }),
  );

  it.effect("keeps waiting within its timeout, then reports the operation once it lands", () =>
    Effect.gen(function* () {
      const status = defined(bundler({ url: bundlerUrl }).status);
      serveRpc(() => ({ result: null }));
      assert.deepStrictEqual(yield* Effect.promise(() => status(hash, contextFor())), {
        status: "pending",
      });
      serveRpc(() => receipt(true));
      assert.deepStrictEqual(yield* Effect.promise(() => status(hash, contextFor())), {
        status: "success",
        hashes: [hash],
      });
    }),
  );
});
