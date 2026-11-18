import { fileURLToPath } from "node:url";

import { NodeServices } from "@effect/platform-node";
import { assert, layer } from "@effect/vitest";
import { Array as Arr, Effect, Layer } from "effect";

import { brokenLinks, exportedPaths } from "@ensforge/tools/internal/lint-jsdoc/links";
import { Tools } from "@ensforge/tools/internal/services/Tools";
import { TypeScript } from "@ensforge/tools/internal/services/TypeScript";

const fixture = (file: string) =>
  fileURLToPath(new URL(`../fixtures/links/${file}`, import.meta.url));
const files = Arr.map(["index.ts", "lookup.ts", "guide.ts"], fixture);

layer(
  TypeScript.layer.pipe(Layer.provideMerge(Tools.layer), Layer.provideMerge(NodeServices.layer)),
)("{@link} checks", (it) => {
  it.effect("lists every dotted path the entries export, through namespaces", () =>
    Effect.gen(function* () {
      const project = yield* (yield* TypeScript).open(files);
      const paths = exportedPaths(project, [fixture("index.ts")]);

      assert.includeMembers(
        [...paths],
        ["Lookup", "Lookup.read", "Lookup.read.Options", "Lookup.ReadOptions"],
      );
    }).pipe(Effect.scoped),
  );

  it.effect("reports only links that resolve neither in scope nor through the exports", () =>
    Effect.gen(function* () {
      const project = yield* (yield* TypeScript).open(files);
      const exported = exportedPaths(project, [fixture("index.ts")]);

      assert.deepStrictEqual(brokenLinks(project, fixture("lookup.ts"), exported), [
        "broken {@link Missing}",
      ]);
      assert.deepStrictEqual(brokenLinks(project, fixture("guide.ts"), exported), [
        "broken {@link Lookup.write}",
      ]);
    }).pipe(Effect.scoped),
  );
});
