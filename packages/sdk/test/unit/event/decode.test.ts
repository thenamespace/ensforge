import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Deployments } from "@ensforge/contracts";
import { Actions, Ensforge } from "@ensforge/sdk";
import { Actions as EffectActions } from "@ensforge/sdk/effect";
import { noRpc, scriptedTransport } from "@ensforge/test-harness";
import {
  createPublicClient,
  encodeAbiParameters,
  keccak256,
  pad,
  toHex,
  type Address,
  type Hex,
  type Log,
} from "viem";
import { mainnet } from "viem/chains";
import { labelhash, namehash } from "viem/ens";

import { dnsWire, eventBySignature, events, logOf, sampleArgs, signatureOf } from "./logs.js";

const v1 = Deployments.mainnet.v1.contracts;
const v2 = Deployments.mainnet.v2;
const stranger: Address = "0x00000000000000000000000000000000000000aa";

const { transport, calls } = scriptedTransport(noRpc);
const ens = Ensforge.create({ publicClient: createPublicClient({ chain: mainnet, transport }) });

const decode = (logs: readonly Log[]) => Actions.event.decode(ens, { logs });

/** The reported category of each event signature, per the `event.get` documentation. */
const expected: Readonly<Record<string, readonly [type: string, action: string, v2Only: boolean]>> =
  {
    "NewOwner(bytes32,bytes32,address)": ["authority", "authority_changed", false],
    "Transfer(bytes32,address)": ["authority", "authority_changed", false],
    "NewResolver(bytes32,address)": ["resolver", "resolver_changed", false],
    "ApprovalForAll(address,address,bool)": ["permission", "operator_approval_changed", false],
    "NameRegistered(uint256,address,uint256)": ["registration", "registration_granted", false],
    "NameRenewed(uint256,uint256)": ["renewal", "registration_renewed", false],
    "Transfer(address,address,uint256)": ["transfer", "token_transferred", false],
    "NameMigrated(uint256,address,uint256)": ["migration", "migration_applied", false],
    "NameRegistered(string,bytes32,address,uint256,uint256,uint256,bytes32)": [
      "registration",
      "registration_granted",
      false,
    ],
    "NameRenewed(string,bytes32,uint256,uint256,bytes32)": [
      "renewal",
      "registration_renewed",
      false,
    ],
    "NameRegistered(string,bytes32,address,uint256,uint256,uint256)": [
      "registration",
      "registration_granted",
      false,
    ],
    "NameRenewed(string,bytes32,uint256,uint256)": ["renewal", "registration_renewed", false],
    "NameWrapped(bytes32,bytes,address,uint32,uint64)": ["token", "name_wrapped", false],
    "NameUnwrapped(bytes32,address)": ["token", "name_unwrapped", false],
    "FusesSet(bytes32,uint32)": ["permission", "permission_changed", false],
    "ExpiryExtended(bytes32,uint64)": ["expiry", "expiry_changed", false],
    "TransferSingle(address,address,address,uint256,uint256)": [
      "transfer",
      "token_transferred",
      false,
    ],
    "TransferBatch(address,address,address,uint256[],uint256[])": [
      "transfer",
      "token_transferred",
      false,
    ],
    "AddrChanged(bytes32,address)": ["record", "record_changed", false],
    "AddressChanged(bytes32,uint256,bytes)": ["record", "record_changed", false],
    "TextChanged(bytes32,string,string,string)": ["record", "record_changed", false],
    "ContenthashChanged(bytes32,bytes)": ["record", "record_changed", false],
    "ContentChanged(bytes32,bytes32)": ["record", "record_changed", false],
    "ABIChanged(bytes32,uint256)": ["record", "record_changed", false],
    "InterfaceChanged(bytes32,bytes4,address)": ["record", "record_changed", false],
    "NameChanged(bytes32,string)": ["record", "record_changed", false],
    "PubkeyChanged(bytes32,bytes32,bytes32)": ["record", "record_changed", false],
    "DataChanged(bytes32,string,string,bytes)": ["record", "record_changed", false],
    "VersionChanged(bytes32,uint64)": ["record", "record_version_changed", false],
    "Approved(address,bytes32,address,bool)": ["permission", "permission_changed", false],
    "ReverseClaimed(address,bytes32)": ["primary_name", "reverse_claimed", false],
    "NameForAddrChanged(address,string)": ["primary_name", "primary_name_recorded", false],
    "Claim(bytes32,address,bytes,uint32)": ["registration", "registration_granted", false],
    "LabelRegistered(uint256,bytes32,string,address,uint64,address)": [
      "registration",
      "registration_granted",
      true,
    ],
    "LabelReserved(uint256,bytes32,string,uint64,address)": [
      "reservation",
      "registration_reserved",
      true,
    ],
    "LabelUnregistered(uint256,address)": ["release", "registration_released", true],
    "ExpiryUpdated(uint256,uint64,address)": ["expiry", "expiry_changed", true],
    "SubregistryUpdated(uint256,address,address)": ["subregistry", "subregistry_changed", true],
    "ResolverUpdated(uint256,address,address)": ["resolver", "resolver_changed", true],
    "TokenRegenerated(uint256,uint256)": ["token", "token_regenerated", true],
    "ParentUpdated(address,string,address)": ["contract", "registry_parent_changed", true],
    "RegistryCreated()": ["contract", "registry_created", true],
    "EACRolesChanged(uint256,address,uint256,uint256)": ["permission", "permission_changed", true],
    "Upgraded(address)": ["contract", "contract_upgraded", true],
    "NameRegistered(uint256,string,address,address,address,uint64,address,bytes32,uint256,uint256)":
      ["registration", "registration_granted", false],
    "NameRenewed(uint256,string,uint64,uint64,address,bytes32,uint256)": [
      "renewal",
      "registration_renewed",
      false,
    ],
    "AddressUpdated(uint256,uint256,bytes)": ["record", "record_changed", true],
    "TextUpdated(uint256,string,string,string)": ["record", "record_changed", true],
    "ContenthashUpdated(uint256,bytes)": ["record", "record_changed", true],
    "ABIUpdated(uint256,uint256)": ["record", "record_changed", true],
    "InterfaceUpdated(uint256,bytes4,address)": ["record", "record_changed", true],
    "NameUpdated(uint256,string)": ["record", "record_changed", true],
    "DataUpdated(uint256,string,string,bytes)": ["record", "record_changed", true],
    "Linked(uint256,bytes32,bytes)": ["record", "resolver_record_linked", true],
    "Cleared(uint256)": ["record", "record_version_changed", true],
  };

