import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import * as Action from "../../../internal/action/index.js";
import { parseDnsName } from "../../../internal/dns/name.js";
import { readDnsStatus } from "../../../internal/dns/status.js";
import type { getStatus as Promises } from "./index.js";

/** @internal Implementation of `Actions.dns.getStatus`. */
export const getStatus = Effect.fn("ensforge.dns.getStatus")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
  const parts = yield* parseDnsName(options.name);
  const { status } = yield* readDnsStatus(client, parts, options.gatewayUrls);
  return status;
}, Action.withContext("dns.getStatus"));
