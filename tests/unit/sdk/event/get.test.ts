import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Abis, Deployments } from "@ensforge/contracts";
import { Ensforge } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { expectFailure, scriptedTransport } from "@ensforge/test-harness";
import {
  createPublicClient,
  decodeFunctionData,
  encodeFunctionResult,
  isAddressEqual,
  multicall3Abi,
  numberToHex,
  zeroAddress,
  zeroHash,
  type Abi,
  type Address,
  type Hex,
  type Log,
} from "viem";
import { mainnet } from "viem/chains";
import { labelhash, namehash } from "viem/ens";

import { eventBySignature, logOf, rpcLog } from "./logs.js";

const v1 = Deployments.mainnet.v1.contracts;
const owner: Address = "0x225f137127d9067788314bc7fcc1f36746a3c3B5";
const now = 1_800_000_000n;

/**
 * An ensforge client over a node holding `logs`, with an unwrapped ENSv1 `alice.eth` and no ENSv2
 * entry, and its head at block `head`.
 */
const ensOver = (logs: readonly Log[], head = 100n) => {
  const contracts: readonly {
    readonly address: Address;
    readonly abi: Abi;
    readonly answers: Readonly<Record<string, unknown>>;
  }[] = [
    {
      address: mainnet.contracts.multicall3.address,
      abi: multicall3Abi,
      answers: { getCurrentBlockTimestamp: now },
    },
    {
      address: v1.registry,
      abi: Abis.v1.ensRegistry,
      answers: { owner, resolver: v1.publicResolver, ttl: 0n },
    },
    {
      address: v1.nameWrapper,
      abi: Abis.v1.nameWrapper,
      answers: { getData: [zeroAddress, 0, 0n] },
    },
    {
      address: v1.baseRegistrar,
      abi: Abis.v1.baseRegistrar,
      answers: { ownerOf: owner, nameExpires: now + 10_000_000n, GRACE_PERIOD: 7_776_000n },
    },
    {
      address: Deployments.mainnet.v2.contracts.universalHelper,
      abi: Abis.v2.universalHelper,
      answers: { findParentRegistry: zeroAddress },
    },
    {
      address: Deployments.mainnet.v2.implementations.universalResolver,
      abi: Abis.v2.universalResolver,
      answers: { findResolver: [zeroAddress, zeroHash, 0n] },
    },
    {
      address: Deployments.mainnet.v2.contracts.ethRegistrar,
      abi: Abis.v2.ethRegistrar,
      answers: { GRACE_PERIOD: 7_776_000n },
    },
  ];

  const { transport, calls } = scriptedTransport(({ method, params }) => {
    if (method === "eth_blockNumber") return numberToHex(head);

    if (method === "eth_call") {
      const { to, data } = params[0] as { to: Address; data: Hex };
      const contract = contracts.find((candidate) => isAddressEqual(candidate.address, to));
      if (contract === undefined) throw new Error(`Unscripted contract ${to}`);
      const { functionName } = decodeFunctionData({ abi: contract.abi, data });
      if (!(functionName in contract.answers))
        throw new Error(`Unscripted ${functionName} on ${to}`);
      return encodeFunctionResult({
        abi: contract.abi,
        functionName,
        result: contract.answers[functionName],
      } as never);
    }

    if (method === "eth_getLogs") {
      // Matches as a node does: the address is one of the filter's, and each topic position too.
      const filter = params[0] as {
        readonly address: readonly Address[];
        readonly topics: readonly (Hex | readonly Hex[] | null)[];
      };
      return logs
        .filter(
          (log) =>
            filter.address.some((address) => isAddressEqual(address, log.address)) &&
            filter.topics.every((topic, index) => {
              const actual = log.topics[index];
              if (topic === null) return true;
              if (actual === undefined) return false;
              return (typeof topic === "string" ? [topic] : topic).includes(actual);
            }),
        )
        .map(rpcLog);
    }
    return undefined;
  });

  // Without multicall every read is its own `eth_call`, answered from `contracts`.
  const ens = Ensforge.create({
    publicClient: createPublicClient({ chain: mainnet, transport }),
    batch: { multicall: false },
  });
  return { ens, calls };
};

