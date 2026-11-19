import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Record as Rec } from "effect";

import { Abis } from "@ensforge/contracts";
import {
  hcaOwnerAndSessionValidatorV2Abi,
  standaloneHcaFactoryV2Abi,
  standaloneSingleOwnerHcaV2Abi,
} from "@ensforge/contracts/internal/v2/experimental/hca/index";
import {
  toEventSelector,
  toFunctionSelector,
  type Abi,
  type AbiEvent,
  type AbiFunction,
} from "viem";

type AbiTree = { readonly [key: string]: Abi | AbiTree };

const isAbi = (node: Abi | AbiTree): node is Abi => Arr.isArray(node);

const abisOf = (prefix: string, group: AbiTree): [string, Abi][] =>
  Arr.flatMap(Rec.toEntries(group), ([key, node]) =>
    isAbi(node) ? [[`${prefix}.${key}`, node]] : abisOf(`${prefix}.${key}`, node),
  );

const all: [string, Abi][] = [
  ...abisOf("v1", Abis.v1),
  ...abisOf("v2", Abis.v2),
  ...abisOf("shared", Abis.shared),
  ...abisOf("basenames", Abis.basenames),
  ...abisOf("durin", Abis.durin),
  ...abisOf("celonames", Abis.celonames),
  ...abisOf("namespace", Abis.namespace),
  ["hca.standaloneSingleOwnerHca", standaloneSingleOwnerHcaV2Abi],
  ["hca.standaloneHcaFactory", standaloneHcaFactoryV2Abi],
  ["hca.ownerAndSessionValidator", hcaOwnerAndSessionValidatorV2Abi],
];

describe("ABI shape", () => {
  it.each(all)("%s has no duplicate function or event selectors", (_, abi) => {
    const functions = Arr.map(
      Arr.filter(abi, (entry): entry is AbiFunction => entry.type === "function"),
      toFunctionSelector,
    );
    const events = Arr.map(
      Arr.filter(abi, (entry): entry is AbiEvent => entry.type === "event"),
      (event) => toEventSelector(event),
    );
    assert.strictEqual(new Set(functions).size, functions.length);
    assert.strictEqual(new Set(events).size, events.length);
  });
});

// The functions packages/sdk and packages/hca call by name on each ABI.
describe("ABI coverage of SDK calls", () => {
  it.each([
    [Abis.shared.erc1155, ["isApprovedForAll", "setApprovalForAll", "uri"]],
    [Abis.shared.erc20, ["allowance", "approve", "balanceOf", "decimals", "symbol"]],
    [Abis.shared.erc721, ["getApproved", "isApprovedForAll", "tokenURI"]],
    [Abis.shared.dnssecGateway, ["resolve"]],
    [Abis.shared.versionableResolver, ["recordVersions"]],
    [Abis.shared.multicallResolver, ["multicall"]],
    [
      Abis.v1.baseRegistrar,
      ["approve", "getApproved", "isApprovedForAll", "nameExpires", "reclaim", "safeTransferFrom"],
    ],
    [Abis.v1.dnsRegistrar, ["inceptions", "proveAndClaim", "proveAndClaimWithResolver"]],
    [
      Abis.v1.ensRegistry,
      ["isApprovedForAll", "owner", "setApprovalForAll", "setOwner", "setRecord"],
    ],
    [
      Abis.v1.nameWrapper,
      [
        "extendExpiry",
        "getData",
        "names",
        "safeBatchTransferFrom",
        "safeTransferFrom",
        "setApprovalForAll",
        "setChildFuses",
        "setFuses",
        "setSubnodeRecord",
        "unwrap",
        "unwrapETH2LD",
        "wrap",
      ],
    ],
    [
      Abis.v1.publicResolver,
      ["clearRecords", "isApprovedFor", "setABI", "setAddr", "setDNSRecords", "setZonehash"],
    ],
    [Abis.v1.reverseRegistrar, ["defaultResolver", "setName", "setNameForAddr"]],
    [
      Abis.v2.ethRegistrar,
      [
        "GRACE_PERIOD",
        "MIN_REGISTER_DURATION",
        "commit",
        "commitmentAt",
        "getRenewPrice",
        "isAvailable",
        "isRenewable",
        "register",
        "renew",
        "renewBatch",
        "rentPriceOracle",
      ],
    ],
    [Abis.v2.permissionedAddressSet, ["approve", "grantRootRoles", "includes", "revokeRootRoles"]],
    [
      Abis.v2.permissionedRegistry,
      [
        "getResource",
        "getState",
        "grantRoles",
        "renew",
        "roles",
        "setResolver",
        "setSubregistry",
        "unregister",
        "unsafeTransfer",
      ],
    ],
    [
      Abis.v2.permissionedResolver,
      [
        "canUpgradeFrom",
        "getRecordId",
        "grantRootRoles",
        "initialize",
        "linkToNode",
        "linkToRecord",
        "multicall",
        "setAddress",
        "upgradeToAndCall",
      ],
    ],
    [Abis.v2.standardRentPriceOracle, ["getRegisterPrice", "isPaymentToken", "isValid"]],
    [Abis.v2.universalHelper, ["findCanonicalName", "findNearestOwner", "findParentRegistry"]],
    [
      Abis.v2.universalResolver,
      ["findResolver", "resolve", "resolveWithGateways", "reverse", "reverseWithGateways"],
    ],
    [
      Abis.v2.userRegistry,
      ["canUpgradeFrom", "getURI", "initialize", "register", "setParent", "upgradeToAndCall"],
    ],
    [Abis.v2.verifiableFactory, ["deployProxy", "proxyLogic"]],
    [Abis.basenames.baseRegistrar, ["baseNode", "nameExpires", "ownerOf"]],
    [Abis.durin.l1Resolver, ["l2Registry"]],
    [Abis.durin.l2Registry, ["baseNode", "ownerOf"]],
    [Abis.celonames.registry, ["expiries", "ownerOf"]],
    [Abis.namespace.hybridResolver, ["configs"]],
    [Abis.namespace.hybridResolverV2, ["findRoute"]],
    [Abis.namespace.nodeRegistryResolver, ["nodeRegistries"]],
    [Abis.namespace.ensNameRegistry, ["expiries", "ownerOf"]],
    [Abis.v2.defaultReverseRegistrarAdapter, ["setName", "setNameWithHCA"]],
    [Abis.v2.reverseRegistrarAdapter, ["claimWithHCA"]],
    [
      standaloneHcaFactoryV2Abi,
      [
        "approvedImplementations",
        "authorizedOwnerOf",
        "deploy",
        "owner",
        "renounceOwnership",
        "setImplementationApproval",
        "transferOwnership",
      ],
    ],
    [
      standaloneSingleOwnerHcaV2Abi,
      [
        "accountId",
        "canUpgradeFrom",
        "execute",
        "executeByOwner",
        "getImplementation",
        "ownerAndSessionNonce",
        "revokeSessions",
        "upgradeToAndCall",
        "withdrawDepositTo",
      ],
    ],
  ] as const)("%#: has every called function", (abi, called) => {
    const present = new Set(
      Arr.map(
        Arr.filter(abi as Abi, (entry) => entry.type === "function"),
        (entry) => entry.name,
      ),
    );
    for (const name of called) assert.isTrue(present.has(name), `missing ${name}`);
  });
});

