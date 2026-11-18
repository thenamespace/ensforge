import { Effect } from "effect";

import type { Address } from "viem";

import type { ApprovalContract } from "../../actions/approval/types.js";
import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import { requireAddress, requireV1Contracts } from "../name/write.js";

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
