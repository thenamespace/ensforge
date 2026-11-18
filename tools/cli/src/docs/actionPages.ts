import { Array as Arr, Formatter, Option, Order, String as Str } from "effect";

import { describe, keywordsFor } from "./descriptions.ts";
import {
  apiMeta,
  callout,
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
  tabs,
} from "./mdx.ts";
import type { Member } from "./members.ts";
import type { ActionDoc, Returns } from "./model.ts";
import { type ExampleResponse, exampleResponseSection } from "./responses.ts";
import { type DocExample, type DocSections, tagValue, tagValues, throwsOf } from "./sections.ts";
import { actionUrl, domainUrl, errorClassUrl, errorUrl, packageUrl } from "./urls.ts";

/** An action's path: `record.getAddress`, or `batch` for an action outside a domain. */
export const pathOf = (action: ActionDoc): string =>
  action.domain === "" ? action.name : `${action.domain}.${action.name}`;

/** What an action page links to beyond its own JSDoc. */
export type ActionLinks = {
  readonly resolve: LinkResolver;
  /** The React hook that wraps an action path, if any. */
  /** The recorded response of an action path, if one was recorded. */
  readonly responseOf?: (path: string) => ExampleResponse | undefined;
  readonly hookOf: (path: string) => { readonly name: string; readonly url: string } | undefined;
};

const sharedOptions: Record<string, { readonly label: string; readonly anchor: string }> = {
  Read: { label: "read options", anchor: "read-options" },
  Write: { label: "write options", anchor: "write-options" },
};

/** How an action's kind reads in badges and headings. */
export const kindLabel = (kind: ActionDoc["kind"]): string =>
  kind === "read" ? "Read" : kind === "write" ? "Write" : "Signs";

