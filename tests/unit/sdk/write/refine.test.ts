import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Abis, InterfaceIds } from "@ensforge/contracts";
import type { Plan } from "@ensforge/sdk";
import { Errors } from "@ensforge/sdk";
import * as Ensforge from "@ensforge/sdk/internal/client/Ensforge";
import type { AnyError } from "@ensforge/sdk/internal/errors/types";
import {
  isOpaqueRevert,
  write,
  type Explainer,
} from "@ensforge/sdk/internal/internal/action/write";
import { make as makePlan } from "@ensforge/sdk/internal/plan/make";
import { expectFailure, scriptedTransport } from "@ensforge/test-harness";
import { contractScript } from "@ensforge/test-harness/contracts-eth-call";
import {
  createPublicClient,
  encodeErrorResult,
  encodeFunctionData,
  getAddress,
  pad,
  parseAbi,
  type Hex,
} from "viem";
import { mainnet } from "viem/chains";

import { requestsOf, scriptedWallet } from "./wallet";

const account = getAddress("0x00000000000000000000000000000000000a11ce");
const other = getAddress("0x0000000000000000000000000000000000000b0b");
const registry = getAddress("0x00000000000000000000000000000000000000e7");
const resolver = getAddress("0x00000000000000000000000000000000000000a1");
const tokenId = 0x1234n;

const transfer: Plan.Call = {
  to: registry,
  data: encodeFunctionData({
    abi: Abis.v2.permissionedRegistry,
    functionName: "safeTransferFrom",
    args: [account, other, tokenId, 1n, "0x"],
  }),
  value: 0n,
};
// A registry call other than a transfer, and a call no registry function decodes.
const grant: Plan.Call = {
  to: registry,
  data: encodeFunctionData({
    abi: Abis.v2.permissionedRegistry,
    functionName: "getTokenId",
    args: [tokenId],
  }),
  value: 0n,
};
const setText: Plan.Call = { to: resolver, data: "0x10f13a8c", value: 0n };

const insufficientBalance = encodeErrorResult({
  abi: parseAbi(["error ERC1155InsufficientBalance(address,uint256,uint256,uint256)"]),
  errorName: "ERC1155InsufficientBalance",
  args: [account, 0n, 1n, tokenId],
});
const offchainLookup = encodeErrorResult({
  abi: parseAbi(["error OffchainLookup(address,string[],bytes,bytes4,bytes)"]),
  errorName: "OffchainLookup",
  args: [resolver, ["https://gateway.example"], "0x", "0x12345678", "0x"],
});
const unknownError = "0xdeadbeef";

/**
 * A client whose node simulates a plan's calls in order, the first one reverting with `revert`;
 * the registry reports `current` as the token's ID and the resolver whether it is extended.
 */
const node = (options: {
  readonly revert: Hex;
  readonly current?: bigint | "reverts";
  readonly extended?: boolean;
  readonly anonymous?: boolean;
}) => {
  const fallback = ({
    method,
    params,
  }: {
    readonly method: string;
    readonly params: readonly unknown[];
  }) => {
    if (method !== "eth_simulateV1") return undefined;
    const [request] = params as readonly {
      readonly blockStateCalls: readonly { readonly calls: readonly unknown[] }[];
    }[];
    const calls = request?.blockStateCalls[0]?.calls ?? [];
    return [
      {
        number: "0x1",
        hash: pad("0x1"),
        timestamp: "0x1",
        gasLimit: "0x1c9c380",
        gasUsed: "0x0",
        transactions: [],
        calls: calls.map((_, index) =>
          index === 0
            ? {
                status: "0x0",
                returnData: options.revert,
                gasUsed: "0x1",
                logs: [],
                error: { code: 3, message: "execution reverted", data: options.revert },
              }
            : { status: "0x1", returnData: "0x", gasUsed: "0x1", logs: [] },
        ),
      },
    ];
  };
  const { transport, calls } = scriptedTransport(
    contractScript({
      fallback,
      contracts: [
        {
          address: registry,
          abi: Abis.v2.permissionedRegistry,
          functions: {
            getTokenId: () => {
              if (options.current === "reverts") {
                throw Object.assign(new Error("execution reverted"), {
                  code: -32000,
                  data: unknownError,
                });
              }
              return options.current ?? tokenId;
            },
          },
        },
        {
          address: resolver,
          abi: Abis.shared.erc165,
          functions: { supportsInterface: () => options.extended === true },
        },
      ],
    }),
  );
  const client = Ensforge.create({
    publicClient: createPublicClient({ chain: mainnet, transport }),
    ...(options.anonymous === true ? {} : { account }),
    batch: { multicall: false },
  });
  const reads = (functionName: string) =>
    calls.filter(({ method, params }) => {
      if (method !== "eth_call") return false;
      const [request] = params as readonly { readonly data: Hex }[];
      const selector = functionName === "getTokenId" ? grant.data.slice(0, 10) : "0x01ffc9a7";
      return request?.data.startsWith(selector) === true;
    });
  return { client, calls, reads };
};

