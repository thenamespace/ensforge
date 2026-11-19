import { Array as Arr, Effect } from "effect";

import { Abis, Deployments } from "@ensforge/contracts";
import { ChainError, type Chain, type Devnet, type L2Instance } from "@ensforge/test-devnet";
import {
  decodeFunctionData,
  encodeAbiParameters,
  getAddress,
  hexToNumber,
  hexToString,
  labelhash,
  namehash,
  parseAbi,
  slice,
  zeroHash,
  type Address,
} from "viem";

import type { Gateways } from "./gateways.ts";

const resolveAbi = parseAbi(["function resolve(bytes name, bytes data) view returns (bytes)"]);

/** An RPC request to an L2, failing with `ChainError`. */
const onL2 = <A>(method: string, run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: (cause) => ChainError.make({ method, cause }) });

/** ENSIP-11 reverse label of an EVM chain: `8000000a` for OP Mainnet. */
const reverseLabel = (chainId: number) => (0x8000_0000 + chainId).toString(16);

/**
 * L2 primary names on the namespace L2s that have ENS's `L2ReverseRegistrar` (Base, OP Mainnet,
 * Linea): `<coinType>.reverse` on the devnet is served from each registrar through one in-process
 * gateway, as mainnet's resolvers prove them, so they round-trip through Ethereum too. The
 * devnet's smart-contract wallet, Ownable, ERC-6492 wallet factory and validator are copied to the
 * same addresses on each L2, as multichain accounts and singletons are, for signed claims.
 *
 * Returns the name an address set on a chain's registrar.
 */
export const serveL2PrimaryNames = Effect.fnUntraced(function* (
  devnet: Devnet["Service"],
  chain: Chain["Service"],
  gateways: Gateways["Service"],
  l2s: readonly L2Instance[],
) {
  const registrar = Deployments.l2ReverseRegistrars[10];
  const byChain = new Map(Arr.map(l2s, (l2) => [reverseLabel(l2.chainId), l2] as const));

  for (const l2 of l2s) {
    for (const key of [
      "mock.smartContractWallet",
      "mock.ownable",
      "mock.erc6492WalletFactory",
      "canonical.universalSigValidator",
    ]) {
      const address = devnet.contract(key);
      const code = (yield* chain.code(address)) ?? "0x";
      const owner = yield* onL2("eth_getStorageAt", () =>
        devnet.client.getStorageAt({ address, slot: zeroHash }),
      );
      yield* onL2("anvil_setCode", () => l2.client.setCode({ address, bytecode: code }));
      yield* onL2("anvil_setStorageAt", () =>
        l2.client.setStorageAt({ address, index: zeroHash, value: owner ?? zeroHash }),
      );
    }
  }

  const nameOf = (chainId: number, address: Address) => {
    const l2 = byChain.get(reverseLabel(chainId));
    if (l2 === undefined) return Effect.die(`no L2 reverse registrar on chain ${chainId}`);
    return onL2("eth_call", () =>
      l2.client.readContract({
        address: registrar,
        abi: Abis.v1.l2ReverseRegistrar,
        functionName: "nameForAddr",
        args: [address],
      }),
    );
  };

  // The gateway answers `name(node)` for `<address>.<coinType>.reverse` from that chain's
  // registrar. The DNS-encoded name is `[40]<address hex>[n]<coin type hex>[7]reverse[0]`.
  const gateway = yield* gateways.serveLookups(({ data }) => {
    const [name] = decodeFunctionData({ abi: resolveAbi, data }).args;
    const address = getAddress(`0x${hexToString(slice(name, 1, 41))}`);
    const labelLength = hexToNumber(slice(name, 41, 42));
    const label = hexToString(slice(name, 42, 42 + labelLength));
    const l2 = byChain.get(label);
    if (l2 === undefined) return Effect.die(`no L2 for ${label}.reverse`);
    return nameOf(l2.chainId, address).pipe(
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
  for (const label of byChain.keys()) {
    yield* chain.write({
      account: devnet.accounts.owner,
      address: devnet.contract("v1.registry"),
      abi: Abis.v1.ensRegistry,
      functionName: "setSubnodeRecord",
      args: [namehash("reverse"), labelhash(label), devnet.accounts.owner, resolver, 0n],
    });
  }

  return nameOf;
});