/** ABI events ensforge decodes but does not report. */
const unreported = new Set(["TokenResource(uint256,uint256)"]);

describe("event.decode categories", () => {
  it("covers every event of the contracts ABI", () => {
    const signatures = events.map(signatureOf);
    assert.deepStrictEqual(
      signatures.filter((signature) => !(signature in expected) && !unreported.has(signature)),
      [],
    );
    assert.deepStrictEqual(
      Object.keys(expected).filter((signature) => !signatures.includes(signature)),
      [],
    );
  });

  it.each(Object.entries(expected))("decodes %s", async (signature, [type, action, v2Only]) => {
    const event = eventBySignature(signature);
    const args = sampleArgs(event);
    const [decoded, ...rest] = await decode([
      logOf(event, args, { address: stranger, blockNumber: 42n, logIndex: 3 }),
    ]);

    assert.strictEqual(rest.length, 0);
    assert.isDefined(decoded);
    assert.strictEqual(decoded?.type, type);
    assert.strictEqual(decoded?.action, action);
    assert.strictEqual(decoded?.event, event.name);
    assert.strictEqual(decoded?.contract, stranger);
    assert.strictEqual(decoded?.protocol, v2Only ? "v2" : null);
    assert.strictEqual(decoded?.blockNumber, 42n);
    assert.strictEqual(decoded?.logIndex, 3);
    assert.strictEqual(decoded?.node, "node" in args ? args["node"] : null);
  });

  it.each([...unreported])("skips %s, which has no category", async (signature) => {
    const event = eventBySignature(signature);
    assert.deepStrictEqual(
      await decode([logOf(event, sampleArgs(event), { address: stranger })]),
      [],
    );
  });

  it("makes no RPC request", () => {
    assert.strictEqual(calls.length, 0);
  });
});

