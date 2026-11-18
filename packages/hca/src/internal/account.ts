import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { predictVerifiableProxyAddress } from "@ensforge/contracts/v2";
import {
  hcaAccountId,
  hcaDeploymentSalt,
  standaloneHcaFactoryV2Abi,
  standaloneSingleOwnerHcaV2Abi,
} from "@ensforge/contracts/v2/experimental/hca";
import { Rpc, type Client } from "@ensforge/sdk/extension";
import { getAddress, hexToBigInt, isAddressEqual, zeroAddress, type Address } from "viem";

import type { HcaError } from "../errors/classes/HcaError.js";
import type { HcaAccount, HcaProblem } from "../types.js";
import { requireHca } from "./deployment.js";

type ReadError = HcaError | Effect.Error<ReturnType<typeof Rpc.readContract>>;

/** The HCA address of `owner`: the factory's VerifiableFactory proxy for the initial implementation. */
export const predictAddress = Effect.fnUntraced(function* (
  client: Client,
  owner: Address,
): Effect.fn.Return<Address, ReadError> {
  const deployment = yield* requireHca(client);
  const proxyLogic = yield* Rpc.readContract(client, {
    address: deployment.verifiableFactory,
    abi: Abis.v2.verifiableFactory,
    functionName: "proxyLogic",
  });
  return predictVerifiableProxyAddress({
    factory: deployment.verifiableFactory,
    proxyLogic,
    deployer: deployment.contracts.standaloneFactory,
    salt: hexToBigInt(
      hcaDeploymentSalt({ owner, implementation: deployment.contracts.standaloneImplementation }),
    ),
  });
});

const optional = <value, error>(effect: Effect.Effect<value, error>) =>
  effect.pipe(Effect.orElseSucceed(() => undefined));

/** Reads what the account is and who controls it, deployed or predicted. */
export const readAccount = Effect.fnUntraced(function* (
  client: Client,
  options: { readonly owner?: Address | undefined; readonly address?: Address | undefined },
): Effect.fn.Return<HcaAccount, ReadError> {
  const deployment = yield* requireHca(client);
  const predicted =
    options.owner === undefined ? undefined : yield* predictAddress(client, options.owner);
  const address = options.address ?? predicted;
  if (address === undefined) return yield* Effect.die("readAccount needs an owner or an address");

  const deployed = yield* Rpc.hasCode(client, address);
  if (!deployed) {
    return {
      address,
      owner: options.owner ?? null,
      deployed: false,
      authorizedOwner: null,
      accountId: null,
      implementation: null,
      initialImplementation: deployment.contracts.standaloneImplementation,
      sessionNonce: 0n,
      upgradeSet: deployment.contracts.upgradeSet,
      problems: problemsOf({ address, predicted, deployed: false }),
    };
  }

  const [state, accountId, implementation, authorized] = yield* Effect.all(
    [
      optional(
        Rpc.readContract(client, {
          address,
          abi: standaloneSingleOwnerHcaV2Abi,
          functionName: "ownerAndSessionNonce",
        }),
      ),
      optional(
        Rpc.readContract(client, {
          address,
          abi: standaloneSingleOwnerHcaV2Abi,
          functionName: "accountId",
        }),
      ),
      optional(
        Rpc.readContract(client, {
          address,
          abi: standaloneSingleOwnerHcaV2Abi,
          functionName: "getImplementation",
        }),
      ),
      optional(
        Rpc.readContract(client, {
          address: deployment.contracts.standaloneFactory,
          abi: standaloneHcaFactoryV2Abi,
          functionName: "authorizedOwnerOf",
          args: [address],
        }),
      ),
    ],
    { concurrency: "unbounded" },
  );

  const [owner, sessionNonce] = state ?? [null, 0n];
  const current = implementation ?? null;
  const authorizedOwner =
    authorized === undefined || isAddressEqual(authorized, zeroAddress) ? null : authorized;
  const trusted =
    current === null
      ? false
      : isAddressEqual(current, deployment.contracts.standaloneImplementation) ||
        (yield* optional(
          Rpc.readContract(client, {
            address: deployment.contracts.upgradeSet,
            abi: Abis.v2.permissionedAddressSet,
            functionName: "includes",
            args: [current],
          }),
        )) === true;

  return {
    address,
    owner: owner === null ? null : getAddress(owner),
    deployed: true,
    authorizedOwner,
    accountId: accountId ?? null,
    implementation: current,
    initialImplementation: deployment.contracts.standaloneImplementation,
    sessionNonce,
    upgradeSet: deployment.contracts.upgradeSet,
    problems: problemsOf({
      address,
      predicted,
      deployed: true,
      owner,
      authorizedOwner,
      accountId,
      trusted,
      expectedOwner: options.owner,
    }),
  };
});

/** HCA.md's checks before using an existing HCA, plus the address derivation. */
const problemsOf = (facts: {
  readonly address: Address;
  readonly predicted: Address | undefined;
  readonly deployed: boolean;
  readonly owner?: Address | null | undefined;
  readonly authorizedOwner?: Address | null | undefined;
  readonly accountId?: string | undefined;
  readonly trusted?: boolean | undefined;
  readonly expectedOwner?: Address | undefined;
}): readonly HcaProblem[] => {
  const failed: HcaProblem[] = [];
  if (facts.predicted !== undefined && !isAddressEqual(facts.predicted, facts.address))
    failed.push("address-mismatch");
  if (!facts.deployed) return failed;

  const expected = facts.expectedOwner ?? facts.owner ?? undefined;
  if (facts.owner === null || facts.owner === undefined) failed.push("owner-unavailable");
  else if (expected !== undefined && !isAddressEqual(facts.owner, expected))
    failed.push("owner-mismatch");
  if (facts.accountId !== hcaAccountId) failed.push("unknown-account");
  if (facts.trusted !== true) failed.push("untrusted-implementation");
  if (
    facts.authorizedOwner === null ||
    facts.authorizedOwner === undefined ||
    (facts.owner !== null &&
      facts.owner !== undefined &&
      !isAddressEqual(facts.authorizedOwner, facts.owner))
  )
    failed.push("not-certified");

  return failed;
};
