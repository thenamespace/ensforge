import { Schema } from "effect";

import { EnsNetworkIdSchema } from "../config/network.js";

export class IndexerUnavailableError extends Schema.TaggedError<IndexerUnavailableError>()(
  "IndexerUnavailableError",
  {
    code: Schema.Literal("SOURCE_UNAVAILABLE"),
    message: Schema.String,
    network: EnsNetworkIdSchema,
    protocol: Schema.Literals(["v1", "v2"]),
  },
) {}
