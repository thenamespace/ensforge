import { fileURLToPath } from "node:url";

import { NodeServices } from "@effect/platform-node";
import { assert, layer } from "@effect/vitest";
import { Array as Arr, Effect, Layer, pipe, String as Str } from "effect";

import { untaggedExports } from "@ensforge/tools/internal/lint-jsdoc/stability";
import { Tools } from "@ensforge/tools/internal/services/Tools";
import { TypeScript } from "@ensforge/tools/internal/services/TypeScript";

const fixture = (file: string) =>
  fileURLToPath(new URL(`../fixtures/stability/${file}`, import.meta.url));

layer(
  TypeScript.layer.pipe(Layer.provideMerge(Tools.layer), Layer.provideMerge(NodeServices.layer)),
)("@stability checks", (it) => {
  it.effect("reports every export reachable from the entries without a valid tag", () =>
    Effect.gen(function* () {
      const project = yield* (yield* TypeScript).open(
        Arr.map(["index.ts", "lookup.ts", "untagged.ts", "external.ts"], fixture),
      );
      const problems = untaggedExports(project, [{ name: "pkg", source: fixture("index.ts") }]);

      assert.sameDeepMembers(
        Arr.map(problems, ([file, message]) => [
          pipe(file, Str.split("/"), Arr.lastNonEmpty),
          message,
        ]),
        [
          [
            "index.ts",
            "Untagged (from pkg) has no @stability tag (stable, experimental, unstable)",
          ],
          [
            "lookup.ts",
            "Lookup.missing (from pkg) has no @stability tag (stable, experimental, unstable)",
          ],
          [
            "lookup.ts",
            "Lookup.Query.Untagged (from pkg) has no @stability tag (stable, experimental, unstable)",
          ],
          [
            "lookup.ts",
            "Lookup.unknownStage (from pkg) has `@stability beta`; use stable, experimental, unstable",
          ],
          [
            "lookup.ts",
            "unknownStage (from pkg) has `@stability beta`; use stable, experimental, unstable",
          ],
        ],
      );
    }).pipe(Effect.scoped),
  );
});
