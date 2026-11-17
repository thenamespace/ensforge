import { Deployments, Abis } from "@ensforge/contracts";
import {
  standaloneHcaFactoryV2Abi,
  standaloneSingleOwnerHcaV2Abi,
} from "@ensforge/contracts/v2/experimental/hca";
import { Ensforge, type Write } from "@ensforge/sdk";
import type { Client } from "@ensforge/sdk/extension";
import { scriptedTransport } from "@ensforge/test-harness";
import { contractScript, type ContractStub } from "@ensforge/test-harness/contracts-eth-call";
import {
  concat,
  createPublicClient,
  encodeAbiParameters,
  getAddress,
  getContractAddress,
  keccak256,
  multicall3Abi,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";

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

/** The chain as an HCA sees it: undeployed by default, or a verified, deployed account. */
export type World = {
  readonly deployed?: boolean;
  readonly sessionNonce?: bigint;
  readonly stubs?: readonly ContractStub[];
  readonly deployment?: Deployments.Profile;
  /** The latest block's timestamp. */
  readonly now?: bigint;
};

/** An Ensforge client of `owner` on Sepolia, whose chain answers from `world`. */
export const makeClient = (world: World = {}) => {
  const script = contractScript({
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
        functions: { proxyLogic: () => proxyLogic },
      },
      {
        address: hcaAddress,
        abi: standaloneSingleOwnerHcaV2Abi,
        functions: {
          ownerAndSessionNonce: () => [owner, world.sessionNonce ?? 0n],
          accountId: () => "ens-standalone-hca.1.1.0",
          getImplementation: () => contracts.standaloneImplementation,
        },
      },
      {
        address: contracts.standaloneFactory,
        abi: standaloneHcaFactoryV2Abi,
        functions: { authorizedOwnerOf: () => owner, owner: () => owner },
      },
    ],
  });
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: scriptedTransport(script).transport,
  });
  const client = Ensforge.create({
    publicClient,
    account: owner,
    batch: { multicall: false },
    ...(world.deployment === undefined ? {} : { deployment: world.deployment }),
    simulate: false,
  }) as unknown as Client;
  const context: Write.Via.Context = {
    client,
    chainId: sepolia.id,
    account: owner,
    publicClient,
    walletClient: undefined,
  };
  return { client, context };
};
