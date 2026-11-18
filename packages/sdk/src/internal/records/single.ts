import { Effect } from "effect";

import type { Selection } from "../../actions/record/get/types.js";
import type { Client } from "../../client/types.js";
import { NotFoundError } from "../../errors/classes/NotFoundError.js";
import type { AnyError } from "../../errors/types.js";
import type { Read } from "../../Types.js";
import { readRecords, type ReadRecords } from "./read.js";

/**
 * Reads one record and picks it from the result; `strict` turns a missing record into
 * `NotFoundError` (`RECORD_NOT_FOUND`).
 */
export const readSingleRecord = <value>(
  client: Client,
  options: {
    readonly name: string;
    readonly selection: Selection;
    readonly resource: string;
  } & Pick<Read.Options, "blockNumber" | "blockTag" | "gatewayUrls" | "strict">,
  pick: (records: ReadRecords) => value | null,
): Effect.Effect<value | null, AnyError> =>
  readRecords(client, options).pipe(
    Effect.flatMap((records) => {
      const value = pick(records);
      return value === null && options.strict === true
        ? Effect.fail(new NotFoundError({ code: "RECORD_NOT_FOUND", resource: options.resource }))
        : Effect.succeed(value);
    }),
  );
