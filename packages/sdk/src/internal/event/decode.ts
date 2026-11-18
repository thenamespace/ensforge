import { Abis } from "@ensforge/contracts";
import { parseEventLogs, type Log } from "viem";

import type { Event } from "../../actions/event/types.js";
import { categorize, nameOf, nodeOf, protocolOf, type KnownContracts } from "./classify.js";

/**
 * Normalizes the ENS events among `logs`. Logs that are not ENS events (token transfers, other
 * contracts) are skipped; `name` fills in the name when the caller knows it (a name's history).
 */
export const decodeLogs = (known: KnownContracts, logs: readonly Log[], name?: string): Event[] => {
  const events: Event[] = [];
  // `strict` drops logs whose indexed layout differs, e.g. ERC-20 transfers sharing a topic.
  for (const log of parseEventLogs({ abi: Abis.shared.events, logs: [...logs], strict: true })) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- decoded log args are keyed by parameter name
    const args = (log.args ?? {}) as Readonly<Record<string, unknown>>;
    const kind = categorize(known, log.eventName, args);
    if (kind === undefined || log.blockNumber === null || log.transactionHash === null) continue;

    events.push({
      ...kind,
      event: log.eventName,
      protocol: protocolOf(known, log.eventName, log.address),
      contract: log.address,
      name: nameOf(known, log.eventName, log.address, args) ?? name ?? null,
      node: nodeOf(args),
      args,
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
      logIndex: log.logIndex ?? 0,
    });
  }
  return events;
};