describe("event.decode protocol", () => {
  const newOwner = eventBySignature("NewOwner(bytes32,bytes32,address)");
  const labelRegistered = eventBySignature(
    "LabelRegistered(uint256,bytes32,string,address,uint64,address)",
  );

  it.each([
    ["the ENSv1 registry", v1.registry, newOwner, "v1"],
    [
      "a frozen ENSv1 public resolver",
      Deployments.mainnet.v1.frozenPublicResolvers[0],
      newOwner,
      "v1",
    ],
    ["the ENSv2 .eth registry", v2.contracts.ethRegistry, newOwner, "v2"],
    ["an ENSv2 migration contract", v2.migration.graveyard, newOwner, "v2"],
    ["an unknown contract (shared event)", stranger, newOwner, null],
    ["an unknown contract (ENSv2-only event)", stranger, labelRegistered, "v2"],
  ] as const)("is decided by %s", async (_, address, event, protocol) => {
    const [decoded] = await decode([
      logOf(event, sampleArgs(event), { address: address as Address }),
    ]);
    assert.strictEqual(decoded?.protocol, protocol);
  });

  it("matches emitters case-insensitively", async () => {
    const [decoded] = await decode([
      logOf(newOwner, sampleArgs(newOwner), { address: v1.registry.toLowerCase() as Address }),
    ]);
    assert.strictEqual(decoded?.protocol, "v1");
  });
});

describe("event.decode names", () => {
  const labelRegistered = eventBySignature(
    "LabelRegistered(uint256,bytes32,string,address,uint64,address)",
  );
  const labelReserved = eventBySignature("LabelReserved(uint256,bytes32,string,uint64,address)");
  const withLabel = (event: typeof labelRegistered, label: string) => ({
    ...sampleArgs(event),
    label,
    labelHash: labelhash(label),
  });

  it.each([
    ["the .eth registry", v2.contracts.ethRegistry, "alice.eth"],
    ["the root registry", v2.contracts.rootRegistry, "alice"],
    ["another registry", stranger, null],
  ] as const)("LabelRegistered on %s names %j", async (_, address, name) => {
    const [registered, reserved] = await decode([
      logOf(labelRegistered, withLabel(labelRegistered, "alice"), { address, logIndex: 0 }),
      logOf(labelReserved, withLabel(labelReserved, "alice"), { address, logIndex: 1 }),
    ]);
    assert.strictEqual(registered?.name, name);
    assert.strictEqual(reserved?.name, name);
  });

  it.each([
    "NameRegistered(string,bytes32,address,uint256,uint256,uint256,bytes32)",
    "NameRenewed(string,bytes32,uint256,uint256,bytes32)",
    "NameRegistered(uint256,string,address,address,address,uint64,address,bytes32,uint256,uint256)",
    "NameRenewed(uint256,string,uint64,uint64,address,bytes32,uint256)",
  ])("%s spells the .eth label", async (signature) => {
    const event = eventBySignature(signature);
    const [decoded] = await decode([
      logOf(event, { ...sampleArgs(event), label: "bob" }, { address: stranger }),
    ]);
    assert.strictEqual(decoded?.name, "bob.eth");
  });

  it.each([
    "NameRegistered(string,bytes32,address,uint256,uint256,uint256)",
    "NameRenewed(string,bytes32,uint256,uint256)",
  ])("legacy %s spells the .eth name", async (signature) => {
    const event = eventBySignature(signature);
    const [decoded] = await decode([
      logOf(event, { ...sampleArgs(event), name: "carol" }, { address: v1.ethRegistrarController }),
    ]);
    assert.strictEqual(decoded?.name, "carol.eth");
  });

  it("base registrar registrations carry no name", async () => {
    const event = eventBySignature("NameRegistered(uint256,address,uint256)");
    const [decoded] = await decode([
      logOf(event, sampleArgs(event), { address: v1.baseRegistrar }),
    ]);
    assert.strictEqual(decoded?.name, null);
  });

  it.each([
    ["NameWrapped(bytes32,bytes,address,uint32,uint64)", "name"],
    ["Linked(uint256,bytes32,bytes)", "name"],
    ["Claim(bytes32,address,bytes,uint32)", "dnsname"],
  ] as const)("%s decodes its DNS-encoded name", async (signature, field) => {
    const event = eventBySignature(signature);
    const [valid, malformed] = await decode([
      logOf(
        event,
        { ...sampleArgs(event), [field]: dnsWire("pay.alice.eth") },
        { address: stranger },
      ),
      logOf(
        event,
        { ...sampleArgs(event), [field]: "0x05616263" },
        { address: stranger, logIndex: 1 },
      ),
    ]);
    assert.strictEqual(valid?.name, "pay.alice.eth");
    assert.strictEqual(malformed?.name, null);
  });

  it("node-keyed events report their node", async () => {
    const event = eventBySignature("AddrChanged(bytes32,address)");
    const node = namehash("alice.eth");
    const [decoded] = await decode([logOf(event, { node, a: stranger }, { address: stranger })]);
    assert.strictEqual(decoded?.node, node);
    assert.strictEqual(decoded?.name, null);
  });
});

