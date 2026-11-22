import { Effect, Array as Arr } from "effect";

import { Abis } from "@ensforge/contracts";
import { isAddressEqual, type Address, type Hex } from "viem";

import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import { callIndexer } from "../indexer/call.js";
import * as Rpc from "../rpc/index.js";
import { accountResolverAddress } from "./account.js";

/**
 * Why the PermissionedResolver `resolver` may serve names other than `name`, or `undefined` when
 * it provably serves only `name`. Its roles cover every name on it, never one, so handing them
 * over gives away every other name's records. Proof, in order: it is not the shared resolver of
 * any of `accounts`; it holds no record or only `name`'s; and the indexer, when configured, knows
 * no other name on it. Names pointing at it without a record are only visible to the indexer.
 */
export const resolverSharing = Effect.fnUntraced(function* (
  client: Client,
  options: {
    readonly resolver: Address;
    readonly name: string;
    readonly node: Hex;
    readonly accounts: readonly Address[];
  },
): Effect.fn.Return<
  { readonly problem: string | undefined; readonly warnings: readonly Plan.Warning[] },
  AnyError
> {
  const { resolver } = options;
  const [shared, count, recordId] = yield* Effect.all(
    [
      Effect.forEach(options.accounts, (account) => accountResolverAddress(client, account), {
        concurrency: "unbounded",
      }),
      Rpc.readContractOrUndefined(client, {
        address: resolver,
        abi: Abis.v2.permissionedResolver,
        functionName: "getRecordCount",
      }),
      Rpc.readContractOrUndefined(client, {
        address: resolver,
        abi: Abis.v2.permissionedResolver,
        functionName: "getRecordId",
        args: [options.node],
      }),
    ],
    { concurrency: "unbounded" },
  );
  if (Arr.some(shared, (address) => isAddressEqual(address, resolver))) {
    return {
      problem: "The name uses a shared resolver; its roles cover other names too.",
      warnings: [],
    };
  }
  // Record IDs start at 1; links to a record do not add one.
  if (
    count === undefined ||
    recordId === undefined ||
    count > 1n ||
    (count === 1n && recordId !== 1n)
  ) {
    return {
      problem: "The name's resolver holds records of other names; its roles cover them too.",
      warnings: [],
    };
  }
  if (client.config.indexer === undefined) return { problem: undefined, warnings: [] };

  const indexed = yield* callIndexer(client, "getResolver", {
    address: resolver,
    chainId: client.chain.id,
  }).pipe(Effect.option);
  if (indexed._tag === "None") {
    return {
      problem: undefined,
      warnings: [
        {
          code: "RESOLVER_SHARING_UNCHECKED",
          message: `The indexer could not list the names on ${resolver}; names on it without records would be handed over too.`,
        },
      ],
    };
  }
  const names = indexed.value?.names ?? [];
  return indexed.value?.hasMore === true || Arr.some(names, (other) => other !== options.name)
    ? { problem: "Other names use the name's resolver; its roles cover them too.", warnings: [] }
    : { problem: undefined, warnings: [] };
});