const selectorsOf = (abi: Abi) =>
  new Set(
    Arr.map(
      Arr.filter(abi, (entry): entry is AbiFunction => entry.type === "function"),
      toFunctionSelector,
    ),
  );

// Record reads and writes on L2 names go through the shared resolver profiles, so every L2
// resolver must answer their selectors. Linea's resolver is the ENSv1 public resolver.
describe("L2 resolvers implement the standard resolver profiles", () => {
  const resolverAbi: Abi = Abis.v1.publicResolver;
  const setters = Arr.filter(
    resolverAbi,
    (entry): entry is AbiFunction =>
      entry.type === "function" && ["setAddr", "setText", "setContenthash"].includes(entry.name),
  );
  const profile = [
    ...Abis.shared.addrResolver,
    ...Abis.shared.addressResolver,
    ...Abis.shared.textResolver,
    ...Abis.shared.contenthashResolver,
    ...Abis.shared.multicallResolver,
    ...setters,
  ];

  it.each([
    ["basenames.l2Resolver", Abis.basenames.l2Resolver],
    ["celonames.registry", Abis.celonames.registry],
    ["durin.l2Registry", Abis.durin.l2Registry],
    ["namespace.namePublicResolver", Abis.namespace.namePublicResolver],
  ] as const)("%s", (_, abi) => {
    const present = selectorsOf(abi);
    for (const selector of selectorsOf(profile))
      assert.isTrue(present.has(selector), `missing ${selector}`);
  });
});

// An interface ABI holds the functions ensforge calls, each exactly as the contract declares it.
describe("L2 namespace interface ABIs are subsets of their contracts' ABIs", () => {
  it.each([
    ["durin.l1Resolver", Abis.durin.interfaces.l1Resolver, Abis.durin.l1Resolver],
    ["durin.l2Registry", Abis.durin.interfaces.l2Registry, Abis.durin.l2Registry],
    [
      "namespace.hybridResolver",
      Abis.namespace.interfaces.hybridResolver,
      Abis.namespace.hybridResolver,
    ],
    [
      "namespace.hybridResolverV2",
      Abis.namespace.interfaces.hybridResolverV2,
      Abis.namespace.hybridResolverV2,
    ],
    [
      "namespace.nodeRegistryResolver",
      Abis.namespace.interfaces.nodeRegistryResolver,
      Abis.namespace.nodeRegistryResolver,
    ],
  ] as const)("%s", (_, subset, full) => {
    const declared = selectorsOf(full);
    for (const selector of selectorsOf(subset)) assert.isTrue(declared.has(selector), selector);
  });
});
