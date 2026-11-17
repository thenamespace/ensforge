import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { bytesToHex, keccak256 } from "viem";
import { packetToBytes } from "viem/ens";

import type { Client } from "../../../client/types.js";
import * as Action from "../../../internal/action/index.js";
import { loadName } from "../../../internal/name/load.js";
import { blockAt } from "../../../internal/rpc/block.js";
import * as Rpc from "../../../internal/rpc/index.js";
import type { getRecords as Promises } from "./index.js";

/** @internal Implementation of `Actions.dns.getRecords`. */
export const getRecords = Effect.fn("ensforge.dns.getRecords")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
  const block = blockAt(options);
  const loaded = yield* loadName(client, options.name, block);
  const { resolver } = loaded.state;
  const queries = options.records ?? [];
  if (resolver === null) {
    return {
      resolver: null,
      zonehash: null,
      records: queries.map(({ name, type }) => ({ name, type, data: null })),
    };
  }

  const { node } = loaded.data.parts;
  // Resolvers without the DNS profiles revert, and empty bytes are no record: both read as missing.
  const { zonehash, records } = yield* Effect.all(
    {
      zonehash: Rpc.readContractOrUndefined(client, {
        address: resolver,
        abi: Abis.shared.dnsZoneResolver,
        functionName: "zonehash",
        args: [node],
        ...block,
      }),
      records: Effect.forEach(
        queries,
        (query) =>
          Rpc.readContractOrUndefined(client, {
            address: resolver,
            abi: Abis.shared.dnsRecordResolver,
            functionName: "dnsRecord",
            // DNS owner names are case-insensitive and stored by the hash of their wire form.
            args: [
              node,
              keccak256(bytesToHex(packetToBytes(query.name.toLowerCase()))),
              query.type,
            ],
            ...block,
          }).pipe(
            Effect.map((data) => ({
              name: query.name,
              type: query.type,
              data: data === undefined || data === "0x" ? null : data,
            })),
          ),
        { concurrency: "unbounded" },
      ),
    },
    { concurrency: "unbounded" },
  );

  return {
    resolver,
    zonehash: zonehash === undefined || zonehash === "0x" ? null : zonehash,
    records,
  };
}, Action.withContext("dns.getRecords"));
