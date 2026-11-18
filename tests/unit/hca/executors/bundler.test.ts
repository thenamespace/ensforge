import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Option, Schema, String as Str } from "effect";

import { Abis, Deployments } from "@ensforge/contracts";
import {
  standaloneHcaFactoryV2Abi,
  standaloneSingleOwnerHcaV2Abi,
} from "@ensforge/contracts/v2/experimental/hca";
import { bundler, pimlico } from "@ensforge/hca/internal/executors/bundler";
import type { ExecutionRequest, HcaSession } from "@ensforge/hca/internal/types";
import type { Write } from "@ensforge/sdk";
import { expectRejection, scriptedTransport } from "@ensforge/test-harness";
import { contractScript } from "@ensforge/test-harness/contracts-eth-call";
import {
  createWalletClient,
  decodeAbiParameters,
  decodeFunctionData,
  padHex,
  zeroAddress,
  zeroHash,
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

import { contracts, defined, hcaAddress, makeClient, owner, proxyLogic, v2 } from "../fixtures";

const bundlerUrl = "https://bundler.test/rpc";
const paymasterUrl = "https://paymaster.test/rpc";

const Rpc = Schema.Struct({
  method: Schema.String,
  id: Schema.Finite,
  params: Schema.optional(Schema.Array(Schema.Unknown)),
});
type Rpc = typeof Rpc.Type;
type Answer = { readonly result: unknown } | { readonly error: { code: number; message: string } };

const readRequests = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Union([Rpc, Schema.Array(Rpc)])),
);
const writeJson = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

// Bundler and paymaster JSON-RPC, answered in memory; no request leaves the process. The harness
// setup blocks `fetch` again before the next test.
const installFetch = (handle: (url: string, rpc: Rpc) => unknown) => {
  globalThis.fetch = (input, init) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const body = yield* readRequests(init?.body);
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const replies = Arr.map(Arr.ensure(body), (rpc) => handle(url, rpc));
        const text = yield* writeJson(Arr.isArray(body) ? replies : replies[0]);
        return new Response(text, { headers: { "content-type": "application/json" } });
      }),
    );
};

const serveRpc = (answer: (url: string, method: string) => Answer) => {
  installFetch((url, rpc) => ({ jsonrpc: "2.0", id: rpc.id, ...answer(url, rpc.method) }));
};

const gas = {
  preVerificationGas: "0x1",
  verificationGasLimit: "0x1",
  callGasLimit: "0x1",
  paymasterVerificationGasLimit: "0x1",
  paymasterPostOpGasLimit: "0x1",
};

const contextFor = (
  deployed = true,
  overrides: Parameters<typeof makeClient>[0] = {},
): Write.Via.Context => {
  const { context } = makeClient({ deployed, ...overrides });
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
    account: privateKeyToAccount(`0x${Str.repeat(32)("11")}`),
  });
  return { ...context, publicClient: walletClient, walletClient };
};

