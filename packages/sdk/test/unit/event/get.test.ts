import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Abis, Deployments } from "@ensforge/contracts";
import { Actions, Ensforge } from "@ensforge/sdk";
import { Actions as EffectActions } from "@ensforge/sdk/effect";
import {
  expectFailure,
  expectRejection,
  noRpc,
  scriptedTransport,
  type Script,
} from "@ensforge/test-harness";
import {
  createPublicClient,
  decodeFunctionData,
  encodeFunctionResult,
  isAddressEqual,
  multicall3Abi,
  numberToHex,
  zeroAddress,
  type Abi,
  type Address,
  type Hex,
  type Log,
} from "viem";
import { mainnet } from "viem/chains";
import { labelhash, namehash } from "viem/ens";

import { eventBySignature, logOf } from "./logs.js";

const v1 = Deployments.mainnet.v1.contracts;
const v2 = Deployments.mainnet.v2.contracts;
const owner: Address = "0x225f137127d9067788314bc7fcc1f36746a3c3B5";
const node = namehash("alice.eth");
const label = labelhash("alice");
const now = 1_800_000_000n;

/** View functions answered per contract, for an unwrapped ENSv1 `alice.eth` with no ENSv2 entry. */
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
    address: v2.universalHelper,
    abi: Abis.v2.universalHelper,
    answers: { findParentRegistry: zeroAddress },
  },
  { address: v2.ethRegistrar, abi: Abis.v2.ethRegistrar, answers: { GRACE_PERIOD: 7_776_000n } },
];

const answerCall = (to: Address, data: Hex): Hex => {
  const contract = contracts.find((candidate) => isAddressEqual(candidate.address, to));
  if (contract === undefined) throw new Error(`Unscripted contract ${to}`);
  const { functionName } = decodeFunctionData({ abi: contract.abi, data });
  if (!(functionName in contract.answers)) throw new Error(`Unscripted ${functionName} on ${to}`);
  return encodeFunctionResult({
    abi: contract.abi,
    functionName,
    result: contract.answers[functionName],
  } as never);
};

type Filter = {
  readonly address: readonly Address[];
  readonly topics: readonly (Hex | readonly Hex[] | null)[];
};

/** `eth_getLogs` matching as a node does it: address one-of, each topic position one-of. */
const matches = (log: Log, filter: Filter): boolean =>
  filter.address.some((address) => isAddressEqual(address, log.address)) &&
  filter.topics.every((topic, index) => {
    const actual = log.topics[index];
    if (topic === null) return true;
    if (actual === undefined) return false;
    return (typeof topic === "string" ? [topic] : topic).includes(actual);
  });

const rpcLog = (log: Log) => ({
  ...log,
  blockNumber: numberToHex(log.blockNumber ?? 0n),
  logIndex: numberToHex(log.logIndex ?? 0),
  transactionIndex: numberToHex(log.transactionIndex ?? 0),
});

const chain = (logs: readonly Log[], head = 100n) => {
  const script: Script = ({ method, params }) => {
    if (method === "eth_blockNumber") return numberToHex(head);
    if (method === "eth_call") {
      const { to, data } = params[0] as { to: Address; data: Hex };
      return answerCall(to, data);
    }
    if (method === "eth_getLogs") {
      return logs.filter((log) => matches(log, params[0] as Filter)).map(rpcLog);
    }
    return undefined;
  };
  const { transport, calls } = scriptedTransport(script);
  const publicClient = createPublicClient({ chain: mainnet, transport });
  // Without multicall every read is its own `eth_call`, answered by `answerCall`.
  return { ens: Ensforge.create({ publicClient, batch: { multicall: false } }), calls };
};

const newOwner = eventBySignature("NewOwner(bytes32,bytes32,address)");
const newResolver = eventBySignature("NewResolver(bytes32,address)");
const registered = eventBySignature("NameRegistered(uint256,address,uint256)");
const textChanged = eventBySignature("TextChanged(bytes32,string,string,string)");

