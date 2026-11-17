import { fileURLToPath } from "node:url";

import { NodeServices } from "@effect/platform-node";
import { assert, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { brokenLinks, exportedPaths } from "../../../src/lint-jsdoc/links.ts";
import { Tools } from "../../../src/services/Tools.ts";
import { TypeScript } from "../../../src/services/TypeScript.ts";

const fixture = (file: string) =>
  fileURLToPath(new URL(`../../fixtures/links/${file}`, import.meta.url));
const files = ["index.ts", "lookup.ts", "guide.ts"].map(fixture);

const services = TypeScript.layer.pipe(
  Layer.provideMerge(Tools.layer),
  Layer.provideMerge(NodeServices.layer),
);

layer(services)("{@link} checks", (it) => {
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
