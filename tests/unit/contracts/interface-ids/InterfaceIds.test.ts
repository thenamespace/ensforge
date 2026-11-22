import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Record as Rec, String as Str } from "effect";

import { Abis, InterfaceIds } from "@ensforge/contracts";
import {
  standaloneHcaFactoryV2InterfaceAbi,
  standaloneHcaOwnerV2InterfaceAbi,
} from "@ensforge/contracts/internal/v2/experimental/hca/index";
import { parseAbi, toFunctionSelector, type Abi, type AbiFunction } from "viem";

const selectors = (abi: Abi): readonly string[] =>
  Arr.map(
    Arr.filter(abi, (entry): entry is AbiFunction => entry.type === "function"),
    toFunctionSelector,
  );

// Solidity's `type(I).interfaceId` XORs only the functions `I` declares; inherited ones are
// subtracted by listing the parents from the contracts' `interface I is …` declarations.
const interfaceId = (abi: Abi, parents: readonly Abi[] = []): string => {
  const inherited = new Set(Arr.flatMap(parents, selectors));
  const id = Arr.reduce(
    Arr.filter(selectors(abi), (selector) => !inherited.has(selector)),
    0,
    (xor, selector) => xor ^ Number.parseInt(Str.slice(2)(selector), 16),
  );
  return `0x${Str.padStart(8, "0")((id >>> 0).toString(16))}`;
};

const v2 = Abis.v2.interfaces;

describe("InterfaceIds.registry", () => {
  it.each([
    ["registry", v2.registry, []],
    ["ownedRegistry", v2.ownedRegistry, [v2.registry]],
    ["temporalRegistry", v2.temporalRegistry, [v2.registry]],
    ["tokenizedRegistry", v2.tokenizedRegistry, [v2.ownedRegistry, v2.erc1155Singleton]],
    ["standardRegistry", v2.standardRegistry, [v2.temporalRegistry, v2.tokenizedRegistry]],
    [
      "permissionedRegistry",
      v2.permissionedRegistry,
      [
        v2.standardRegistry,
        v2.enhancedAccessControl,
        v2.contractNamer,
        // IUnsafeTransferable has no ABI of its own in the package (contracts-v2 v1.0.1).
        parseAbi([
          "function unsafeTransfer(address to, uint256 tokenId, bytes data)",
          "function unsafeBatchTransfer(address to, uint256[] tokenIds, bytes data)",
        ]),
      ],
    ],
    ["wrapperRegistry", v2.wrapperRegistry, [v2.permissionedRegistry]],
  ] as const)("%s matches its ABI", (key, abi, parents) => {
    assert.strictEqual(interfaceId(abi, parents), InterfaceIds.registry[key]);
  });
});

describe("InterfaceIds.resolver and initializers", () => {
  it("permissionedResolver matches its ABI", () => {
    // IRecordResolver has no ABI of its own in the package (contracts-v2 v1.0.1).
    const recordResolver = parseAbi([
      "function resolve(bytes name, bytes data) view returns (bytes)",
      "function multicall(bytes[] data) returns (bytes[])",
      "function multicallWithNodeCheck(bytes32 nodehash, bytes[] data) returns (bytes[])",
      "function setABI(bytes name, uint256 contentType, bytes data)",
      "function setAddress(bytes name, uint256 coinType, bytes addressBytes)",
      "function setContenthash(bytes name, bytes hash)",
      "function setData(bytes name, string key, bytes value)",
      "function setInterface(bytes name, bytes4 interfaceId, address implementer)",
      "function setName(bytes name, string primaryName)",
      "function setText(bytes name, string key, string value)",
    ]);

    assert.strictEqual(
      interfaceId(v2.permissionedResolver, [recordResolver, v2.enhancedAccessControl]),
      InterfaceIds.resolver.permissionedResolver,
    );
  });

  it.each([
    [
      InterfaceIds.resolver.permissionedResolverInitializable,
      "initialize((address,uint256)[],bytes[])",
    ],
    [
      InterfaceIds.wrapperRegistryInitializable.explicit,
      "initialize(bytes32,address,string,uint256)",
    ],
    [InterfaceIds.wrapperRegistryInitializable.fuseDerived, "initialize(bytes32,address)"],
    [InterfaceIds.erc165, "supportsInterface(bytes4)"],
    [InterfaceIds.resolver.addressSetter, "setAddress(bytes,uint256,bytes)"],
  ])("%s is the selector of %s", (id, signature) => {
    assert.strictEqual(toFunctionSelector(signature), id);
  });
});

describe("InterfaceIds.resolverProfiles", () => {
  const profiles = Rec.toEntries(InterfaceIds.resolverProfiles);

  it.each(Arr.filter(profiles, ([profile]) => profile !== "dnsRecord"))(
    "%s matches its ABI",
    (profile, id) => {
      const abi = (Abis.shared as Readonly<Record<string, Abi>>)[`${profile}Resolver`];
      assert.isDefined(abi);
      assert.strictEqual(interfaceId(abi), id);
    },
  );

  // The ABI bundles DNSResolver's `hasDNSRecords`, which IDNSRecordResolver does not declare.
  it("dnsRecord matches its ABI without hasDNSRecords", () => {
    const resolverOnly = parseAbi([
      "function hasDNSRecords(bytes32 node, bytes32 name) view returns (bool)",
    ]);
    assert.strictEqual(
      interfaceId(Abis.shared.dnsRecordResolver, [resolverOnly]),
      InterfaceIds.resolverProfiles.dnsRecord,
    );
  });
});

// Interface ABIs without a constant in the package, against the `Interface selector` comments of
// contracts-v2 v1.0.1: a stale ABI changes the XOR.
describe("interface ABIs match contracts-v2 v1.0.1 selectors", () => {
  it.each([
    ["IAddressSet", v2.addressSet, [], "0x1aedefda"],
    ["IContractName", v2.contractName, [], "0x75d0c0dc"],
    ["IContractNamer", v2.contractNamer, [], "0x6f3ff726"],
    ["IETHRenewer", v2.ethRenewer, [], "0x37e6a567"],
    ["IETHRegistrar", v2.ethRegistrar, [v2.ethRenewer], "0xc1401b80"],
    ["IL2ReverseRegistrar", v2.l2ReverseRegistrar, [], "0xd037477f"],
    ["ILabelStore", v2.labelStore, [], "0x0d48fe93"],
    ["IRegistryURIRenderer", v2.registryUriRenderer, [], "0x6c55e19b"],
    ["IRentPriceOracle", v2.rentPriceOracle, [], "0x480851dc"],
    ["IUniversalSignatureValidator", v2.universalSignatureValidator, [], "0x98ef1ed8"],
    ["IStandaloneHCAOwner", standaloneHcaOwnerV2InterfaceAbi, [], "0xd70318f2"],
    ["IStandaloneHCAFactory", standaloneHcaFactoryV2InterfaceAbi, [], "0xb2a3ab4f"],
  ] as const)("%s", (_, abi, parents, id) => {
    assert.strictEqual(interfaceId(abi, parents), id);
  });
});
