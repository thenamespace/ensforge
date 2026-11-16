import { Effect } from "effect";

import { NameError } from "../../errors/name-error.js";
import { analyzeName } from "../../names/analyze.js";
import type { NormalizedName } from "../../schemas/name.js";

export const getSecondLevelEthLabel = Effect.fn("getSecondLevelEthLabel")(function* (
  name: NormalizedName,
) {
  const analysis = analyzeName(name);
  const label = analysis.isSecondLevelEth ? analysis.label : undefined;

  if (label === undefined) {
    return yield* new NameError({
      code: "INVALID_NAME",
      message: "Registration and renewal require a second-level .eth name",
    });
  }

  return label;
});
