import { Effect, Array as Arr } from "effect";

import { Abis } from "@ensforge/contracts";
import {
  hexToBigInt,
  isAddressEqual,
  labelhash,
  parseEventLogs,
  type Address,
  type TransactionReceipt,
} from "viem";

import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import * as Rpc from "../rpc/index.js";

/** A name registered by a confirmed registration. */
export type RegisteredName = {
  readonly name: string;
  readonly tokenId: bigint;
  readonly expiry: bigint;
};

/** A name renewed by a confirmed renewal. */
export type RenewedName = { readonly name: string; readonly expiry: bigint };

/**
 * Names registered in `receipts` (ETHRegistrar `NameRegistered`) and what they cost. The event
 * carries the duration, not the expiry, so expiries are read from the ETHRegistry.
 */
export const registeredNames = Effect.fnUntraced(function* (
  client: Client,
  options: {
    readonly receipts: readonly TransactionReceipt[];
    readonly registrar: Address;
    readonly ethRegistry: Address;
  },
): Effect.fn.Return<
  { readonly names: readonly RegisteredName[]; readonly paid: bigint },
  AnyError
> {
  const logs = Arr.filter(
    parseEventLogs({
      abi: Abis.v2.ethRegistrar,
      eventName: "NameRegistered",
      logs: Arr.flatMap(options.receipts, (receipt) => receipt.logs),
    }),
    (log) => isAddressEqual(log.address, options.registrar),
  );

  const names = yield* Effect.forEach(
    logs,
    (log) =>
      Rpc.readContract(client, {
        address: options.ethRegistry,
        abi: Abis.v2.permissionedRegistry,
        functionName: "getState",
        args: [log.args.tokenId],
      }).pipe(
        Effect.map((state) => ({
          name: `${log.args.label}.eth`,
          tokenId: log.args.tokenId,
          expiry: state.expiry,
        })),
      ),
    { concurrency: "unbounded" },
  );
  const paid = Arr.reduce(logs, 0n, (sum, log) => sum + log.args.base + log.args.premium);
  return { names, paid };
});

/**
 * Names renewed in `receipts` (`NameRenewed` from the registrar or the ENSv1 renewer). For ENSv1
 * names the event's `newExpiry` is the ENSv2 reservation's, which is offset by the difference in
 * grace periods, so their expiry is read from the BaseRegistrar like `name.get` does.
 */
export const renewedNames = Effect.fnUntraced(function* (
  client: Client,
  options: {
    readonly receipts: readonly TransactionReceipt[];
    readonly registrar: Address;
    readonly renewer: Address;
    readonly baseRegistrar: Address | undefined;
  },
): Effect.fn.Return<{ readonly names: readonly RenewedName[]; readonly paid: bigint }, AnyError> {
  const logs = Arr.filter(
    parseEventLogs({
      abi: Abis.v2.ethRegistrar,
      eventName: "NameRenewed",
      logs: Arr.flatMap(options.receipts, (receipt) => receipt.logs),
    }),
    (log) =>
      isAddressEqual(log.address, options.registrar) ||
      isAddressEqual(log.address, options.renewer),
  );

  const names = yield* Effect.forEach(
    logs,
    (log) => {
      const name = `${log.args.label}.eth`;
      const baseRegistrar = options.baseRegistrar;
      if (!isAddressEqual(log.address, options.renewer) || baseRegistrar === undefined) {
        return Effect.succeed({ name, expiry: log.args.newExpiry });
      }
      return Rpc.readContract(client, {
        address: baseRegistrar,
        abi: Abis.v1.baseRegistrar,
        functionName: "nameExpires",
        args: [hexToBigInt(labelhash(log.args.label))],
      }).pipe(Effect.map((expiry) => ({ name, expiry })));
    },
    { concurrency: "unbounded" },
  );
  return { names, paid: Arr.reduce(logs, 0n, (sum, log) => sum + log.args.amount) };
});
