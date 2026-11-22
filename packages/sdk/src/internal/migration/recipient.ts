import { Effect, String as Str } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData, type Address } from "viem";
import { call } from "viem/actions";

import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import { fromPromise } from "../rpc/fromPromise.js";
import { hasCode } from "../rpc/hasCode.js";

/** What `onERC1155Received` returns when a contract accepts the token. */
const accepted = "0xf23a6e61";

/**
 * Whether `recipient` can receive a name's ENSv2 token from `registry`: an account without code
 * always can; a contract, or an EIP-7702 account, must answer `onERC1155Received` with its
 * selector, as the registry checks when it mints. A failure that is not a revert does not block.
 */
export const canReceiveName = Effect.fnUntraced(function* (
  client: Client,
  recipient: Address,
  options: { readonly registry: Address; readonly from: Address },
): Effect.fn.Return<boolean, AnyError> {
  if (!(yield* hasCode(client, recipient))) return true;
  const answer = yield* fromPromise(() =>
    call(client.client(), {
      account: options.registry,
      to: recipient,
      data: encodeFunctionData({
        abi: Abis.shared.erc1155Receiver,
        functionName: "onERC1155Received",
        args: [options.registry, options.from, 0n, 1n, "0x"],
      }),
    }),
  ).pipe(
    Effect.map((result) => Str.slice(0, 10)(result.data ?? "0x") === accepted),
    Effect.catchTag("ContractRevertError", () => Effect.succeed(false)),
  );
  return answer;
});
