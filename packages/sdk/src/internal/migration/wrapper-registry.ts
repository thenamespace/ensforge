import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { predictVerifiableProxyAddress } from "@ensforge/contracts/v2";
import { hexToBigInt, isAddressEqual, type Address } from "viem";

import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import { loadName } from "../name/load.js";
import * as Rpc from "../rpc/index.js";

/**
 * Whether `registry` is the WrapperRegistry the receiver deployed for the migrated locked
 * `parent`: the factory proxy its deployer (the LockedMigrationController for a `.eth` 2LD, else
 * the WrapperRegistry holding the parent) creates with the parent's node as salt, which the
 * parent's registry points at and which wraps the parent's node. A locked child's transfer into
 * it is irreversible.
 */
export const isCertifiedWrapperRegistry = Effect.fnUntraced(function* (
  client: Client,
  parent: string,
  registry: Address,
): Effect.fn.Return<boolean, AnyError> {
  const v2 = client.deployment.v2;
  if (v2 === undefined) return false;
  const loaded = yield* loadName(client, parent);
  const holding = loaded.data.v2?.registry;
  if (holding === undefined) return false;

  const { parts } = loaded.data;
  const deployer = parts.isEth2ld ? v2.migration.lockedMigrationController : holding;
  const proxyLogic = yield* Rpc.readContract(client, {
    address: v2.contracts.verifiableFactory,
    abi: Abis.v2.verifiableFactory,
    functionName: "proxyLogic",
  });
  const predicted = predictVerifiableProxyAddress({
    factory: v2.contracts.verifiableFactory,
    proxyLogic,
    deployer,
    salt: hexToBigInt(parts.node),
  });
  if (!isAddressEqual(predicted, registry)) return false;

  const { subregistry, wrapped } = yield* Effect.all(
    {
      subregistry: Rpc.readContract(client, {
        address: holding,
        abi: Abis.v2.permissionedRegistry,
        functionName: "getSubregistry",
        args: [parts.label],
      }),
      wrapped: Rpc.readContractOrUndefined(client, {
        address: registry,
        abi: Abis.v2.wrapperRegistry,
        functionName: "getWrappedNode",
      }),
    },
    { concurrency: "unbounded" },
  );
  return isAddressEqual(subregistry, registry) && wrapped === parts.node;
});
