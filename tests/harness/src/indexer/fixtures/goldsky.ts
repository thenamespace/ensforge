import { getAddress, namehash } from "viem";

import type { Fixtures } from "../routes.js";
import { bigname, chainStatus, status } from "./bigname.js";
import type * as Wire from "./types.js";

// Goldsky serves bigname's routes under `/v2` with fewer fields: no snapshot tokens, no
// `/resolvers`, and it indexes Basenames on Base (8453).

export const jesse = getAddress("0x849151d7d0bf1f34b70d5cad5149d28cc2308bf1");

const baseAsOf: Wire.AsOf = {
  block_number: 22_000_000,
  block_hash: `0x${"cd".repeat(32)}`,
  timestamp: "1730000100",
};

export const goldskyMeta: Wire.Meta = {
  as_of: {
    "1": { block_number: 21_000_000, block_hash: `0x${"ab".repeat(32)}`, timestamp: "1730000000" },
    "8453": baseAsOf,
  },
  completeness: "full",
};

export const jesseName: Wire.NameRecord = {
  name: "jesse.base.eth",
  display_name: "jesse.base.eth",
  namespace: "basenames",
  namehash: namehash("jesse.base.eth"),
  status: "active",
  read_status: "ok",
  owner: jesse.toLowerCase(),
  expires_at: "1756000000",
};

export const basenamesNamespace: Wire.NamespaceData = {
  namespace: "basenames",
  capabilities: { subnames: { completeness: "partial" } },
  networks: [
    { network: "mainnet", chain_id: 1 },
    { network: "base", chain_id: 8453 },
  ],
};

export const goldsky: Fixtures = {
  ...bigname,
  "/status": () => ({
    data: {
      ...status,
      chains: {
        "1": chainStatus,
        "8453": { ...chainStatus, safe_block: null, finalized_block: null },
      },
    },
  }),
  "/namespaces/{namespace}": (request) =>
    request.params.namespace === "basenames"
      ? { data: basenamesNamespace }
      : bigname["/namespaces/{namespace}"]?.(request),
  "/names/{name}": (request) =>
    request.params.name === "jesse.base.eth"
      ? { data: jesseName, meta: goldskyMeta }
      : bigname["/names/{name}"]?.(request),
};
