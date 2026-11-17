import { Effect } from "effect";

import type { NameKind, NameState } from "../../actions/name/get/types.js";
import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { Read } from "../../Types.js";
import { classify } from "./classify.js";
import { parseName } from "./normalize.js";
import { readName, type NameData } from "./read.js";
import { toNameState } from "./state.js";

/** A name's raw data, classification and public state, as write planners need them. */
export type LoadedName = {
  readonly data: NameData;
  readonly kind: NameKind;
  readonly state: NameState;
};

/** Normalizes, reads and classifies a name. */
export const loadName = Effect.fnUntraced(function* (
  client: Client,
  name: string,
  block: Read.BlockOptions = {},
): Effect.fn.Return<LoadedName, AnyError> {
  const parts = yield* parseName(name);
  const data = yield* readName(client, parts, block);
  const kind = classify(data, {
    graveyard: client.deployment.v2?.migration.graveyard,
    nameWrapper: client.deployment.v1?.contracts.nameWrapper,
  });

  return { data, kind, state: toNameState(data, kind) };
});