const session: HcaSession = {
  chainId: sepolia.id,
  hca: hcaAddress,
  owner,
  sessionKey: owner,
  terms: {
    sessionNonce: 0n,
    validUntil: 4_000_000_000,
    resolver: zeroAddress,
    refundToken: zeroAddress,
    maxRefundExchangeRate: 1n,
    maxRefundGasOverhead: 1n,
    maxRefundAmount: 1n,
  },
  permissionId: zeroHash,
  sessionDigest: zeroHash,
  chains: [],
  ownerSignature: "0x",
  signingDomain: "smart-session",
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
  Str.startsWith("pm_")(method)
    ? { error: { code: -32500, message: "sponsorship policy rejected the operation" } }
    : { result: gas };
const paymasterOk = (method: string): Answer =>
  Str.startsWith("pm_")(method)
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
      const { send } = bundler({
        url: bundlerUrl,
        ...(paymaster === undefined ? {} : { paymaster }),
      });
      assert.isDefined(send);

      const error = yield* expectRejection(() => send(request, contextFor()), {
        _tag: "HcaError",
        code,
      });

      assert.strictEqual(Reflect.get(error, "executor"), "bundler");
    }),
  );

  it.effect.each([
    ["a session request", { ...request, session }, true],
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
  const hash: Hex = `0x${Str.repeat(32)("ab")}`;
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
        logsBloom: `0x${Str.repeat(256)("00")}`,
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

      const reported = yield* Effect.promise(() => status(hash, contextFor()));

      assert.deepStrictEqual(reported, expected);
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

  it.effect("rejects a reference that is not a UserOperation hash without asking the bundler", () =>
    Effect.gen(function* () {
      serveRpc(() => {
        throw new Error("the bundler must not be asked");
      });
      const { status } = bundler({ url: bundlerUrl });
      assert.isDefined(status);

      yield* expectRejection(() => status("not-a-hash", contextFor()), {
        _tag: "HcaError",
        code: "HCA_EXECUTION_FAILED",
      });
    }),
  );

  it.effect("keeps waiting within its timeout, then reports the operation once it lands", () =>
    Effect.gen(function* () {
      const { status } = bundler({ url: bundlerUrl });
      assert.isDefined(status);

      serveRpc(() => ({ result: null }));
      const waiting = yield* Effect.promise(() => status(hash, contextFor()));
      assert.deepStrictEqual(waiting, { status: "pending" });

      serveRpc(() => receipt(true));
      const landed = yield* Effect.promise(() => status(hash, contextFor()));
      assert.deepStrictEqual(landed, { status: "success", hashes: [hash] });
    }),
  );
});