const history = [
  logOf(
    registered,
    { id: BigInt(label), owner, expires: now },
    { address: v1.baseRegistrar, blockNumber: 20n, logIndex: 1 },
  ),
  logOf(
    newOwner,
    { node: namehash("eth"), label, owner },
    { address: v1.registry, blockNumber: 20n, logIndex: 0 },
  ),
  logOf(
    newResolver,
    { node, resolver: v1.publicResolver },
    { address: v1.registry, blockNumber: 21n },
  ),
  logOf(
    textChanged,
    { node, indexedKey: "url", key: "url", value: "https://alice.dev" },
    { address: v1.publicResolver, blockNumber: 30n },
  ),
  // Another name's events, which the filters must leave out.
  logOf(
    newResolver,
    { node: namehash("bob.eth"), resolver: v1.publicResolver },
    { address: v1.registry, blockNumber: 25n },
  ),
  logOf(
    textChanged,
    { node: namehash("bob.eth"), indexedKey: "url", key: "url", value: "https://bob.dev" },
    { address: v1.publicResolver, blockNumber: 26n },
  ),
];

describe("event.get", () => {
  it("returns a v1 name's events across contracts, in chain order", async () => {
    const { ens } = chain(history);
    const events = await Actions.event.get(ens, { name: "Alice.eth", fromBlock: 0n });

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
  });

  it("filters by type", async () => {
    const { ens } = chain(history);
    const events = await Actions.event.get(ens, {
      name: "alice.eth",
      fromBlock: 0n,
      toBlock: 50n,
      types: ["record", "resolver"],
    });
    assert.deepStrictEqual(
      events.map((event) => event.event),
      ["NewResolver", "TextChanged"],
    );
  });

  it("scans only the requested range, without reading the head", async () => {
    const { ens, calls } = chain(history);
    await Actions.event.get(ens, { name: "alice.eth", fromBlock: 21n, toBlock: 29n });

    const filters = calls.filter((call) => call.method === "eth_getLogs");
    assert.isAbove(filters.length, 0);
    for (const call of filters) {
      const [filter] = call.params as [{ fromBlock: Hex; toBlock: Hex }];
      assert.strictEqual(filter.fromBlock, numberToHex(21n));
      assert.strictEqual(filter.toBlock, numberToHex(29n));
    }
    assert.isFalse(calls.some((call) => call.method === "eth_blockNumber"));
  });

  it("matches the Effect action", async () => {
    const { ens } = chain(history);
    const effect = await Effect.runPromise(
      EffectActions.event.get(ens, { name: "alice.eth", fromBlock: 0n, types: ["authority"] }),
    );
    assert.deepStrictEqual(
      effect.map((event) => event.event),
      ["NewOwner"],
    );
  });
});

describe("event.get validation", () => {
  it.effect("rejects fromBlock after toBlock before any RPC", () =>
    Effect.gen(function* () {
      const { transport, calls } = scriptedTransport(noRpc);
      const ens = Ensforge.create({
        publicClient: createPublicClient({ chain: mainnet, transport }),
      });
      const error = yield* expectFailure(
        EffectActions.event.get(ens, { name: "alice.eth", fromBlock: 10n, toBlock: 9n }),
        { _tag: "InvalidInputError", code: "INVALID_RECORD_VALUE" },
      );
      assert.strictEqual(error.context.operation, "event.get");
      assert.strictEqual(calls.length, 0);
    }),
  );

  it.effect("compares fromBlock with the head for toBlock latest", () =>
    Effect.gen(function* () {
      const { ens, calls } = chain([], 5n);
      yield* expectRejection(() => Actions.event.get(ens, { name: "alice.eth", fromBlock: 6n }), {
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
      const { transport, calls } = scriptedTransport(noRpc);
      const ens = Ensforge.create({
        publicClient: createPublicClient({ chain: mainnet, transport }),
      });
      yield* expectRejection(
        () => Actions.event.get(ens, { name: "a..eth", fromBlock: 0n, toBlock: 1n }),
        { _tag: "InvalidInputError", code: "INVALID_NAME" },
      );
      assert.strictEqual(calls.length, 0);
    }),
  );
});
