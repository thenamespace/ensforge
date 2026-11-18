import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import {
  standaloneHcaFactoryV2Abi,
  standaloneSingleOwnerHcaV2Abi,
} from "@ensforge/contracts/v2/experimental/hca";
import { bundler, pimlico } from "@ensforge/hca/internal/executors/bundler";
import type { ExecutionRequest } from "@ensforge/hca/internal/types";
import { expectRejection, scriptedTransport } from "@ensforge/test-harness";
import { contractScript } from "@ensforge/test-harness/contracts-eth-call";
import {
  createWalletClient,
  decodeAbiParameters,
  decodeFunctionData,
  padHex,
  recoverMessageAddress,
  type Hex,
} from "viem";
import {
  entryPoint07Abi,
  formatUserOperation,
  getUserOperationHash,
  type RpcUserOperation,
} from "viem/account-abstraction";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

import { contracts, hcaAddress, makeClient, owner, proxyLogic, v2 } from "../fixtures";

const bundlerUrl = "https://bundler.test/rpc";
const paymasterUrl = "https://paymaster.test/rpc";

type Rpc = { readonly method: string; readonly id: number };
type Answer = { readonly result: unknown } | { readonly error: { code: number; message: string } };

// Bundler and paymaster JSON-RPC, answered in memory; no request leaves the process. The harness
// setup blocks `fetch` again before the next test.
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

const gas = {
  preVerificationGas: "0x1",
  verificationGasLimit: "0x1",
  callGasLimit: "0x1",
  paymasterVerificationGasLimit: "0x1",
  paymasterPostOpGasLimit: "0x1",
};

