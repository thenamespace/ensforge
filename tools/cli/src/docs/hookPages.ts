import { Array as Arr, Record as Rec, String as Str } from "effect";

import { presetTarget } from "./actionPages.ts";
import { exportSection } from "./exportPages.ts";
import {
  code,
  examplesBlock,
  fence,
  firstSentence,
  kebab,
  type LinkResolver,
  page,
  plain,
  prose,
  table,
} from "./mdx.ts";
import type { ExportDoc } from "./model.ts";
import { tagValue } from "./sections.ts";

/** Where a React hook's page lives: `/docs/react/reference/hooks/use-address`. */
export const hookUrl = (hook: ExportDoc): string =>
  `/docs/react/reference/hooks/${kebab(hook.path)}`;

const capitalize = (text: string): string =>
  Str.toUpperCase(Str.slice(0, 1)(text)) + Str.slice(1)(text);

/** One hook: what it does, the action it wraps, its examples and signature. */
export const hookPage = (hook: ExportDoc, resolve: LinkResolver): string => {
  const target = presetTarget(hook.doc.summary);
  const action = target === undefined ? undefined : resolve(`Actions.${target}`);
  return page(
    {
      title: hook.path,
      description: plain(firstSentence(hook.doc.summary)),
      keywords: [hook.path, ...(target === undefined ? [] : [target])],
    },
    [
      `${capitalize(hook.stability)} · Since ${tagValue(hook.doc, "since") ?? "1.0.0"}`,
      prose(hook.doc.summary, resolve),
      target === undefined || action === undefined
        ? ""
        : `It wraps [${code(target)}](${action}): the same options, result and errors.`,
      hook.doc.whenToUse === "" ? "" : `## When to use\n\n${prose(hook.doc.whenToUse, resolve)}`,
      `## Usage\n\n${examplesBlock(hook.doc.examples)}`,
      `## Signature\n\n${fence("ts", hook.signature)}`,
      hook.doc.details === "" ? "" : `## Details\n\n${prose(hook.doc.details, resolve)}`,
      "See the [hook types](/docs/react/reference/hooks#types) for `ReadResult`, `WriteResult` and `ReadConfig`.",
    ],
  );
};

/** Every hook by `@category`, and the types the hooks take and return. */
export const hooksIndexPage = (
  hooks: readonly ExportDoc[],
  types: readonly ExportDoc[],
  resolve: LinkResolver,
): string =>
  page(
    {
      title: "Hooks",
      description: "Look up every React hook of @ensforge/react and the types they return.",
      keywords: Arr.map(hooks, (hook) => hook.path),
    },
    [
      "Generic hooks take any action; named hooks are presets of them for common actions. See [Read data](/docs/react/read-data) and [Write data](/docs/react/write-data).",
      ...Arr.map(
        Rec.toEntries(Arr.groupBy(hooks, (hook) => tagValue(hook.doc, "category") ?? "hooks")),
        ([category, entries]) =>
          `## ${capitalize(category)}\n\n${table(
            ["Hook", "Description"],
            Arr.map(entries, (hook) => [
              `[${code(hook.path)}](${hookUrl(hook)})`,
              prose(firstSentence(hook.doc.summary), resolve),
            ]),
          )}`,
      ),
      `## Types\n\n${Arr.join(
        Arr.map(types, (entry) => exportSection(entry, resolve)),
        "\n\n",
      )}`,
    ],
  );
