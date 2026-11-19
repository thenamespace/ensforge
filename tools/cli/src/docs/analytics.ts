/* oxlint-disable effecttsgo/prefer-effect-array, effecttsgo/prefer-effect-string -- synchronous text scanning of TypeScript source, where native string and array methods read more directly than curried Effect ones */
import { Effect, FileSystem, Path, String as Str } from "effect";

/** Event names declared in the `AnalyticsEvents` interface of `events.ts`. */
export const declaredEvents = (source: string): string[] => {
  const body = /interface AnalyticsEvents \{([\s\S]*?)\n\}/.exec(source)?.[1] ?? "";
  return [...body.matchAll(/^ {2}([a-z][a-z0-9_]*)\??:/gm)].map((match) => match[1] ?? "");
};

/** Event names passed to `track(...)`, including both branches of a conditional name. */
export const trackedEvents = (source: string): string[] =>
  [...source.matchAll(/\btrack\(\s*([^,]+),/g)].flatMap((call) =>
    [...(call[1] ?? "").matchAll(/"([a-z][a-z0-9_]*)"/g)].map((name) => name[1] ?? ""),
  );

/**
 * Events the docs site declares but never sends: a dashboard built on one would stay empty.
 * `track` itself only accepts declared names, so the other direction is the type checker's.
 */
export const unsentAnalyticsEvents = Effect.fn("docs.unsentAnalyticsEvents")(function* (
  root: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const src = path.join(root, "apps/docs/src");

  const catalogue = yield* fs.readFileString(path.join(src, "lib/analytics/events.ts"));
  const sent = new Set<string>();
  for (const file of yield* fs.readDirectory(src, { recursive: true })) {
    if (!/\.tsx?$/.test(file)) continue;
    const source = yield* fs.readFileString(path.join(src, file));
    for (const name of trackedEvents(source)) sent.add(name);
  }

  return declaredEvents(catalogue).filter((name) => !sent.has(name) && !Str.isEmpty(name));
});
