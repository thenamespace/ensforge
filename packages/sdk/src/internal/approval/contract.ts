import { Effect } from "effect";

import type { Address } from "viem";

import type { ApprovalContract } from "../../actions/approval/types.js";
import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { Read } from "../../Types.js";
import { loadName } from "../name/load.js";
import { notRegistered, requireAddress, requireV1Contracts } from "../name/write.js";

/** The address of an approval contract. */
export const approvalContract = (
  client: Client,
  contract: ApprovalContract,
): Effect.Effect<Address, AnyError> => {
  switch (contract) {
    case "registry":
      return requireV1Contracts(client).pipe(Effect.map((contracts) => contracts.registry));
    case "registrar":
      return requireV1Contracts(client).pipe(Effect.map((contracts) => contracts.baseRegistrar));
    case "wrapper":
      return requireV1Contracts(client).pipe(Effect.map((contracts) => contracts.nameWrapper));
    default:
      return requireAddress(contract, "contract");
  }
};

/**
 * Where an operator acts for a name's owner: the contract holding the name's token (the ENSv2
 * registry, the NameWrapper, the `.eth` registrar) or, for an unwrapped ENSv1 subname, the
 * registry; for an L2 name, the same on its L2, with a client there.
 */
export const nameApprovalTarget = Effect.fnUntraced(function* (
  client: Client,
  name: string,
  block: Read.BlockOptions = {},
): Effect.fn.Return<{ readonly client: Client; readonly contract: Address }, AnyError> {
  const loaded = yield* loadName(client, name, block);
  const { state, data } = loaded;
  if (loaded.kind !== "available" && state.registry !== null) {
    if (state.protocol === "v2") return { client, contract: state.registry };
    const contracts = yield* requireV1Contracts(client);
    const contract = state.wrapped
      ? contracts.nameWrapper
      : data.parts.isEth2ld
        ? contracts.baseRegistrar
        : contracts.registry;
    return { client, contract };
  }

  const { l2LocationOf, l2Client } = yield* Effect.promise(() => import("../name/location.js"));
  const location = yield* l2LocationOf(client, data.parts, {});
  if (location === null) return yield* notRegistered(client, loaded);
  const l2 = yield* l2Client(client, location, true);
  const { l2OperatorContract } = yield* Effect.promise(() => import("../namespace/l2/index.js"));
  const contract = l2 === null ? null : l2OperatorContract(l2, location, data.parts);
  if (l2 === null || contract === null) return yield* notRegistered(client, loaded);
  return { client: l2, contract };
});
