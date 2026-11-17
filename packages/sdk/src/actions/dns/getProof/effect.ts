import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import * as Action from "../../../internal/action/index.js";
import { parseDnsName } from "../../../internal/dns/name.js";
import { fetchTxtProof, gatewayUrls } from "../../../internal/dns/proof.js";
import type { getProof as Promises } from "./index.js";

/** @internal Implementation of `Actions.dns.getProof`. */
export const getProof = Effect.fn("ensforge.dns.getProof")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
  const parts = yield* parseDnsName(options.name);
  const urls = yield* gatewayUrls(client, options.gatewayUrls);
  return yield* fetchTxtProof(client, `_ens.${parts.name}`, urls);
}, Action.withContext("dns.getProof"));
