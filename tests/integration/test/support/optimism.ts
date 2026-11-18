import { NodeServices } from "@effect/platform-node";
import { Context, Effect, Layer } from "effect";

import { Abis, Deployments } from "@ensforge/contracts";
import type { Ensforge } from "@ensforge/sdk";
import { Anvil, Chain, ChainError, Devnet, devnetClient } from "@ensforge/test-devnet";
import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeFunctionData,
  defineChain,
  encodeAbiParameters,
  getAddress,
  hexToString,
  http,
  labelhash,
  namehash,
  parseAbi,
  slice,
  zeroHash,
  type Address,
} from "viem";
import { foundry } from "viem/chains";

import { Gateways } from "./gateways.ts";

/** OP Mainnet: its chain ID, and the ENSIP-11 coin type its primary names live under. */
const chainId = 10;
const reverseLabel = "8000000a";
const registrar = Deployments.l2ReverseRegistrars[chainId];

const resolveAbi = parseAbi(["function resolve(bytes name, bytes data) view returns (bytes)"]);

/** An RPC request to the L2 (or the devnet), failing with `ChainError`. */
const l2 = <A>(method: string, run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: (cause) => new ChainError({ method, cause }) });

/** How a test's wallet on the L2 behaves. */
export type L2WalletOptions = {
  /** Reject every transaction, as a user who clicks "reject" (an interrupted plan). */
  readonly reject?: boolean | undefined;
};

/**
 * A second anvil answering as OP Mainnet, with ENS's L2 reverse registrar at its mainnet address,
 * and `8000000a.reverse` on the devnet served from it through an in-process gateway, so L2
 * primary names round-trip through `primaryName.get`. The devnet's smart-contract wallet, Ownable
 * and ERC-6492 wallet factory mocks, and ERC-6492's validator, exist at the same addresses on both
 * chains, as multichain accounts and singletons do.
 */
export class Optimism extends Context.Service<
  Optimism,
  {
    readonly chainId: number;
    /** The L2 reverse registrar on the L2. */
    readonly registrar: Address;
    /** The primary name `address` has in the L2 registrar. */
    readonly nameOf: (address: Address) => Effect.Effect<string, ChainError>;
    /** Moves the L2's clock forward by `seconds` and mines a block. */
    readonly passTime: (seconds: number) => Effect.Effect<void, ChainError>;
    /** `chains` for `Ensforge.create`: the L2's clients, signing as `account`. */
    readonly chains: (
      account: Address,
      options?: L2WalletOptions,
    ) => NonNullable<Ensforge.CreateOptions["chains"]>;
    /** Runs `effect` and then restores both chains. */
    readonly isolated: <A, E, R>(
      effect: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E | ChainError, R>;
  }
>()("@ensforge/test-integration/Optimism") {
  static readonly layer = Layer.effect(
    Optimism,
    Effect.gen(function* () {
      const devnet = yield* Devnet;
      const chain = yield* Chain;
      const gateways = yield* Gateways;
      const l2Chain = defineChain({ ...foundry, id: chainId, name: "OP Mainnet (devnet)" });

      // The L2 starts at the devnet's time, so claims expire on both clocks alike.
      const { rpcUrl } = yield* (yield* Anvil).start({ chainId, timestamp: yield* chain.now });
      const client = devnetClient(rpcUrl, l2Chain);
      // Contract code and owners, copied from the devnet. The registrar checks signatures of
      // accounts not deployed yet with ERC-6492's validator, which deploys them through their
      // factory (at the same address on both chains, so it predicts the same accounts).
      const copies = [
        [devnet.contract("mock.l2ReverseRegistrar"), registrar],
        ...[
          "mock.smartContractWallet",
          "mock.ownable",
          "mock.erc6492WalletFactory",
          "canonical.universalSigValidator",
        ].map((key) => [devnet.contract(key), devnet.contract(key)] as const),
      ];
      for (const [from, to] of copies) {
        const code = (yield* chain.code(from)) ?? "0x";
        const owner = yield* l2("eth_getStorageAt", () =>
          devnet.client.getStorageAt({ address: from, slot: zeroHash }),
        );
        yield* l2("anvil_setCode", () => client.setCode({ address: to, bytecode: code }));
        yield* l2("anvil_setStorageAt", () =>
          client.setStorageAt({ address: to, index: zeroHash, value: owner ?? zeroHash }),
        );
      }

      const nameOf = (address: Address) =>
        l2("eth_call", () =>
          client.readContract({
            address: registrar,
            abi: Abis.v1.l2ReverseRegistrar,
            functionName: "nameForAddr",
            args: [address],
          }),
        );
      const passTime = (seconds: number) =>
        l2("evm_increaseTime", async () => {
          await client.increaseTime({ seconds });
          await client.mine({ blocks: 1 });
        });

      // The gateway answers `name(node)` for `<address>.8000000a.reverse` from the registrar.
      const gateway = yield* gateways.serveLookups(({ data }) => {
        const [name] = decodeFunctionData({ abi: resolveAbi, data }).args;
        return nameOf(getAddress(`0x${hexToString(slice(name, 1, 41))}`)).pipe(
          Effect.map((primaryName) => encodeAbiParameters([{ type: "string" }], [primaryName])),
        );
      });
      const resolver = devnet.contract("mock.gatewayResolver");
      yield* chain.write({
        account: devnet.accounts.owner,
        address: resolver,
        abi: parseAbi(["function setUrl(string)"]),
        functionName: "setUrl",
        args: [gateway.url],
      });
      yield* chain.write({
        account: devnet.accounts.owner,
        address: devnet.contract("v1.registry"),
        abi: Abis.v1.ensRegistry,
        functionName: "setSubnodeRecord",
        args: [namehash("reverse"), labelhash(reverseLabel), devnet.accounts.owner, resolver, 0n],
      });

      const transport = http(rpcUrl);
      const rejecting = custom({
        request: () =>
          Promise.reject(Object.assign(new Error("User rejected the request."), { code: 4001 })),
      });
      const chains = (account: Address, options: L2WalletOptions = {}) => ({
        [chainId]: {
          publicClient: createPublicClient({ chain: l2Chain, transport, pollingInterval: 50 }),
          walletClient: createWalletClient({
            chain: l2Chain,
            account,
            pollingInterval: 50,
            transport: options.reject === true ? rejecting : transport,
          }),
        },
      });

      const isolated = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        Effect.acquireUseRelease(
          l2("evm_snapshot", () => client.snapshot()),
          () => chain.isolated(effect),
          (id) => Effect.orDie(l2("evm_revert", () => client.revert({ id }))),
        );

      return Optimism.of({ chainId, registrar, nameOf, passTime, chains, isolated });
    }),
  ).pipe(Layer.provide(Anvil.layer), Layer.provide(NodeServices.layer));
}
