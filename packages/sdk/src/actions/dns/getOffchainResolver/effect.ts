import { Effect, Option } from "effect";

import { Abis } from "@ensforge/contracts";
import { decodeFunctionResult, encodeFunctionData, isAddress } from "viem";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { nonZeroAddress } from "../../../internal/address.js";
import { parseDnsName } from "../../../internal/dns/name.js";
import {
  fetchTxtProof,
  gatewayUrls,
  offchainResolversFromTxt,
  txtRecords,
} from "../../../internal/dns/proof.js";
import * as Rpc from "../../../internal/rpc/index.js";
import { namehash } from "../../../utils/Name.js";
import type { OffchainResolver } from "../types.js";
import type { getOffchainResolver as Promises } from "./index.js";

/**
 * Whether an `ENS1` resolver is an address, or an ENS name whose `addr` record is one. Names that
 * do not resolve are skipped, as the DNS TLD resolver skips them; RPC failures still fail.
 */
const isUsable = (
  client: Client,
  { resolver }: OffchainResolver,
): Effect.Effect<boolean, AnyError> =>
  isAddress(resolver, { strict: false })
    ? Effect.succeed(true)
    : Effect.try({ try: () => namehash(resolver), catch: (error) => error as AnyError }).pipe(
        Effect.flatMap((node) =>
          Rpc.resolve(client, {
            name: resolver,
            data: encodeFunctionData({
              abi: Abis.shared.addrResolver,
              functionName: "addr",
              args: [node],
            }),
          }),
        ),
        // The DNS TLD resolver takes only a 32-byte answer.
        Effect.map(
          ({ data }) =>
            data.length === 66 &&
            nonZeroAddress(
              decodeFunctionResult({ abi: Abis.shared.addrResolver, functionName: "addr", data }),
            ) !== null,
        ),
        Effect.catchIf(
          (error) => error._tag !== "NetworkError",
          () => Effect.succeed(false),
        ),
      );

/** @internal Implementation of `Actions.dns.getOffchainResolver`. */
export const getOffchainResolver = Effect.fn("ensforge.dns.getOffchainResolver")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, AnyError> {
  const parts = yield* parseDnsName(options.name);
  const urls = yield* gatewayUrls(client, options.gatewayUrls);
  const proof = yield* fetchTxtProof(client, parts.name, urls);

  // Like the DNS TLD resolver, the first record whose resolver can be used wins.
  const candidates = offchainResolversFromTxt(txtRecords(proof));
  const found = yield* Effect.findFirst(candidates, (candidate) => isUsable(client, candidate));
  return Option.getOrNull(found);
}, Action.withContext("dns.getOffchainResolver"));