const isEffect = (example: DocExample) => /["']@ensforge\/[a-z-]+\/effect["']/.test(example.code);
const isStandalone = (example: DocExample) =>
  !isEffect(example) && /\bActions\./.test(example.code);

/** Client, Standalone and Effect tabs, by how each example calls the action. */
export const usageTabs = (examples: readonly DocExample[]): string =>
  tabs("api", [
    {
      label: "Client",
      body: examplesBlock(
        Arr.filter(examples, (example) => !isEffect(example) && !isStandalone(example)),
      ),
    },
    { label: "Standalone", body: examplesBlock(Arr.filter(examples, isStandalone)) },
    { label: "Effect", body: examplesBlock(Arr.filter(examples, isEffect)) },
  ]);

/** A members table: Option | Type | Default | Description. */
export const optionsTable = (members: readonly Member[], resolve: LinkResolver): string =>
  table(
    ["Option", "Type", "Default", "Description"],
    Arr.map(members, (member) => [
      `${code(member.name)}${member.optional ? "" : " (required)"}`,
      code(member.type),
      member.defaultValue === undefined
        ? ""
        : !Str.includes("`")(member.defaultValue) &&
            (/^[{["'\d]/.test(member.defaultValue) || !/\s/.test(member.defaultValue))
          ? code(member.defaultValue)
          : prose(member.defaultValue, resolve),
      prose(member.description, resolve),
    ]),
  );

/** A members table of a result: Field | Type | Description. */
export const fieldsTable = (members: readonly Member[], resolve: LinkResolver): string =>
  table(
    ["Field", "Type", "Description"],
    Arr.map(members, (member) => [
      `${code(member.name)}${member.optional ? " (optional)" : ""}`,
      code(member.type),
      prose(member.description, resolve),
    ]),
  );

const returnsBlock = (returns: Returns, resolve: LinkResolver): string =>
  Arr.join(
    Arr.filter(
      [
        `Resolves to ${code(returns.type)}.${returns.description === "" ? "" : ` ${prose(returns.description, resolve)}`}`,
        fieldsTable(returns.members, resolve),
      ],
      (block) => block !== "",
    ),
    "\n\n",
  );

/** The Errors table from `@throws`: class, codes linked to their pages, and when. */
export const errorsBlock = (
  doc: DocSections,
  kind: ActionDoc["kind"],
  resolve: LinkResolver,
): string => {
  const rows = Arr.map(tagValues(doc, "throws"), (value) => {
    const thrown = throwsOf(value);
    return [
      thrown.errorClass === ""
        ? ""
        : `[${code(thrown.errorClass)}](${errorClassUrl(thrown.errorClass)})`,
      Arr.join(
        Arr.map(thrown.codes, (errorCode) => `[${code(errorCode)}](${errorUrl(errorCode)})`),
        ", ",
      ),
      prose(Str.replace(/^(when|for|if)\s+/i, "")(thrown.when) || thrown.when, resolve),
    ];
  });
  const common =
    kind === "read"
      ? "It can also fail with the errors every read can (`Errors.CommonError`: `ConfigError`, `ContractRevertError`, `InternalError`, `NetworkError`)."
      : "It can also fail with the errors every write can (`Errors.WriteError`: the common errors plus `InsufficientFundsError`, `TransactionError`, `UnsupportedError`, `UserRejectedError`, `WalletError`).";
  return Arr.join(
    Arr.filter(
      [
        table(["Error", "Codes", "When"], rows),
        common,
        "See [How errors work](/docs/sdk/errors-explained).",
      ],
      (block) => block !== "",
    ),
    "\n\n",
  );
};

/** Bullets for `@see` tags: `{@link X} reason` or a URL. */
export const seeList = (doc: DocSections, resolve: LinkResolver): string =>
  Arr.join(
    Arr.map(tagValues(doc, "see"), (value) => {
      // MDX has no `<url>` autolinks.
      const url = /^https?:\/\/\S+/.exec(value)?.[0];
      return url === undefined
        ? `- ${prose(value, resolve)}`
        : `- [${url}](${url})${prose(Str.slice(url.length)(value), resolve)}`;
    }),
    "\n",
  );

const description = (action: ActionDoc): string =>
  describe(
    plain(firstSentence(action.doc.summary)),
    `Parameters, return value, errors and examples for ${pathOf(action)} in @ensforge/${action.root}.`,
    `Options, result, errors and examples for ${pathOf(action)}.`,
    `Options, errors and examples for ${pathOf(action)}.`,
    `Errors and examples for ${pathOf(action)}.`,
    "Includes examples.",
  );

/** One action page, following the generated action page template of the writers' guide. */
export const actionPage = (action: ActionDoc, links: ActionLinks): string => {
  const path = pathOf(action);
  const resolve: LinkResolver = (target) =>
    links.resolve(`Actions.${action.domain}.${target}`) ?? links.resolve(target);
  const hook = links.hookOf(path);
  const { variants, shared } = action.options;

  const parameters = Arr.join(
    Arr.filter(
      [
        variants.length > 1
          ? Arr.join(
              Arr.map(
                variants,
                (variant) =>
                  `With ${Arr.join(
                    Arr.map(
                      Arr.filter(variant, (member) => !member.optional),
                      (member) => code(member.name),
                    ),
                    " and ",
                  )}:\n\n${optionsTable(variant, resolve)}`,
              ),
              "\n\n",
            )
          : optionsTable(variants[0] ?? [], resolve),
        ...Arr.map(shared, (group) => {
          const entry = sharedOptions[group];
          return entry === undefined
            ? ""
            : `Also takes the [${entry.label}](${packageUrl("sdk")}/client#${entry.anchor}).`;
        }),
      ],
      (block) => block !== "",
    ),
    "\n\n",
  );

  const planMethods =
    action.planMethods.length === 0
      ? ""
      : Arr.join(
          [
            "## Plan methods",
            `Each method takes the same options as ${code(path)} and sends nothing. See [Preview before sending](/docs/sdk/preview-before-sending).`,
            table(
              ["Method", "Description"],
              Arr.map(action.planMethods, (method) => [
                code(`${path}.${method.name}(options)`),
                prose(method.description, resolve),
              ]),
            ),
          ],
          "\n\n",
        );

  const sync =
    action.sync === undefined
      ? ""
      : Arr.join(
          Arr.filter(
            [
              `## Wait for the receipt with ${code(action.sync.name)}`,
              prose(action.sync.doc.summary, resolve),
              prose(action.sync.doc.whenToUse, resolve),
              `${code(`${action.domain}.${action.sync.name}`)} takes the same options plus [${code("confirmations")} and ${code("timeout")}](${packageUrl("sdk")}/client#sync-options).`,
              returnsBlock(action.sync.returns, resolve),
              usageTabs(action.sync.doc.examples),
            ],
            (block) => block !== "",
          ),
          "\n\n",
        );

  const batch = action.batchable
    ? `${code(`${path}.request(options)`)} builds a deferred read for ${code("Actions.batch")}. See [Look up many at once](/docs/sdk/look-up-many-at-once).`
    : "";

  return page(
    {
      title: path,
      description: description(action),
      keywords: keywordsFor(
        [
          path,
          action.name,
          ...(action.sync === undefined ? [] : [action.sync.name]),
          `@ensforge/${action.root}`,
        ],
        action.domain,
      ),
    },
    [
      apiMeta({
        kind: kindLabel(action.kind),
        batchable: action.batchable,
        stability: tagValue(action.doc, "stability") ?? "stable",
        since: tagValue(action.doc, "since") ?? "1.0.0",
        source: sourceAttribute(action.source),
      }),
      ...(action.root === "hca"
        ? [
            callout(
              "info",
              "Experimental",
              "`@ensforge/hca` is experimental: its API can change in a minor release.",
            ),
          ]
        : []),
      prose(action.doc.summary, resolve),
      action.doc.whenToUse === ""
        ? ""
        : `## When to use\n\n${prose(action.doc.whenToUse, resolve)}`,
      action.doc.details === "" ? "" : `## Details\n\n${prose(action.doc.details, resolve)}`,
      action.doc.gotchas === ""
        ? ""
        : callout("warn", "Gotchas", prose(action.doc.gotchas, resolve)),
      Arr.join(
        Arr.filter(
          [
            "## Signature",
            action.signature === "" ? "" : fence("ts", action.signature),
            `Call it as ${code(`ens.${path}(options)`)} on a client, or ${code(`Actions.${path}(client, options)`)}.`,
            batch,
            hook === undefined ? "" : `In React, use [${code(hook.name)}](${hook.url}).`,
          ],
          (block) => block !== "",
        ),
        "\n\n",
      ),
      parameters === "" ? "## Parameters\n\nNone." : `## Parameters\n\n${parameters}`,
      `## Returns\n\n${returnsBlock(action.returns, resolve)}`,
      `## Errors\n\n${errorsBlock(action.doc, action.kind, resolve)}`,
      `## Examples\n\n${usageTabs(action.doc.examples)}`,
      Option.match(Option.fromUndefinedOr(links.responseOf?.(path)), {
        onNone: () => "",
        onSome: exampleResponseSection,
      }),
      planMethods,
      sync,
      tagValues(action.doc, "see").length === 0
        ? ""
        : `## See also\n\n${seeList(action.doc, resolve)}`,
    ],
  );
};

/** An action's row in a domain or package list: its name linked, and its first sentence. */
const actionRow = (action: ActionDoc, resolve: LinkResolver, name = action.name) => [
  `[${code(name)}](${actionUrl(action.root, action.domain, action.folder)})${action.batchable ? " (batchable)" : ""}`,
  prose(firstSentence(action.doc.summary), resolve),
];

/** The page of one domain, like a module page: counts, then its actions grouped by kind. */
export const domainPage = (
  root: string,
  domain: string,
  actions: readonly ActionDoc[],
  resolve: LinkResolver,
): string => {
  const byKind = Arr.groupBy(actions, (action) => kindLabel(action.kind));
  const counts = Arr.map(
    Arr.filter(["Read", "Write", "Signs"], (kind) => byKind[kind] !== undefined),
    (kind) => {
      const count = byKind[kind]?.length ?? 0;
      const noun = kind === "Read" ? "read" : kind === "Write" ? "write" : "signing";
      return `${count} ${noun}${count === 1 || kind === "Signs" ? "" : "s"}`;
    },
  );
  return page(
    {
      title: domain,
      description: describe(
        `List the ${actions.length} ${domain} action${actions.length === 1 ? "" : "s"} of @ensforge/${root} and whether each reads, writes or signs.`,
        ...Arr.map(
          Arr.makeBy(Math.min(actions.length, 8), (index) => 8 - index),
          (count) =>
            `Covers ${Arr.join(
              Arr.map(Arr.take(actions, count), (action) => action.name),
              ", ",
            )}.`,
        ),
      ),
      keywords: keywordsFor(
        [domain, `@ensforge/${root}`, ...Arr.map(actions, (action) => `${domain}.${action.name}`)],
        domain,
      ),
    },
    [
      apiMeta({
        summary: Arr.join(
          [`${actions.length} action${actions.length === 1 ? "" : "s"}`, ...counts],
          " · ",
        ),
        since:
          Arr.sort(
            Arr.map(actions, (action) => tagValue(action.doc, "since") ?? "1.0.0"),
            Order.String,
          )[0] ?? "1.0.0",
        source: `packages/${root}/src/actions/${domain}`,
      }),
      `Call them as ${code(`ens.${domain}.<action>(options)`)} on a client, or ${code(`Actions.${domain}.<action>(client, options)`)}.`,
      ...Arr.map(
        Arr.filter(["Read", "Write", "Signs"], (kind) => byKind[kind] !== undefined),
        (kind) =>
          `## ${kind === "Read" ? "Reads" : kind === "Write" ? "Writes" : "Signing"}\n\n${table(
            ["Action", "Description"],
            Arr.map(byKind[kind] ?? [], (action) => actionRow(action, resolve)),
          )}`,
      ),
    ],
  );
};

/** A package's reference home: counts, its other pages as cards, then every domain with its actions. */
export const actionsPackagePage = (options: {
  readonly root: string;
  readonly title: string;
  readonly packageName: string;
  readonly description: string;
  readonly intro: readonly string[];
  readonly pages: readonly {
    readonly title: string;
    readonly url: string;
    readonly description: string;
  }[];
  readonly domains: readonly { readonly domain: string; readonly actions: readonly ActionDoc[] }[];
  readonly resolve: LinkResolver;
}): string => {
  const count = Arr.reduce(options.domains, 0, (total, entry) => total + entry.actions.length);
  return page(
    {
      title: options.title,
      description: options.description,
      keywords: [options.packageName, ...Arr.map(options.domains, (entry) => entry.domain)],
    },
    [
      apiMeta({
        summary: `${count} actions · ${options.domains.length} domains`,
        since: "1.0.0",
        source: `packages/${options.root}/src`,
      }),
      ...options.intro,
      cards(options.pages),
      ...Arr.map(
        options.domains,
        ({ domain, actions }) =>
          `## [${domain}](${domainUrl(options.root, domain)})\n\n${table(
            ["Action", "Description"],
            Arr.map(actions, (action) => actionRow(action, options.resolve)),
          )}`,
      ),
    ],
  );
};

/** Fumadocs `<Cards>`, one `<Card>` per page. */
export const cards = (
  entries: readonly {
    readonly title: string;
    readonly url: string;
    readonly description: string;
  }[],
): string =>
  entries.length === 0
    ? ""
    : Arr.join(
        [
          "<Cards>",
          ...Arr.map(
            entries,
            (entry) =>
              `  <Card title={${Formatter.formatJson(entry.title)}} href="${entry.url}" description={${Formatter.formatJson(entry.description)}} />`,
          ),
          "</Cards>",
        ],
        "\n",
      );

/** The action path a React hook summary names as its preset (`Preset of `useRead(Actions.x.y, …)``). */
export const presetTarget = (summary: string): string | undefined =>
  Option.getOrUndefined(
    Option.map(
      Option.fromNullOr(
        /Preset of `use(?:Read|Write|InfiniteRead)\(Actions\.(\w+\.\w+)/.exec(summary),
      ),
      (match) => match[1] ?? "",
    ),
  );
