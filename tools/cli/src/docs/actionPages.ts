import { Array as Arr, Option, String as Str } from "effect";

import {
  callout,
  code,
  examplesBlock,
  firstSentence,
  kebab,
  type LinkResolver,
  page,
  plain,
  prose,
  table,
  tabs,
} from "./mdx.ts";
import type { Member } from "./members.ts";
import type { ActionDoc, Returns } from "./model.ts";
import { type DocExample, type DocSections, tagValue, tagValues, throwsOf } from "./sections.ts";

/** Where an action's page lives: `/docs/sdk/reference/actions/primary-name/get`. */
export const actionUrl = (root: string, domain: string, folder: string): string =>
  `/docs/${root}/reference/actions/${domain === "" ? "" : `${kebab(domain)}/`}${kebab(folder)}`;

/** An action's path: `record.getAddress`, or `batch` for an action outside a domain. */
export const pathOf = (action: ActionDoc): string =>
  action.domain === "" ? action.name : `${action.domain}.${action.name}`;

/** What an action page links to beyond its own JSDoc. */
export type ActionLinks = {
  readonly resolve: LinkResolver;
  /** The React hook that wraps an action path, if any. */
  readonly hookOf: (path: string) => { readonly name: string; readonly url: string } | undefined;
};

const sharedOptions: Record<string, { readonly label: string; readonly anchor: string }> = {
  Read: { label: "read options", anchor: "read-options" },
  Write: { label: "write options", anchor: "write-options" },
};

const capitalize = (text: string): string =>
  Str.toUpperCase(Str.slice(0, 1)(text)) + Str.slice(1)(text);

/** The badges line: read or write, batchable, stability, since. */
export const badges = (action: ActionDoc): string =>
  Arr.join(
    [
      action.kind === "read" ? "**Read**" : action.kind === "write" ? "**Write**" : "**Signs**",
      ...(action.batchable ? ["Batchable"] : []),
      capitalize(tagValue(action.doc, "stability") ?? "stable"),
      `Since ${tagValue(action.doc, "since") ?? "1.0.0"}`,
    ],
    " · ",
  );

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
        : `[${code(thrown.errorClass)}](/docs/sdk/errors#${Str.toLowerCase(thrown.errorClass)})`,
      Arr.join(
        Arr.map(thrown.codes, (errorCode) => `[${code(errorCode)}](/docs/sdk/errors/${errorCode})`),
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

const description = (doc: DocSections): string => plain(firstSentence(doc.summary));

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
            : `Also takes the [${entry.label}](/docs/sdk/reference/client#${entry.anchor}).`;
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
              `${code(`${action.domain}.${action.sync.name}`)} takes the same options plus [${code("confirmations")} and ${code("timeout")}](/docs/sdk/reference/client#sync-options).`,
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
      description: description(action.doc),
      keywords: [action.name, path, ...(action.sync === undefined ? [] : [action.sync.name])],
    },
    [
      badges(action),
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
      `## Usage\n\n${usageTabs(action.doc.examples)}`,
      batch,
      hook === undefined ? "" : `In React, use [${code(hook.name)}](${hook.url}).`,
      parameters === "" ? "## Parameters\n\nNone." : `## Parameters\n\n${parameters}`,
      `## Returns\n\n${returnsBlock(action.returns, resolve)}`,
      `## Errors\n\n${errorsBlock(action.doc, action.kind, resolve)}`,
      planMethods,
      sync,
      action.doc.details === "" ? "" : `## Details\n\n${prose(action.doc.details, resolve)}`,
      action.doc.gotchas === ""
        ? ""
        : callout("warn", "Gotchas", prose(action.doc.gotchas, resolve)),
      tagValues(action.doc, "see").length === 0
        ? ""
        : `## Related\n\n${seeList(action.doc, resolve)}`,
    ],
  );
};

/** A table of actions: Action | Kind | Description. */
export const actionsTable = (actions: readonly ActionDoc[], resolve: LinkResolver): string =>
  table(
    ["Action", "Kind", "Description"],
    Arr.map(actions, (action) => [
      `[${code(pathOf(action))}](${actionUrl(action.root, action.domain, action.folder)})`,
      `${action.kind === "read" ? "Read" : action.kind === "write" ? "Write" : "Signs"}${action.batchable ? ", batchable" : ""}`,
      prose(firstSentence(action.doc.summary), resolve),
    ]),
  );

/** The page of one domain: a table of its actions. */
export const domainPage = (
  domain: string,
  actions: readonly ActionDoc[],
  resolve: LinkResolver,
): string =>
  page(
    {
      title: domain,
      description: `List every ${domain} action, what it does and whether it reads or writes.`,
      keywords: [domain, ...Arr.map(actions, (action) => `${domain}.${action.name}`)],
    },
    [
      `Call them as ${code(`ens.${domain}.<action>(options)`)} on a client, or ${code(`Actions.${domain}.<action>(client, options)`)}.`,
      actionsTable(actions, resolve),
    ],
  );

/** The overview of every domain of a package. */
export const actionsIndexPage = (
  root: string,
  packageName: string,
  domains: readonly { readonly domain: string; readonly actions: readonly ActionDoc[] }[],
  resolve: LinkResolver,
  ungrouped: readonly ActionDoc[] = [],
): string =>
  page(
    {
      title: "Actions",
      description: `Browse every action of ${packageName}, by domain.`,
      keywords: Arr.map(domains, (entry) => entry.domain),
    },
    [
      `Every action of ${code(packageName)}, by domain. Each page lists its options, result, errors and examples.`,
      ungrouped.length === 0 ? "" : actionsTable(ungrouped, resolve),
      ...Arr.map(
        domains,
        ({ domain, actions }) =>
          `## [${domain}](/docs/${root}/reference/actions/${kebab(domain)})\n\n${actionsTable(actions, resolve)}`,
      ),
    ],
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