const history = [
  logOf(
    eventBySignature("NameRegistered(uint256,address,uint256)"),
    { id: BigInt(labelhash("alice")), owner, expires: now },
    { address: v1.baseRegistrar, blockNumber: 20n, logIndex: 1 },
  ),
  logOf(
    eventBySignature("NewOwner(bytes32,bytes32,address)"),
    { node: namehash("eth"), label: labelhash("alice"), owner },
    { address: v1.registry, blockNumber: 20n, logIndex: 0 },
  ),
  logOf(
    eventBySignature("NewResolver(bytes32,address)"),
    { node: namehash("alice.eth"), resolver: v1.publicResolver },
    { address: v1.registry, blockNumber: 21n },
  ),
  logOf(
    eventBySignature("TextChanged(bytes32,string,string,string)"),
    { node: namehash("alice.eth"), indexedKey: "url", key: "url", value: "https://alice.dev" },
    { address: v1.publicResolver, blockNumber: 30n },
  ),
  // Another name's events, which the filters must leave out.
  logOf(
    eventBySignature("NewResolver(bytes32,address)"),
    { node: namehash("bob.eth"), resolver: v1.publicResolver },
    { address: v1.registry, blockNumber: 25n },
  ),
  logOf(
    eventBySignature("TextChanged(bytes32,string,string,string)"),
    { node: namehash("bob.eth"), indexedKey: "url", key: "url", value: "https://bob.dev" },
    { address: v1.publicResolver, blockNumber: 26n },
  ),
];

describe("event.get", () => {
  it.effect("returns a v1 name's events across contracts, in chain order", () =>
    Effect.gen(function* () {
      const { ens } = ensOver(history);

      const events = yield* Actions.event.get(ens, { name: "Alice.eth", fromBlock: 0n });

      assert.deepStrictEqual(
        events.map((event) => [event.event, event.type, event.blockNumber, event.logIndex]),
        [
          ["NewOwner", "authority", 20n, 0],
          ["NameRegistered", "registration", 20n, 1],
          ["NewResolver", "resolver", 21n, 0],
          ["TextChanged", "record", 30n, 0],
        ],
      );
      for (const event of events) {
        assert.strictEqual(event.name, "alice.eth");
        assert.strictEqual(event.protocol, "v1");
      }
      assert.strictEqual(events[3]?.args["value"], "https://alice.dev");
    }),
  );

  it.effect("filters by type", () =>
    Effect.gen(function* () {
      const { ens } = ensOver(history);

      const records = yield* Actions.event.get(ens, {
        name: "alice.eth",
        fromBlock: 0n,
        toBlock: 50n,
        types: ["record", "resolver"],
      });
      const authority = yield* Actions.event.get(ens, {
        name: "alice.eth",
        fromBlock: 0n,
        types: ["authority"],
      });

      assert.deepStrictEqual(
        records.map((event) => event.event),
        ["NewResolver", "TextChanged"],
      );
      assert.deepStrictEqual(
        authority.map((event) => event.event),
        ["NewOwner"],
      );
    }),
  );

  it.effect("scans only the requested range, without reading the head", () =>
    Effect.gen(function* () {
      const { ens, calls } = ensOver(history);

      yield* Actions.event.get(ens, { name: "alice.eth", fromBlock: 21n, toBlock: 29n });

      const filters = calls.filter((call) => call.method === "eth_getLogs");
      assert.isAbove(filters.length, 0);
      for (const call of filters) {
        const [filter] = call.params as [{ fromBlock: Hex; toBlock: Hex }];
        assert.strictEqual(filter.fromBlock, numberToHex(21n));
        assert.strictEqual(filter.toBlock, numberToHex(29n));
      }
      assert.isFalse(calls.some((call) => call.method === "eth_blockNumber"));
    }),
  );
});

describe("event.get validation", () => {
  it.effect("rejects fromBlock after toBlock before any RPC", () =>
    Effect.gen(function* () {
      const { ens, calls } = ensOver([]);

      const error = yield* expectFailure(
        Actions.event.get(ens, { name: "alice.eth", fromBlock: 10n, toBlock: 9n }),
        { _tag: "InvalidInputError", code: "INVALID_RECORD_VALUE" },
      );

      assert.strictEqual(error.context.operation, "event.get");
      assert.lengthOf(calls, 0);
    }),
  );

  it.effect("compares fromBlock with the head for toBlock latest", () =>
    Effect.gen(function* () {
      const { ens, calls } = ensOver([], 5n);

      yield* expectFailure(Actions.event.get(ens, { name: "alice.eth", fromBlock: 6n }), {
        _tag: "InvalidInputError",
        code: "INVALID_RECORD_VALUE",
      });

      assert.deepStrictEqual(
        calls.map((call) => call.method),
        ["eth_blockNumber"],
      );
    }),
  );

  it.effect("rejects an invalid name before reading the chain", () =>
    Effect.gen(function* () {
      const { ens, calls } = ensOver([]);

      yield* expectFailure(Actions.event.get(ens, { name: "a..eth", fromBlock: 0n, toBlock: 1n }), {
        _tag: "InvalidInputError",
        code: "INVALID_NAME",
      });

      assert.lengthOf(calls, 0);
    }),
  );
});
