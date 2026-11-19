import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { hexToBigInt, isAddressEqual, type Address } from "viem";

import type { Authority } from "../../../actions/permission/get/types.js";
import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import { nonZeroAddress } from "../../address.js";
import type { L2Location } from "../../name/location.js";
import type { NameParts } from "../../name/parts.js";
import * as Rpc from "../../rpc/index.js";
import { l2ResolverOf } from "./records.js";
import { l2OperatorContract, l2TokenOf } from "./tokens.js";

/** Whether an account may write a name's records on its L2, and as what. */
export type RecordAccess = {
  readonly allowed: boolean;
  readonly via: Authority | null;
  /** The contract that checks it. */
  readonly contract: Address | null;
  /** The owner the contract checks against. */
  readonly owner: Address | null;
};

const is = (a: Address | null | undefined, b: Address): boolean =>
  a !== null && a !== undefined && isAddressEqual(a, b);

/** An ENSv1-style resolver's operators: approved for all of `owner`'s names, or for `node`. */
const resolverOperator = (
  client: Client,
  resolver: Address,
  owner: Address,
  parts: NameParts,
  account: Address,
) =>
  Effect.all(
    [
      Rpc.readContractOrUndefined(client, {
        address: resolver,
        abi: Abis.v1.publicResolver,
        functionName: "isApprovedForAll",
        args: [owner, account],
      }),
      Rpc.readContractOrUndefined(client, {
        address: resolver,
        abi: Abis.v1.publicResolver,
        functionName: "isApprovedFor",
        args: [owner, parts.node, account],
      }),
    ],
    { concurrency: "unbounded" },
  ).pipe(
    Effect.map(([operator, delegate]): Authority | null =>
      operator === true ? "operator" : delegate === true ? "delegate" : null,
    ),
  );

const denied = (contract: Address | null, owner: Address | null): RecordAccess => ({
  allowed: false,
  via: null,
  contract,
  owner,
});

/**
 * Who may write a name's records on its L2, as each family's resolver checks it (`client` is on
 * that chain):
 *
 * - Basenames and Linea Names: the registry owner (the NameWrapper's owner for wrapped Linea
 *   names), or an operator or delegate the resolver records for them.
 * - Celonames: the token owner, an operator approved for all its tokens, or a registrar.
 * - Durin: the token owner, the token's approved address, or a registrar.
 * - Namespace: the token owner in the registry the NodeRegistryResolver records for the name.
 */
