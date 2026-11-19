import { Array as Arr, Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { ChainError, gatewaySigner, type L2Instance } from "@ensforge/test-devnet";
import {
  bytesToString,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionResult,
  encodePacked,
  hexToBytes,
  keccak256,
  namehash,
  parseAbi,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";

import type { Lookup } from "./gateways.ts";

/** An RPC request to an L2, failing with `ChainError`. */
const onL2 = <A>(method: string, run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: (cause) => ChainError.make({ method, cause }) });

/** The name a DNS wire-format name (ENSIP-10's `resolve(name, data)`) stands for. */
export const dnsDecode = (name: Hex): string => {
  const bytes = hexToBytes(name);
  const labels: string[] = [];
  for (let offset = 0; bytes[offset] !== 0 && offset < bytes.length;) {
    const length = bytes[offset] ?? 0;
    labels.push(bytesToString(bytes.slice(offset + 1, offset + 1 + length)));
    offset += length + 1;
  }
  return Arr.join(labels, ".");
};

const resolveAbi = parseAbi(["function resolve(bytes name, bytes data) view returns (bytes)"]);
const durinAbi = parseAbi([
  "function stuffedResolveCall(bytes name, bytes data, uint64 targetChainId, address targetRegistryAddress) view returns (bytes, uint64, bytes)",
]);

/** The `resolve(name, data)` a lookup carries: the queried name and the resolver call. */
const resolveCall = (lookup: Lookup) => {
  const [name, data] = decodeFunctionData({ abi: resolveAbi, data: lookup.data }).args;
  return { name: dnsDecode(name), data };
};

/** `data` called on `resolver`, empty when the call reverts or there is no resolver. */
const callResolver = (l2: L2Instance, resolver: Address, data: Hex) =>
  resolver === zeroAddress
    ? Effect.succeed<Hex>("0x")
    : onL2("eth_call", () => l2.client.call({ to: resolver, data })).pipe(
        Effect.map((result) => result.data ?? "0x"),
      );

/**
 * A family gateway's answer, from L2 state: what the resolver the name's L2 registry records
 * returns (Basenames, Linea), what the registry-resolver returns (Celonames, Durin), or what
 * Namespace's shared resolver on the chain returns.
 */
export const l2Answers = {
  /** Basenames and Linea Names: the ENS-style registry's resolver for the name. */
  registry: (l2: L2Instance, registryKey: string) => (lookup: Lookup) =>
    Effect.gen(function* () {
      const { name, data } = resolveCall(lookup);
      const resolver = yield* onL2("eth_call", () =>
        l2.client.readContract({
          address: l2.contract(registryKey),
          abi: Abis.v1.ensRegistry,
          functionName: "resolver",
          args: [namehash(name)],
        }),
      );
      return yield* callResolver(l2, resolver, data);
    }),
  /** Celonames: the registry's own `resolve`, as its gateway calls it. */
  celonames: (l2: L2Instance) => (lookup: Lookup) =>
    onL2("eth_call", () =>
      l2.client.readContract({
        address: l2.contract("celonames.registry"),
        abi: resolveAbi,
        functionName: "resolve",
        args: decodeFunctionData({ abi: resolveAbi, data: lookup.data }).args,
      }),
    ),
  /** Durin: the registry the L1 resolver named, which is also the resolver. */
  durin: (l2: L2Instance) => (lookup: Lookup) => {
    const [, data, , registry] = decodeFunctionData({ abi: durinAbi, data: lookup.data }).args;
    return callResolver(l2, registry, data);
  },
  /** Namespace: the chain's NamePublicResolver, which every Namespace name on it uses. */
  namespace: (l2: L2Instance) => (lookup: Lookup) =>
    callResolver(l2, l2.contract("namespace.publicResolver"), resolveCall(lookup).data),
} as const;

/** One resolver call answered from Namespace's off-chain database: every name is `address`. */
const offchainRecord = (address: Address, data: Hex): Hex => {
  const call = decodeFunctionData({ abi: Abis.v1.publicResolver, data });
  switch (call.functionName) {
    case "multicall":
      return encodeFunctionResult({
        abi: Abis.v1.publicResolver,
        functionName: "multicall",
        result: Arr.map(call.args[0], (inner) => offchainRecord(address, inner)),
      });
    case "addr":
      return call.args.length === 1
        ? encodeFunctionResult({
            abi: Abis.shared.addrResolver,
            functionName: "addr",
            result: address,
          })
        : encodeFunctionResult({
            abi: Abis.shared.addressResolver,
            functionName: "addr",
            result: call.args[1] === 60n ? address : "0x",
          });
    case "text":
      return encodeFunctionResult({
        abi: Abis.shared.textResolver,
        functionName: "text",
        result: call.args[1] === "url" ? "https://ensforge.com/offchain" : "",
      });
    default:
      return "0x";
  }
};

/** Namespace's off-chain database (`configs` 9999): every name resolves to `address`. */
export const offchainAnswer = (address: Address) => (lookup: Lookup) =>
  Effect.sync(() => offchainRecord(address, resolveCall(lookup).data));

/**
 * Signs `result` as the families' gateways do (EIP-3668 off-chain resolver format): the resolver
 * checks `keccak(0x1900, sender, expires, keccak(request), keccak(result))` against its signer.
 */
export const signed = (lookup: Lookup, result: Hex, expires: bigint, signer = gatewaySigner) =>
  Effect.promise(() =>
    signer.sign({
      hash: keccak256(
        encodePacked(
          ["bytes2", "address", "uint64", "bytes32", "bytes32"],
          ["0x1900", lookup.sender, expires, keccak256(lookup.data), keccak256(result)],
        ),
      ),
    }),
  ).pipe(
    Effect.map((signature) =>
      encodeAbiParameters(
        [{ type: "bytes" }, { type: "uint64" }, { type: "bytes" }],
        [result, expires, signature],
      ),
    ),
  );