const contextFor = (deployed = true) => {
  const { context } = makeClient({ deployed });
  const chain = contractScript({
    code: deployed ? [hcaAddress] : [],
    contracts: [
      {
        address: contracts.entryPoint,
        abi: entryPoint07Abi,
        functions: { getNonce: () => 7n },
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

const estimateFails = (method: string): Answer =>
  method === "eth_estimateUserOperationGas"
    ? { error: { code: -32500, message: "AA23 reverted" } }
    : { result: gas };
const paymasterFails = (method: string): Answer =>
  method.startsWith("pm_")
    ? { error: { code: -32500, message: "sponsorship policy rejected the operation" } }
    : { result: gas };
const paymasterOk = (method: string): Answer =>
  method.startsWith("pm_")
    ? {
        result: {
          paymaster: "0x0000000000000000000000000000000000000Fee",
          paymasterData: "0x",
          paymasterVerificationGasLimit: "0x1",
          paymasterPostOpGasLimit: "0x1",
        },
      }
    : estimateFails(method);

// Executors are Promise interfaces the write runtime calls, so these tests await them.
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
      const { send } = bundler({ url: bundlerUrl, ...(paymaster ? { paymaster } : {}) });
      assert.isDefined(send);

      const error = yield* expectRejection(() => send(request, contextFor()), {
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
      const { send } = bundler({ url: bundlerUrl });
      assert.isDefined(send);

      yield* expectRejection(() => send(sent, context), {
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
      const { status } = bundler({ url: bundlerUrl });
      assert.isDefined(status);

      assert.deepStrictEqual(yield* Effect.promise(() => status(hash, contextFor())), expected);
    }),
  );

  it.effect("gives up on an operation pending longer than its timeout", () =>
    Effect.gen(function* () {
      serveRpc(() => ({ result: null }));
      const { status } = bundler({ url: bundlerUrl, timeout: 0 });
      assert.isDefined(status);

      yield* expectRejection(() => status(hash, contextFor()), {
        _tag: "HcaError",
        code: "HCA_EXECUTION_TIMEOUT",
      });
    }),
  );

  it.effect("keeps waiting within its timeout, then reports the operation once it lands", () =>
    Effect.gen(function* () {
      const { status } = bundler({ url: bundlerUrl });
      assert.isDefined(status);

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

describe("bundler executor: UserOperations", () => {
  const operationHash: Hex = `0x${"cd".repeat(32)}`;
  const signer = privateKeyToAccount(`0x${"11".repeat(32)}`);
  const calls = [
    { to: owner, data: "0xabcdef" as Hex, value: 5n },
    { to: hcaAddress, data: "0x01" as Hex, value: 0n },
  ];

  /** Serves a bundler (and paymaster) that accepts every operation, recording each request. */
  const serveBundler = () => {
    const requests: {
      readonly url: string;
      readonly method: string;
      readonly params: readonly unknown[];
    }[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Rpc & { readonly params: readonly unknown[] };
      requests.push({ url: String(input), method: body.method, params: body.params });
      const result = (() => {
        switch (body.method) {
          case "eth_sendUserOperation":
            return operationHash;
          case "pm_getPaymasterStubData":
            return {
              paymaster: "0x0000000000000000000000000000000000000Fee",
              paymasterData: "0x01",
              paymasterVerificationGasLimit: "0x1",
              paymasterPostOpGasLimit: "0x1",
            };
          case "pm_getPaymasterData":
            return {
              paymaster: "0x0000000000000000000000000000000000000Fee",
              paymasterData: "0x02",
              paymasterVerificationGasLimit: "0x1",
              paymasterPostOpGasLimit: "0x1",
            };
          case "eth_chainId":
            return "0xaa36a7";
          case "eth_getUserOperationReceipt":
            return null;
          default:
            return gas;
        }
      })();
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), {
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const sent = () => {
      const params = requests.find(({ method }) => method === "eth_sendUserOperation")?.params;
      return (params as readonly RpcUserOperation<"0.7">[])[0] as RpcUserOperation<"0.7">;
    };
    return { requests, sent };
  };

  it.effect("sends the calls as one ERC-7579 batch, signed by the owner", () =>
    Effect.gen(function* () {
      const { requests, sent } = serveBundler();
      const { send } = bundler({ url: bundlerUrl });
      assert.isDefined(send);

      const reference = yield* Effect.promise(() => send({ ...request, calls }, contextFor()));

      assert.strictEqual(reference, operationHash);
      const operation = sent();
      assert.strictEqual(operation.sender, hcaAddress);
      // The entry point's nonce for key 0, the account's fixed validator.
      assert.strictEqual(operation.nonce, "0x7");
      assert.strictEqual(operation.factory, undefined);
      assert.strictEqual(operation.paymaster, undefined);
      const execute = decodeFunctionData({
        abi: standaloneSingleOwnerHcaV2Abi,
        data: operation.callData,
      });
      assert.strictEqual(execute.functionName, "execute");
      const [mode, executions] = execute.args as readonly [Hex, Hex];
      assert.strictEqual(mode, padHex("0x01", { size: 32, dir: "right" }));
      assert.deepStrictEqual(
        decodeAbiParameters(
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
          executions,
        )[0],
        calls.map(({ to, value, data }) => ({ target: to, value, callData: data })),
      );
      // Estimated with a well-formed stub signature, sent with the owner's over the operation.
      const estimated = requests.find(({ method }) => method === "eth_estimateUserOperationGas")
        ?.params[0] as RpcUserOperation<"0.7">;
      assert.strictEqual(estimated.signature, `0x${"11".repeat(32)}${"22".repeat(32)}1b`);
      const hash = getUserOperationHash({
        userOperation: formatUserOperation(operation),
        entryPointAddress: contracts.entryPoint,
        entryPointVersion: "0.7",
        chainId: sepolia.id,
      });
      assert.strictEqual(
        yield* Effect.promise(() =>
          recoverMessageAddress({ message: { raw: hash }, signature: operation.signature }),
        ),
        signer.address,
      );
    }),
  );

  it.effect("deploys an undeployed HCA with the operation", () =>
    Effect.gen(function* () {
      const { sent } = serveBundler();
      const { send } = bundler({ url: bundlerUrl });
      assert.isDefined(send);

      yield* Effect.promise(() => send({ ...request, deployed: false }, contextFor(false)));

      const operation = sent();
      assert.strictEqual(operation.factory, contracts.standaloneFactory);
      const deploy = decodeFunctionData({
        abi: standaloneHcaFactoryV2Abi,
        data: operation.factoryData as Hex,
      });
      assert.strictEqual(deploy.functionName, "deploy");
      assert.deepStrictEqual(deploy.args, [owner, contracts.standaloneImplementation, 0n]);
    }),
  );

  it.effect("sponsors through the paymaster with its context", () =>
    Effect.gen(function* () {
      const { requests, sent } = serveBundler();
      const executor = bundler({
        url: bundlerUrl,
        paymaster: paymasterUrl,
        paymasterContext: { policy: "p1" },
      });
      assert.isDefined(executor.send);

      yield* Effect.promise(() =>
        (executor.send as NonNullable<typeof executor.send>)(request, contextFor()),
      );

      assert.deepStrictEqual(executor.capabilities, {
        sessions: false,
        sponsorship: true,
        deploys: true,
      });
      assert.strictEqual(sent().paymasterData, "0x02");
      const stub = requests.find(({ method }) => method === "pm_getPaymasterStubData");
      assert.strictEqual(stub?.url, paymasterUrl);
      assert.deepStrictEqual(stub?.params[3], { policy: "p1" });
    }),
  );

  it("sponsors nothing without a paymaster", () => {
    assert.deepStrictEqual(bundler({ url: bundlerUrl }).capabilities, {
      sessions: false,
      sponsorship: false,
      deploys: true,
    });
    assert.strictEqual(bundler({ url: bundlerUrl }).id, "bundler");
  });

  it.effect("sends through Pimlico's endpoint for the chain, sponsored with a policy", () =>
    Effect.gen(function* () {
      const { requests, sent } = serveBundler();
      const sponsored = pimlico({ apiKey: "key", sponsor: true, sponsorshipPolicyId: "sp_1" });
      const plain = pimlico({ apiKey: "key", sponsorshipPolicyId: "sp_1" });
      const endpoint = "https://api.pimlico.io/v2/11155111/rpc?apikey=key";

      yield* Effect.promise(() =>
        (sponsored.send as NonNullable<typeof sponsored.send>)(request, contextFor()),
      );
      const sponsoredOperation = sent();
      const sponsoredRequests = requests.splice(0);
      yield* Effect.promise(() =>
        (plain.send as NonNullable<typeof plain.send>)(request, contextFor()),
      );

      assert.strictEqual(sponsored.id, "pimlico");
      assert.deepStrictEqual(sponsored.capabilities, {
        sessions: false,
        sponsorship: true,
        deploys: true,
      });
      assert.deepStrictEqual(plain.capabilities, {
        sessions: false,
        sponsorship: false,
        deploys: true,
      });
      assert.isTrue(sponsoredRequests.every(({ url }) => url === endpoint));
      assert.deepStrictEqual(
        sponsoredRequests.find(({ method }) => method === "pm_getPaymasterStubData")?.params[3],
        { sponsorshipPolicyId: "sp_1" },
      );
      assert.strictEqual(sponsoredOperation.paymasterData, "0x02");
      assert.isFalse(requests.some(({ method }) => method.startsWith("pm_")));
      assert.isTrue(requests.every(({ url }) => url === endpoint));
    }),
  );

  it.effect("follows a Pimlico operation at Pimlico's endpoint", () =>
    Effect.gen(function* () {
      const { requests } = serveBundler();
      const executor = pimlico({ apiKey: "key" });

      yield* Effect.promise(() =>
        (executor.status as NonNullable<typeof executor.status>)(operationHash, contextFor()),
      );

      assert.deepStrictEqual(
        requests.map(({ url, method, params }) => [url, method, params]),
        [
          [
            "https://api.pimlico.io/v2/11155111/rpc?apikey=key",
            "eth_getUserOperationReceipt",
            [operationHash],
          ],
        ],
      );
    }),
  );
});

/** The context of a client whose deployment `change` rewrites. */
const withDeployment = (change: (deployment: { readonly v2?: object }) => object) => {
  const context = contextFor();
  const client = context.client as unknown as { readonly deployment: { readonly v2?: object } };
  return { ...context, client: { ...client, deployment: change(client.deployment) } as never };
};

describe("bundler executor: deployments", () => {
  it.effect.each([
    ["ENSv2", withDeployment((deployment) => ({ ...deployment, v2: undefined }))],
    [
      "an HCA deployment",
      withDeployment((deployment) => ({ ...deployment, v2: { ...deployment.v2, hca: undefined } })),
    ],
  ] as const)("refuses a chain without %s", ([, context]) =>
    Effect.gen(function* () {
      serveRpc(() => {
        throw new Error("no request expected");
      });
      const { send } = bundler({ url: bundlerUrl });
      assert.isDefined(send);

      const error = yield* expectRejection(() => send(request, context), {
        _tag: "HcaError",
        code: "HCA_EXECUTOR_UNSUPPORTED",
      });

      assert.strictEqual((error as { readonly executor?: string }).executor, "bundler");
    }),
  );

  it.effect("names Pimlico in its rejections", () =>
    Effect.gen(function* () {
      serveRpc((_, method) => estimateFails(method));
      const executor = pimlico({ apiKey: "key" });

      const error = yield* expectRejection(
        () => (executor.send as NonNullable<typeof executor.send>)(request, contextFor()),
        { _tag: "HcaError", code: "HCA_BUNDLER_REJECTED" },
      );

      assert.strictEqual((error as { readonly executor?: string }).executor, "pimlico");
    }),
  );
});

describe("bundler executor: pending operations", () => {
  const hash: Hex = `0x${"ef".repeat(32)}`;
  const pause = Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 60)));

  it.effect("times an operation from when it was first seen pending, and starts again after", () =>
    Effect.gen(function* () {
      serveRpc(() => ({ result: null }));
      const { status } = bundler({ url: bundlerUrl, timeout: 50 });
      assert.isDefined(status);
      const poll = Effect.promise(() => status(hash, contextFor()));

      assert.deepStrictEqual(yield* poll, { status: "pending" });
      yield* pause;
      const error = yield* expectRejection(() => status(hash, contextFor()), {
        _tag: "HcaError",
        code: "HCA_EXECUTION_TIMEOUT",
      });
      // Timed out, the operation is forgotten: asked again, it is newly pending.
      assert.deepStrictEqual(yield* poll, { status: "pending" });

      assert.deepStrictEqual((error as { readonly details?: unknown }).details, [
        `UserOperation ${hash}`,
      ]);
    }),
  );

  it.effect("forgets an operation once it lands", () =>
    Effect.gen(function* () {
      const { status } = bundler({ url: bundlerUrl, timeout: 50 });
      assert.isDefined(status);
      const poll = Effect.promise(() => status(hash, contextFor()));

      serveRpc(() => ({ result: null }));
      yield* poll;
      serveRpc((_, method) =>
        method === "eth_getUserOperationReceipt"
          ? {
              result: {
                userOpHash: hash,
                entryPoint: contracts.entryPoint,
                sender: hcaAddress,
                nonce: "0x0",
                actualGasUsed: "0x1",
                actualGasCost: "0x1",
                success: false,
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
            }
          : { result: null },
      );
      const landed = yield* poll;
      yield* pause;
      serveRpc(() => ({ result: null }));

      assert.deepStrictEqual(landed, {
        status: "failed",
        reason: "the UserOperation reverted",
        hashes: [hash],
      });
      assert.deepStrictEqual(yield* poll, { status: "pending" });
    }),
  );
});
