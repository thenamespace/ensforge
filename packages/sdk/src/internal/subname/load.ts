import { Effect, String as Str } from "effect";

import type { Client } from "../../client/types.js";
import { InvalidInputError } from "../../errors/classes/InvalidInputError.js";
import type { AnyError } from "../../errors/types.js";
import { loadName, type LoadedName } from "../name/load.js";
import { parseName } from "../name/normalize.js";
import { parentOf } from "../name/parts.js";
import { requireRegistered } from "../name/write.js";

/**
 * Where a child is created: in the parent's ENSv2 subregistry, under an unwrapped ENSv1 parent
 * in the ENS registry, or under a wrapped ENSv1 parent through the NameWrapper.
 */
export type SubnameRoute = "v2" | "v1" | "v1-wrapped";

/** A subname with its parent, both loaded in the same batched rounds. */
export type LoadedSubname = {
  readonly child: LoadedName;
  readonly parent: LoadedName;
  readonly label: string;
  readonly route: SubnameRoute;
};

/**
 * Loads a subname and its parent, which must be registered. `.eth` second-level names are not
 * subnames here: they are sold by the registrar (`registration.register`).
 */
export const loadSubname = Effect.fnUntraced(function* (
  client: Client,
  name: string,
): Effect.fn.Return<LoadedSubname, AnyError> {
  const parts = yield* parseName(name);
  const parentName = Str.includes(".")(parts.name) ? parentOf(parts.name) : "";
  if (parentName === "" || !Str.includes(".")(parentName)) {
    return yield* Effect.fail(
      new InvalidInputError({
        code: "INVALID_NAME",
        input: name,
        shortMessage: `${parts.name} is not a subname.`,
        hint: "Subnames have a parent such as `alice.eth`; register `.eth` names with registration.register.",
      }),
    );
  }

  const { child, parent } = yield* Effect.all(
    { child: loadName(client, parts.name), parent: loadName(client, parentName) },
    { concurrency: "unbounded" },
  );
  yield* requireRegistered(parent);

  const route: SubnameRoute =
    parent.state.protocol === "v2" ? "v2" : parent.state.wrapped ? "v1-wrapped" : "v1";
  return { child, parent, label: parts.label, route };
});
