import { Array as Arr, Record as Rec, String as Str } from "effect";

import { cards, presetTarget } from "./actionPages.ts";
import { describe, keywordsFor } from "./descriptions.ts";
import { exportSection } from "./exportPages.ts";
import {
  apiMeta,
  code,
  examplesBlock,
  fence,
  firstSentence,
  type LinkResolver,
  page,
  plain,
  prose,
  sourceAttribute,
  table,
} from "./mdx.ts";
import type { ExportDoc } from "./model.ts";
import { tagValue } from "./sections.ts";
import { hookUrl, packageUrl } from "./urls.ts";

const capitalize = (text: string): string =>
  Str.toUpperCase(Str.slice(0, 1)(text)) + Str.slice(1)(text);

/** A hook's `@category` (`named reads`, `reads`, …), the heading it is listed under. */
export const hookCategory = (hook: ExportDoc): string =>
  capitalize(tagValue(hook.doc, "category") ?? "hooks");

/** One hook, in the order of an action page: what it does, its signature, then examples. */
export const hookPage = (hook: ExportDoc, resolve: LinkResolver): string => {
  const target = presetTarget(hook.doc.summary);
  const action = target === undefined ? undefined : resolve(`Actions.${target}`);
  const category = tagValue(hook.doc, "category") ?? "";
  return page(
    {
      title: hook.path,
      description: describe(
        plain(firstSentence(hook.doc.summary)),
        `Signature, options, result and examples for ${hook.path} in @ensforge/react.`,
        `Signature, result and examples for ${hook.path}.`,
        "Includes examples.",
      ),
      keywords: keywordsFor(
        [hook.path, "@ensforge/react", "React hook", ...(target === undefined ? [] : [target])],
        target === undefined ? undefined : Str.split(target, ".")[0],
      ),
    },
    [
      apiMeta({
        kind: Str.includes("write")(category)
          ? "Write hook"
          : Str.includes("read")(category)
            ? "Read hook"
            : "Hook",
        stability: hook.stability,
        since: tagValue(hook.doc, "since") ?? "1.0.0",
        source: sourceAttribute(hook.source),
      }),
      prose(hook.doc.summary, resolve),
      target === undefined || action === undefined
        ? ""
        : `It wraps [${code(target)}](${action}): the same options, result and errors.`,
      hook.doc.whenToUse === "" ? "" : `## When to use\n\n${prose(hook.doc.whenToUse, resolve)}`,
      hook.doc.details === "" ? "" : `## Details\n\n${prose(hook.doc.details, resolve)}`,
      `## Signature\n\n${fence("ts", hook.signature)}`,
      `## Examples\n\n${examplesBlock(hook.doc.examples)}`,
      `## See also\n\n- The [hook types](${packageUrl("react")}#types): \`ReadResult\`, \`WriteResult\` and \`ReadConfig\`.`,
    ],
  );
};

/** The React reference home: its other pages, every hook by `@category`, and the hook types. */
export const reactPackagePage = (
  hooks: readonly ExportDoc[],
  types: readonly ExportDoc[],
  pages: readonly { readonly title: string; readonly url: string; readonly description: string }[],
  resolve: LinkResolver,
): string =>
  page(
    {
      title: "React",
      description:
        "Look up every hook, component, server helper and atom of @ensforge/react, and the types the hooks take and return, with examples.",
      keywords: Arr.map(hooks, (hook) => hook.path),
    },
    [
      apiMeta({ summary: `${hooks.length} hooks`, since: "1.0.0", source: "packages/react/src" }),
      "Generic hooks take any action; named hooks are presets of them for common actions. See [Read data](/docs/react/read-data) and [Write data](/docs/react/write-data).",
      cards(pages),
      ...Arr.map(
        Rec.toEntries(Arr.groupBy(hooks, hookCategory)),
        ([category, entries]) =>
          `## ${category}\n\n${table(
            ["Hook", "Description"],
            Arr.map(entries, (hook) => [
              `[${code(hook.path)}](${hookUrl(hook.path)})`,
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