export const recordAccess: (
  client: Client,
  location: L2Location,
  parts: NameParts,
  account: Address,
) => Effect.Effect<RecordAccess, AnyError> = Effect.fnUntraced(function* (
  client: Client,
  location: L2Location,
  parts: NameParts,
  account: Address,
): Effect.fn.Return<RecordAccess, AnyError> {
  const namespaces = client.deployment.namespaces ?? {};
  const tokenId = hexToBigInt(parts.node);

  switch (location.id) {
    case "basenames":
    case "linea": {
      const contracts = namespaces[location.id]?.contracts;
      const resolver = yield* l2ResolverOf(client, location, parts);
      if (contracts === undefined || resolver === null) return denied(resolver, null);
      const manager = yield* Rpc.readContract(client, {
        address: contracts.registry,
        abi: Abis.v1.ensRegistry,
        functionName: "owner",
        args: [parts.node],
      });
      let owner = nonZeroAddress(manager);
      if (owner !== null && "nameWrapper" in contracts && is(owner, contracts.nameWrapper)) {
        const holder = yield* Rpc.readContractOrUndefined(client, {
          address: contracts.nameWrapper,
          abi: Abis.v1.nameWrapper,
          functionName: "ownerOf",
          args: [tokenId],
        });
        owner = nonZeroAddress(holder);
      }
      if (owner === null) return denied(resolver, null);
      if (is(owner, account)) return { allowed: true, via: "owner", contract: resolver, owner };
      const via = yield* resolverOperator(client, resolver, owner, parts, account);
      return { allowed: via !== null, via, contract: resolver, owner };
    }

    case "celonames": {
      const registry = location.registry;
      if (registry === null) return denied(null, null);
      const abi = Abis.celonames.interfaces.registry;
      const [holder, registrar] = yield* Effect.all(
        [
          Rpc.readContractOrUndefined(client, {
            address: registry,
            abi,
            functionName: "ownerOf",
            args: [tokenId],
          }),
          Rpc.readContract(client, {
            address: registry,
            abi,
            functionName: "isRegistrar",
            args: [account],
          }),
        ],
        { concurrency: "unbounded" },
      );
      const owner = nonZeroAddress(holder);
      if (is(owner, account)) return { allowed: true, via: "owner", contract: registry, owner };
      if (registrar) return { allowed: true, via: "roles", contract: registry, owner };
      if (owner === null) return denied(registry, null);
      const operator = yield* Rpc.readContract(client, {
        address: registry,
        abi,
        functionName: "isApprovedForAll",
        args: [owner, account],
      });
      return { allowed: operator, via: operator ? "operator" : null, contract: registry, owner };
    }

    case "durin": {
      const registry = location.registry;
      if (registry === null) return denied(null, null);
      const abi = Abis.durin.interfaces.l2Registry;
      const [holder, approved, registrar] = yield* Effect.all(
        [
          Rpc.readContract(client, {
            address: registry,
            abi,
            functionName: "owner",
            args: [parts.node],
          }),
          Rpc.readContractOrUndefined(client, {
            address: registry,
            abi,
            functionName: "getApproved",
            args: [tokenId],
          }),
          Rpc.readContract(client, {
            address: registry,
            abi,
            functionName: "registrars",
            args: [account],
          }),
        ],
        { concurrency: "unbounded" },
      );
      const owner = nonZeroAddress(holder);
      if (is(owner, account)) return { allowed: true, via: "owner", contract: registry, owner };
      if (is(approved, account))
        return { allowed: true, via: "approved", contract: registry, owner };
      if (registrar) return { allowed: true, via: "roles", contract: registry, owner };
      return denied(registry, owner);
    }

    default: {
      // Namespace.
      const contracts = namespaces.namespace?.chains[location.chainId];
      if (contracts === undefined) return denied(null, null);
      // NamePublicResolver asks the NodeRegistryResolver for the name's own registry.
      const recorded = yield* Rpc.readContract(client, {
        address: contracts.nodeRegistryResolver,
        abi: Abis.namespace.interfaces.nodeRegistryResolver,
        functionName: "nodeRegistries",
        args: [parts.node],
      });
      const registry = nonZeroAddress(recorded);
      if (registry === null) return denied(contracts.publicResolver, null);
      const holder = yield* Rpc.readContractOrUndefined(client, {
        address: registry,
        abi: Abis.namespace.interfaces.ensNameRegistry,
        functionName: "ownerOf",
        args: [tokenId],
      });
      const owner = nonZeroAddress(holder);
      return is(owner, account)
        ? { allowed: true, via: "owner", contract: contracts.publicResolver, owner }
        : denied(contracts.publicResolver, owner);
    }
  }
});

/**
 * Whether an account may transfer an L2 name (or approve its token), as its token contract checks
 * it (`client` is on the L2): the holder, the token's approved address, or an operator of the
 * holder. A Basenames subname is a registry record: its owner, or an operator the registry records.
 */
export const transferAccess: (
  client: Client,
  location: L2Location,
  parts: NameParts,
  account: Address,
) => Effect.Effect<RecordAccess, AnyError> = Effect.fnUntraced(function* (
  client: Client,
  location: L2Location,
  parts: NameParts,
  account: Address,
): Effect.fn.Return<RecordAccess, AnyError> {
  const token = l2TokenOf(client, location, parts);
  const registry = l2OperatorContract(client, location, parts);
  if (registry === null) return denied(null, null);

  const [holder, approved] =
    token === null
      ? [
          yield* Rpc.readContract(client, {
            address: registry,
            abi: Abis.v1.ensRegistry,
            functionName: "owner",
            args: [parts.node],
          }),
          undefined,
        ]
      : yield* Effect.all(
          [
            // Both revert once the name has expired.
            Rpc.readContractOrUndefined(client, {
              address: token.contract,
              abi: Abis.shared.erc721,
              functionName: "ownerOf",
              args: [token.tokenId],
            }),
            Rpc.readContractOrUndefined(client, {
              address: token.contract,
              abi: Abis.shared.erc721,
              functionName: "getApproved",
              args: [token.tokenId],
            }),
          ],
          { concurrency: "unbounded" },
        );
  const owner = nonZeroAddress(holder);
  if (owner === null) return denied(registry, null);
  if (is(owner, account)) return { allowed: true, via: "owner", contract: registry, owner };
  if (is(approved, account)) return { allowed: true, via: "approved", contract: registry, owner };
  // `isApprovedForAll(owner, operator)` has the same selector on the registry and every token.
  const operator = yield* Rpc.readContract(client, {
    address: registry,
    abi: Abis.shared.erc721,
    functionName: "isApprovedForAll",
    args: [owner, account],
  });
  return { allowed: operator, via: operator ? "operator" : null, contract: registry, owner };
});