/** The simulation error of a write whose first call reverts, after the write refines it. */
const simulated = (
  client: ReturnType<typeof node>["client"],
  calls: readonly Plan.Call[],
  extra?: { readonly contractKind: "resolver" | "registry" },
  explain?: Explainer<{ readonly name: string }>,
) => {
  const plan = makePlan({
    operation: "test",
    chainId: 1,
    account,
    steps: [{ id: "write", description: "write", calls }],
  });
  return write("test.write", () => Effect.succeed(plan), extra, explain)
    .methods.simulate(client, { name: "alice.eth" })
    .pipe(Effect.map((simulation) => simulation.steps[0]?.error));
};

describe("stale transfers", () => {
  it.effect("turns the transfer of a token reissued since the plan into PLAN_STALE", () =>
    Effect.gen(function* () {
      const { client } = node({ revert: insufficientBalance, current: tokenId + 1n });

      const error = yield* simulated(client, [setText, grant, transfer]);

      assert.instanceOf(error, Errors.PlanError);
      assert.strictEqual(error?.code, "PLAN_STALE");
      assert.deepStrictEqual(error?.details, [
        `Token ${tokenId} of ${registry} is now ${tokenId + 1n}.`,
      ]);
      assert.strictEqual(
        error?.hint,
        "The name's roles changed since the plan was prepared, which gave it a new token ID. Prepare the plan again.",
      );
      assert.strictEqual(error?.context.registry, registry);
      assert.strictEqual(error?.context.contract, registry);
      assert.strictEqual(error?.context.operation, "test.write.simulate");
      assert.strictEqual(error?.context.name, "alice.eth");
      assert.strictEqual(
        (
          error?.cause as {
            readonly context?: { readonly revert?: { readonly errorName?: string } };
          }
        )?.context?.revert?.errorName,
        "ERC1155InsufficientBalance",
      );
    }),
  );

  it.effect.each<readonly [string, bigint | "reverts"]>([
    ["still has its ID", tokenId],
    ["has no ID the registry reports", "reverts"],
  ])("keeps the revert when the token %s", ([, current]) =>
    Effect.gen(function* () {
      const { client, reads } = node({ revert: insufficientBalance, current });

      const error = yield* simulated(client, [transfer, setText]);

      assert.strictEqual(error?.context.revert?.errorName, "ERC1155InsufficientBalance");
      assert.notStrictEqual(error?.code, "PLAN_STALE");
      assert.strictEqual(reads("getTokenId").length, 1);
    }),
  );

  it.effect("reads no token for other reverts", () =>
    Effect.gen(function* () {
      const { client, reads } = node({ revert: unknownError, current: tokenId + 1n });

      yield* simulated(client, [transfer, setText]);

      assert.strictEqual(reads("getTokenId").length, 0);
    }),
  );
});

describe("resolvers that keep records off-chain", () => {
  it.effect("refuses for a resolver that answered with an OffchainLookup", () =>
    Effect.gen(function* () {
      const { client } = node({ revert: offchainLookup });

      const error = yield* simulated(client, [setText, grant], { contractKind: "resolver" });

      assert.strictEqual(error?._tag, "UnsupportedError");
      assert.strictEqual(error?.code, "RESOLVER_PROFILE_UNSUPPORTED");
      assert.deepStrictEqual(error?.details, [
        "EIP-3668: the resolver answered with an OffchainLookup, which a transaction cannot follow.",
      ]);
      assert.strictEqual(error?.context.contract, setText.to);
      assert.strictEqual(
        (
          error?.cause as {
            readonly context?: { readonly revert?: { readonly errorName?: string } };
          }
        )?.context?.revert?.errorName,
        "OffchainLookup",
      );
    }),
  );

  it.effect("refuses for an extended resolver that reverts without a reason", () =>
    Effect.gen(function* () {
      const { client, calls } = node({ revert: "0x", extended: true });

      const error = yield* simulated(client, [setText, grant], { contractKind: "resolver" });

      assert.strictEqual(error?.code, "RESOLVER_PROFILE_UNSUPPORTED");
      assert.deepStrictEqual(error?.details, [
        "ENSIP-10: the resolver is an extended resolver and reverted without a reason.",
      ]);
      assert.strictEqual(error?.context.contract, setText.to);
      // Bounded as EIP-165 bounds `supportsInterface`, asking for ENSIP-10.
      const question = requestsOf(calls, "eth_call").find((request) => request.to === resolver);
      assert.strictEqual(question?.gas, "0x7530");
      assert.strictEqual(
        question?.data,
        encodeFunctionData({
          abi: Abis.shared.erc165,
          functionName: "supportsInterface",
          args: [InterfaceIds.resolverProfiles.extended],
        }),
      );
    }),
  );

  it.effect.each<readonly [string, Hex, boolean, "resolver" | "registry"]>([
    ["a resolver that is not extended", "0x", false, "resolver"],
    ["a revert with data the SDK does not know", unknownError, true, "resolver"],
    ["a write to another kind of contract", "0x", true, "registry"],
  ])("keeps the revert of %s", ([, revert, extended, contractKind]) =>
    Effect.gen(function* () {
      const { client, reads } = node({ revert, extended });

      const error = yield* simulated(client, [setText, grant], { contractKind });

      assert.strictEqual(error?._tag, "ContractRevertError");
      assert.strictEqual(error?.context.operation, "test.write.simulate");
      assert.strictEqual(
        reads("supportsInterface").length,
        revert === "0x" && contractKind === "resolver" ? 1 : 0,
      );
    }),
  );
});