describe("event.decode migrations and transfers", () => {
  const graveyard = v2.migration.graveyard;

  it.each([
    ["Transfer(bytes32,address)", { owner: graveyard }],
    ["Transfer(address,address,uint256)", { to: graveyard }],
    ["TransferSingle(address,address,address,uint256,uint256)", { to: graveyard }],
    ["NameWrapped(bytes32,bytes,address,uint32,uint64)", { owner: graveyard }],
  ] as const)("%s to the Graveyard is a migration", async (signature, override) => {
    const event = eventBySignature(signature);
    const [decoded] = await decode([
      logOf(event, { ...sampleArgs(event), ...override }, { address: stranger }),
    ]);
    assert.strictEqual(decoded?.type, "migration");
    assert.strictEqual(decoded?.action, "migration_applied");
  });

  it.each([
    [v2.migration.unlockedMigrationController, "migration"],
    [v2.migration.lockedMigrationController, "migration"],
    [stranger, "registration"],
  ] as const)("LabelRegistered sent by %s is a %s", async (sender, type) => {
    const event = eventBySignature(
      "LabelRegistered(uint256,bytes32,string,address,uint64,address)",
    );
    const [decoded] = await decode([
      logOf(event, { ...sampleArgs(event), sender }, { address: v2.contracts.ethRegistry }),
    ]);
    assert.strictEqual(decoded?.type, type);
  });
});

describe("event.decode skipping", () => {
  const addrChanged = eventBySignature("AddrChanged(bytes32,address)");
  const valid = () => logOf(addrChanged, sampleArgs(addrChanged), { address: stranger });

  it("skips logs that are not ENS events", async () => {
    assert.deepStrictEqual(
      await decode([{ ...valid(), topics: [keccak256(toHex("Unknown(uint256)"))] }]),
      [],
    );
  });

  it("skips ERC-20 transfers that share the ERC-721 topic", async () => {
    const erc721 = eventBySignature("Transfer(address,address,uint256)");
    const [topic0, from, to] = logOf(erc721, sampleArgs(erc721), { address: stranger }).topics;
    const erc20: Log = {
      ...valid(),
      topics: [topic0 as Hex, from as Hex, to as Hex],
      data: encodeAbiParameters([{ type: "uint256" }], [5n]),
    };
    assert.deepStrictEqual(await decode([erc20]), []);
  });

  it("skips logs with malformed data", async () => {
    const event = eventBySignature("TextChanged(bytes32,string,string,string)");
    const log = logOf(event, sampleArgs(event), { address: stranger });
    assert.deepStrictEqual(await decode([{ ...log, data: "0x1234" }]), []);
  });

  it("skips pending logs", async () => {
    assert.deepStrictEqual(await decode([{ ...valid(), blockNumber: null } as unknown as Log]), []);
  });

  it("keeps log order and decodes receipts", async () => {
    const node = pad("0x01", { size: 32 });
    const logs = [0, 1, 2].map((logIndex) =>
      logOf(addrChanged, { node, a: stranger }, { address: stranger, logIndex }),
    );
    const decoded = await Actions.event.decode(ens, {
      logs: [logs[0] as Log],
      receipts: [{ logs: logs.slice(1) } as never],
    });
    assert.deepStrictEqual(
      decoded.map((event) => event.logIndex),
      [0, 1, 2],
    );
  });

  it("returns nothing without logs", async () => {
    assert.deepStrictEqual(await Actions.event.decode(ens, {}), []);
  });
});

describe("event.decode in Effect", () => {
  it.effect("matches the Promise action", () =>
    Effect.gen(function* () {
      const event = eventBySignature("NewResolver(bytes32,address)");
      const logs = [logOf(event, sampleArgs(event), { address: v1.registry })];
      const decoded = yield* EffectActions.event.decode(ens, { logs });
      assert.deepStrictEqual(decoded, yield* Effect.promise(() => decode(logs)));
      assert.strictEqual(decoded[0]?.protocol, "v1");
    }),
  );
});
