import { assert } from "@effect/vitest";
import { String as Str } from "effect";

import { Deployments, Abis } from "@ensforge/contracts";
import {
  standaloneHcaFactoryV2Abi,
  standaloneSingleOwnerHcaV2Abi,
} from "@ensforge/contracts/v2/experimental/hca";
import { Ensforge, type Write } from "@ensforge/sdk";
import { scriptedTransport } from "@ensforge/test-harness";
import { contractScript, type ContractStub } from "@ensforge/test-harness/contracts-eth-call";
import {
  concat,
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  getAddress,
  getContractAddress,
  keccak256,
  multicall3Abi,
  pad,
  zeroAddress,
  zeroHash,
  type Address,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";

/** An optional member (an executor's `send`, a route's `prepare`) the test expects to be defined. */
export const defined = <Member>(member: Member | undefined): Member => {
  assert.isDefined(member);
  return member;
};

export const v2 = Deployments.sepolia.v2;
export const v1 = Deployments.sepolia.v1.contracts;
export const contracts = v2.hca;
export const owner: Address = getAddress("0x00000000000000000000000000000000000a11ce");
export const proxyLogic: Address = "0x0000000000000000000000000000000000001091";

// VerifiableFactory proxies, as the ENS app derives them (apps-monorepo
// packages/smart-account/src/verifiable-factory.ts) and `StandaloneHCAFactory.deploymentSalt`.
export const verifiableProxy = (deployer: Address, salt: bigint): Address => {
  const outerSalt = keccak256(
    encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [deployer, salt]),
  );
  return getContractAddress({
    from: v2.contracts.verifiableFactory,
    opcode: "CREATE2",
    salt: outerSalt,
    bytecode: concat([
      "0x3d604d80600a3d3981f3363d3d373d3d3d363d73",
      proxyLogic,
      "0x5af43d82803e903d91602b57fd5bf3",
      outerSalt,
    ]),
  });
};

export const hcaOf = (hcaOwner: Address): Address =>
  verifiableProxy(
    contracts.standaloneFactory,
    BigInt(
      keccak256(
        encodeAbiParameters(
          [{ type: "uint256" }, { type: "address" }, { type: "address" }],
          [0n, hcaOwner, contracts.standaloneImplementation],
        ),
      ),
    ),
  );

export const hcaAddress = hcaOf(owner);

export const ownerSignature: Hex = concat([
  "0x1111111111111111111111111111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222222222222222222222222222",
  "0x1b",
]);

/** The chain as an HCA sees it: undeployed by default, or a verified, deployed account. */
export type World = {
  readonly deployed?: boolean;
  readonly sessionNonce?: bigint;
  readonly stubs?: readonly ContractStub[];
  readonly deployment?: Deployments.Profile;
  /** The latest block's timestamp. */
  readonly now?: bigint;
  /** Give the client a wallet for `owner` that answers from the same chain. */
  readonly wallet?: boolean;
};

/** An Ensforge client of `owner` on Sepolia, whose chain answers from `world`. */
export const makeClient = (world: World = {}) => {
  const script = contractScript({
    // A wallet that signs typed data without asking: its answer is a fixed signature.
    fallback: ({ method }) => (method === "eth_signTypedData_v4" ? ownerSignature : undefined),
    code: world.deployed === true ? [hcaAddress] : [],
    contracts: [
      ...(world.stubs ?? []),
      {
        address: sepolia.contracts.multicall3.address,
        abi: multicall3Abi,
        functions: { getCurrentBlockTimestamp: () => world.now ?? 1_800_000_000n },
      },
      {
        address: v2.contracts.verifiableFactory,
        abi: Abis.v2.verifiableFactory,
        functions: {
          proxyLogic: () => proxyLogic,
          verifyContract: () => contracts.standaloneImplementation,
        },
      },
      {
        address: hcaAddress,
        abi: standaloneSingleOwnerHcaV2Abi,
        functions: {
          ownerAndSessionNonce: () => [owner, world.sessionNonce ?? 0n],
          accountId: () => "ens-standalone-hca.1.1.0",
        },
      },
      {
        address: contracts.standaloneFactory,
        abi: standaloneHcaFactoryV2Abi,
        functions: { authorizedOwnerOf: () => owner, owner: () => owner },
      },
    ],
  });
  const { transport, calls } = scriptedTransport(script);
  const publicClient = createPublicClient({ chain: sepolia, transport });
  const walletClient =
    world.wallet === true
      ? createWalletClient({ chain: sepolia, transport, account: owner })
      : undefined;
  const client = Ensforge.create({
    chain: sepolia,
    transports: { [sepolia.id]: transport },
    publicRpc: false,
    account: owner,
    ...(walletClient === undefined ? {} : { wallet: walletClient }),
    batch: { multicall: false },
    ...(world.deployment === undefined ? {} : { deployment: world.deployment }),
    simulate: false,
  });
  const context: Write.Via.Context = {
    client,
    chainId: sepolia.id,
    account: owner,
    publicClient,
    walletClient,
  };
  return { client, context, calls };
};

/**
 * The route the Rhinestone orchestrator prepares for `calls`: one single-chain, unfunded
 * IntentExecutor element run by the HCA, with `refund` as its gas refund (none by default).
 */
export const rhinestoneRoute = (options: {
  readonly calls: readonly { readonly to: Address; readonly data: Hex; readonly value: bigint }[];
  readonly hca?: Address;
  readonly refund?: {
    readonly token: Address;
    readonly exchangeRate: bigint;
    readonly gasOverhead: bigint;
    readonly amount: bigint;
  };
  readonly gasPrice?: bigint;
  readonly spent?: bigint;
}) => {
  const hca = options.hca ?? hcaAddress;
  const refund = options.refund;
  return {
    intentOp: {
      sponsor: hca,
      nonce: 9n,
      elements: [
        {
          chainId: BigInt(sepolia.id),
          idsAndAmounts: [],
          spendTokens: [],
          mandate: {
            recipient: hca,
            destinationChainId: BigInt(sepolia.id),
            tokenOut: [],
            preClaimOps: { vt: zeroHash, ops: [] },
            destinationOps: { vt: pad("0x0201", { dir: "right" }), ops: options.calls },
            qualifier: {
              settlementContext: {
                settlementLayer: "INTENT_EXECUTOR",
                fundingMethod: "NO_FUNDING",
                using7579: true,
                gasRefund:
                  refund === undefined
                    ? { token: zeroAddress, exchangeRate: 0n, overhead: 0n }
                    : {
                        token: refund.token,
                        exchangeRate: refund.exchangeRate,
                        overhead: (refund.amount << 128n) | refund.gasOverhead,
                      },
              },
            },
          },
        },
      ],
      ...(options.gasPrice === undefined
        ? {}
        : { signedMetadata: { gasPrices: { [String(sepolia.id)]: String(options.gasPrice) } } }),
    },
    ...(options.spent === undefined || refund === undefined
      ? {}
      : {
          intentCost: {
            tokensSpent: {
              [String(sepolia.id)]: {
                [Str.toLowerCase(refund.token)]: { unlocked: String(options.spent) },
              },
            },
          },
        }),
  };
};
