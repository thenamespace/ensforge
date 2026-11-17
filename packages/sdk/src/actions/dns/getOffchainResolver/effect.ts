import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import * as Action from "../../../internal/action/index.js";
import { parseDnsName } from "../../../internal/dns/name.js";
import {
  fetchTxtProof,
  gatewayUrls,
  offchainResolverFromTxt,
} from "../../../internal/dns/proof.js";
import type { getOffchainResolver as Promises } from "./index.js";

/** @internal Implementation of `Actions.dns.getOffchainResolver`. */
export const getOffchainResolver = Effect.fn("ensforge.dns.getOffchainResolver")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
  const parts = yield* parseDnsName(options.name);
  const urls = yield* gatewayUrls(client, options.gatewayUrls);
  const proof = yield* fetchTxtProof(client, parts.name, urls);
  return offchainResolverFromTxt(proof.txt);
}, Action.withContext("dns.getOffchainResolver"));
