import { Effect } from "effect";

import { Abis, InterfaceIds } from "@ensforge/contracts";

import type { Client } from "../../client/types.js";
import { offchainWriteRefused } from "../../errors/translate/revert-map.js";
import type { AnyError } from "../../errors/types.js";
import * as Rpc from "../rpc/index.js";

/**
 * The typed refusal behind a failed resolver write, when the resolver keeps its records
 * off-chain, with the failed call's context; otherwise `undefined`. ERC-5559 and ERC-7884 refusals are typed by the revert map
 * already; this covers an EIP-3668 `OffchainLookup` (which a transaction cannot follow, so it is
 * not a disabled CCIP-Read) and an ENSIP-10 extended resolver reverting without a reason.
 */
export const offchainWriteRefusal = (
  client: Client,
  error: AnyError,
): Effect.Effect<AnyError | undefined> => {
  const { contract, revert } = error.context;
  if (revert?.errorName === "OffchainLookup") {
    return Effect.succeed(
      offchainWriteRefused(
        "EIP-3668: the resolver answered with an OffchainLookup, which a transaction cannot follow.",
      )
        .withCause(error)
        .withContext(error.context),
    );
  }

  const emptyRevert =
    error._tag === "ContractRevertError" &&
    revert?.errorName === undefined &&
    (revert?.data === undefined || revert.data === "0x");
  if (!emptyRevert || contract === undefined) return Effect.undefined;

  // Bounded as EIP-165 bounds `supportsInterface`; a resolver that does not answer is not extended.
  return Rpc.readContractOrUndefined(client, {
    address: contract,
    abi: Abis.shared.erc165,
    functionName: "supportsInterface",
    args: [InterfaceIds.resolverProfiles.extended],
    gas: 30_000n,
  }).pipe(
    Effect.map((extended) =>
      extended === true
        ? offchainWriteRefused(
            "ENSIP-10: the resolver is an extended resolver and reverted without a reason.",
          )
            .withCause(error)
            .withContext(error.context)
        : undefined,
    ),
    Effect.orElseSucceed(() => undefined),
  );
};