describe("bundler executor: UserOperations", () => {
  const operationHash: Hex = `0x${Str.repeat(32)("cd")}`;
  const signer = privateKeyToAccount(`0x${Str.repeat(32)("11")}`);
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
    installFetch((url, rpc) => {
      requests.push({ url, method: rpc.method, params: rpc.params ?? [] });
      const result = (() => {
        switch (rpc.method) {
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
      return { jsonrpc: "2.0", id: rpc.id, result };
    });
    // The fake bundler records raw JSON-RPC params; the first one of these methods is a UserOperation.
    const operationOf = (method: string) => {
      const [params] = Option.getOrThrow(
        Arr.findFirst(requests, (rpc) => rpc.method === method),
      ).params;
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the params are the UserOperation the executor sent
      return params as RpcUserOperation<"0.7">;
    };
    const sent = () => operationOf("eth_sendUserOperation");
    return { requests, sent, operationOf };
  };

  it.effect("sends the calls as one ERC-7579 batch, signed by the owner", () =>
    Effect.gen(function* () {
      const { sent, operationOf } = serveBundler();
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
      if (execute.functionName !== "execute") return;
      const [mode, executions] = execute.args;
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
        Arr.map(calls, ({ to, value, data }) => ({ target: to, value, callData: data })),
      );
      // Estimated with a well-formed stub signature, sent with the owner's over the operation.
      const estimated = operationOf("eth_estimateUserOperationGas");
      assert.strictEqual(estimated.signature, `0x${Str.repeat(32)("11")}${Str.repeat(32)("22")}1b`);
      const hash = getUserOperationHash({
        userOperation: formatUserOperation(operation),
        entryPointAddress: contracts.entryPoint,
        entryPointVersion: "0.7",
        chainId: sepolia.id,
      });
      const recovered = yield* Effect.promise(() =>
        recoverMessageAddress({ message: { raw: hash }, signature: operation.signature }),
      );
      assert.strictEqual(recovered, signer.address);
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
      assert.isDefined(operation.factoryData);
      const deploy = decodeFunctionData({
        abi: standaloneHcaFactoryV2Abi,
        data: operation.factoryData,
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
      yield* Effect.promise(() => defined(executor.send)(request, contextFor()));

      assert.deepStrictEqual(executor.capabilities, {
        sessions: false,
        sponsorship: true,
        deploys: true,
      });
      assert.strictEqual(sent().paymasterData, "0x02");
      const stub = Option.getOrThrow(
        Arr.findFirst(requests, ({ method }) => method === "pm_getPaymasterStubData"),
      );
      assert.strictEqual(stub.url, paymasterUrl);
      assert.deepStrictEqual(stub.params[3], { policy: "p1" });
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

      yield* Effect.promise(() => defined(sponsored.send)(request, contextFor()));
      const sponsoredOperation = sent();
      const sponsoredRequests = requests.splice(0);
      yield* Effect.promise(() => defined(plain.send)(request, contextFor()));

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
      assert.isTrue(Arr.every(sponsoredRequests, ({ url }) => url === endpoint));
      const sponsoredStub = Option.getOrThrow(
        Arr.findFirst(sponsoredRequests, ({ method }) => method === "pm_getPaymasterStubData"),
      );
      assert.deepStrictEqual(sponsoredStub.params[3], { sponsorshipPolicyId: "sp_1" });
      assert.strictEqual(sponsoredOperation.paymasterData, "0x02");
      assert.isFalse(Arr.some(requests, ({ method }) => Str.startsWith("pm_")(method)));
      assert.isTrue(Arr.every(requests, ({ url }) => url === endpoint));
    }),
  );

  it.effect("follows a Pimlico operation at Pimlico's endpoint", () =>
    Effect.gen(function* () {
      const { requests } = serveBundler();
      const executor = pimlico({ apiKey: "key" });

      yield* Effect.promise(() => defined(executor.status)(operationHash, contextFor()));

      assert.deepStrictEqual(
        Arr.map(requests, ({ url, method, params }) => [url, method, params]),
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

describe("bundler executor: deployments", () => {
  const { hca: _hca, ...v2WithoutHca } = Deployments.sepolia.v2;
  const { v2: _v2, ...withoutV2 } = Deployments.sepolia;

  it.effect.each<readonly [string, Write.Via.Context]>([
    ["ENSv2", contextFor(true, { deployment: withoutV2 })],
    [
      "an HCA deployment",
      contextFor(true, { deployment: { ...Deployments.sepolia, v2: v2WithoutHca } }),
    ],
  ])("refuses a chain without %s", ([, context]) =>
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

      assert.strictEqual(Reflect.get(error, "executor"), "bundler");
    }),
  );

  it.effect("names Pimlico in its rejections", () =>
    Effect.gen(function* () {
      serveRpc((_, method) => estimateFails(method));
      const executor = pimlico({ apiKey: "key" });

      const error = yield* expectRejection(() => defined(executor.send)(request, contextFor()), {
        _tag: "HcaError",
        code: "HCA_BUNDLER_REJECTED",
      });

      assert.strictEqual(Reflect.get(error, "executor"), "pimlico");
    }),
  );
});

describe("bundler executor: pending operations", () => {
  const hash: Hex = `0x${Str.repeat(32)("ef")}`;
  // The executor times operations with the wall clock, so these tests run on the real one.
  const pause = Effect.sleep(60);

  it.live("times an operation from when it was first seen pending, and starts again after", () =>
    Effect.gen(function* () {
      serveRpc(() => ({ result: null }));
      const { status } = bundler({ url: bundlerUrl, timeout: 50 });
      assert.isDefined(status);
      const poll = Effect.promise(() => status(hash, contextFor()));

      const first = yield* poll;
      assert.deepStrictEqual(first, { status: "pending" });
      yield* pause;
      const error = yield* expectRejection(() => status(hash, contextFor()), {
        _tag: "HcaError",
        code: "HCA_EXECUTION_TIMEOUT",
      });
      // Timed out, the operation is forgotten: asked again, it is newly pending.
      const again = yield* poll;
      assert.deepStrictEqual(again, { status: "pending" });

      assert.deepStrictEqual(Reflect.get(error, "details"), [`UserOperation ${hash}`]);
    }),
  );

  it.live("forgets an operation once it lands", () =>
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
                  logsBloom: `0x${Str.repeat(256)("00")}`,
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
      const afterwards = yield* poll;
      assert.deepStrictEqual(afterwards, { status: "pending" });
    }),
  );
});