describe("explainers", () => {
  it.effect("explains an opaque revert, keeping the revert as the cause", () =>
    Effect.gen(function* () {
      const { client } = node({ revert: "0x" });
      const seen: unknown[] = [];

      const error = yield* simulated(
        client,
        [setText, grant],
        undefined,
        (_, options, signer, revert) => {
          seen.push([options.name, signer, revert.context.revert?.data]);
          return Effect.succeed(new Errors.UnauthorizedError({ code: "NOT_OWNER" }));
        },
      );

      assert.deepStrictEqual(seen, [["alice.eth", account, "0x"]]);
      assert.strictEqual(error?._tag, "UnauthorizedError");
      assert.strictEqual((error?.cause as { readonly _tag?: string })?._tag, "ContractRevertError");
      assert.strictEqual(error?.context.operation, "test.write.simulate");
    }),
  );

  it.effect.each<readonly [string, Explainer<{ readonly name: string }>]>([
    ["has no explanation", () => Effect.undefined],
    ["fails", () => Effect.fail(new Errors.InternalError({ code: "UNEXPECTED" }))],
  ])("keeps the revert when the explainer %s", ([, explain]) =>
    Effect.gen(function* () {
      const { client } = node({ revert: "0x" });

      const error = yield* simulated(client, [setText, grant], undefined, explain);

      assert.strictEqual(error?._tag, "ContractRevertError");
    }),
  );
});

describe("refinement preconditions", () => {
  // Without a signer there is nobody whose missing authority could explain the revert.
  it.effect("does not explain a revert without an account", () =>
    Effect.gen(function* () {
      const { client } = node({ revert: "0x", anonymous: true });
      let explained = 0;

      const error = yield* simulated(client, [setText, grant], undefined, () => {
        explained += 1;
        return Effect.succeed(new Errors.UnauthorizedError({ code: "NOT_OWNER" }));
      });

      assert.strictEqual(error?._tag, "ContractRevertError");
      assert.strictEqual(explained, 0);
    }),
  );

  // A rejected resolver write is not a revert: neither the resolver nor the explainer is asked.
  it.effect("leaves a failure without a revert as it is", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet({ refused: ["0x01"], callResult: pad("0x1") });
      let explained = 0;
      const plan = makePlan({
        operation: "test",
        chainId: 1,
        account,
        steps: [
          { id: "write", description: "write", calls: [{ to: resolver, data: "0x01", value: 0n }] },
        ],
      });

      yield* expectFailure(
        write<{ readonly name: string }, never>(
          "test.write",
          () => Effect.succeed(plan),
          { contractKind: "resolver" },
          () => {
            explained += 1;
            return Effect.succeed(new Errors.UnauthorizedError({ code: "NOT_OWNER" }));
          },
        ).send(wallet.client, { name: "alice.eth" }),
        { _tag: "UserRejectedError" },
      );

      assert.strictEqual(explained, 0);
      assert.strictEqual(wallet.count("eth_call"), 0);
    }),
  );

  it.effect.each(["prepare", "simulate", "estimateGas"] as const)(
    "names the %s method as the failing operation",
    (method) =>
      Effect.gen(function* () {
        const { client } = node({ revert: "0x" });
        const methods = write<{ readonly name: string }, AnyError>("test.write", () =>
          Effect.fail(new Errors.NotFoundError({ code: "PLAN_NOT_FOUND" })),
        ).methods;
        const options = { name: "alice.eth" };
        const effects: Record<typeof method, Effect.Effect<unknown, AnyError>> = {
          prepare: methods.prepare(client, options),
          simulate: methods.simulate(client, options),
          estimateGas: methods.estimateGas(client, options),
        };

        const error = yield* expectFailure(effects[method], { _tag: "NotFoundError" });

        assert.strictEqual(error.context.operation, `test.write.${method}`);
      }),
  );
});

describe("isOpaqueRevert", () => {
  it.each([
    [
      "a revert without a name",
      { _tag: "ContractRevertError", context: { revert: { errorName: undefined } } },
      true,
    ],
    [
      "an unmapped require string",
      { _tag: "ContractRevertError", context: { revert: { errorName: "Error" } } },
      true,
    ],
    ["a revert without its data", { _tag: "ContractRevertError", context: {} }, true],
    [
      "a named revert",
      { _tag: "ContractRevertError", context: { revert: { errorName: "Unauthorized" } } },
      false,
    ],
    [
      "another error",
      { _tag: "PermissionError", context: { revert: { errorName: undefined } } },
      false,
    ],
  ] as const)("is %s opaque: %s", (_, error, opaque) => {
    assert.strictEqual(isOpaqueRevert(error as never), opaque);
  });
});
