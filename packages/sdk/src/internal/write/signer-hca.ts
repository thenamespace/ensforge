import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { predictVerifiableProxyAddress } from "@ensforge/contracts/v2";
import {
  hcaDeploymentSalt,
  standaloneHcaFactoryV2InterfaceAbi,
} from "@ensforge/contracts/v2/experimental/hca";
import { hexToBigInt, isAddressEqual, zeroAddress, type Address } from "viem";

import type { Client } from "../../client/types.js";
import * as Rpc from "../rpc/index.js";

/**
 * Whether `sender`, the account a route sends as, is the HCA `signer` owns: contracts that act
 * for an HCA's owner (the reverse registrar adapters, MigrationHelper) accept it as the owner.
 */
export const isSignerHca = Effect.fnUntraced(function* (
  client: Client,
  sender: Address,
  signer: Address,
) {
  const adapter = client.deployment.v2?.contracts.defaultReverseRegistrarAdapter;
  if (adapter === undefined) return false;
  const factory = yield* Rpc.readContract(client, {
    address: adapter,
    abi: Abis.v2.defaultReverseRegistrarAdapter,
    functionName: "STANDALONE_HCA_FACTORY",
  });
  const owner = yield* Rpc.readContractOrUndefined(client, {
    address: factory,
    abi: standaloneHcaFactoryV2InterfaceAbi,
    functionName: "authorizedOwnerOf",
    args: [sender],
  });
  if (owner !== undefined && !isAddressEqual(owner, zeroAddress)) {
    return isAddressEqual(owner, signer);
  }

  // A counterfactual HCA has no authorized owner yet; the route deploys it before its first
  // execution, so the signer's predicted address passes the adapter's check by then.
  const v2 = client.deployment.v2;
  const implementation = v2?.hca?.standaloneImplementation;
  if (v2 === undefined || implementation === undefined) return false;
  const proxyLogic = yield* Rpc.readContract(client, {
    address: v2.contracts.verifiableFactory,
    abi: Abis.v2.verifiableFactory,
    functionName: "proxyLogic",
  });
  const predicted = predictVerifiableProxyAddress({
    factory: v2.contracts.verifiableFactory,
    proxyLogic,
    deployer: factory,
    salt: hexToBigInt(hcaDeploymentSalt({ owner: signer, implementation })),
  });
  return isAddressEqual(predicted, sender);
});
