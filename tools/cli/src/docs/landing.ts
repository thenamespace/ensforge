import { Array as Arr } from "effect";

import { pathOf } from "./actionPages.ts";
import { firstSentence, page, plain } from "./mdx.ts";
import type { ActionDoc, ErrorClassDoc, ExportDoc } from "./model.ts";
import { actionUrl, errorClassUrl, errorsUrl, errorUrl, hookUrl, packageUrl } from "./urls.ts";

type Domains = readonly { readonly domain: string; readonly actions: readonly ActionDoc[] }[];
type Card = { readonly title: string; readonly url: string; readonly description: string };

/**
 * The reference landing (`reference/index.mdx`, a `<ReferenceHome />`) and the data its package
 * cards and filter read (`src/content/reference.json`): one entry per package with its count,
 * one-line description and searchable items.
 */
export const referenceLanding = (input: {
  readonly sdkDomains: Domains;
  readonly sdkExtra: readonly ActionDoc[];
  readonly sdkPages: readonly Card[];
  readonly hooks: readonly ExportDoc[];
  readonly reactPages: readonly Card[];
  readonly hcaDomains: Domains;
  readonly hcaPages: readonly Card[];
  readonly contractPages: readonly Card[];
  readonly errorClasses: readonly ErrorClassDoc[];
}) => {
  const {
    sdkDomains,
    sdkExtra,
    sdkPages,
    hooks,
    reactPages,
    hcaDomains,
    hcaPages,
    contractPages,
    errorClasses,
  } = input;
  const sdkUrl = packageUrl("sdk");
  const reactUrl = packageUrl("react");
  const hcaUrl = packageUrl("hca");
  const contractsUrl = packageUrl("contracts");
  const errorCodes = Arr.flatMap(errorClasses, (errorClass) => errorClass.codes);
  const reference = {
    packages: [
      {
        slug: "sdk",
        name: "SDK",
        npm: "@ensforge/sdk",
        url: sdkUrl,
        count: Arr.reduce(
          sdkDomains,
          sdkExtra.length,
          (total, entry) => total + entry.actions.length,
        ),
        unit: "actions",
        description: "Every action by domain, plus the client, batching, utilities and indexers.",
        items: [
          ...Arr.map(sdkPages, (entry) => ({
            name: entry.title,
            url: entry.url,
            summary: entry.description,
          })),
          ...Arr.flatMap(sdkDomains, ({ actions }) =>
            Arr.map(actions, (action) => ({
              name: pathOf(action),
              url: actionUrl(action.root, action.domain, action.folder),
              summary: plain(firstSentence(action.doc.summary)),
            })),
          ),
        ],
      },
      {
        slug: "react",
        name: "React",
        npm: "@ensforge/react",
        url: reactUrl,
        count: hooks.length,
        unit: "hooks",
        description: "Hooks, the provider and boundaries, server prefetching and atoms.",
        items: [
          ...Arr.map(hooks, (hook) => ({
            name: hook.path,
            url: hookUrl(hook.path),
            summary: plain(firstSentence(hook.doc.summary)),
          })),
          ...Arr.map(reactPages, (entry) => ({
            name: entry.title,
            url: entry.url,
            summary: entry.description,
          })),
        ],
      },
      {
        slug: "hca",
        name: "HCA",
        npm: "@ensforge/hca",
        url: hcaUrl,
        count: Arr.reduce(hcaDomains, 0, (total, entry) => total + entry.actions.length),
        unit: "actions",
        description: "Hosted contract account actions and executors (experimental).",
        items: [
          ...Arr.flatMap(hcaDomains, ({ actions }) =>
            Arr.map(actions, (action) => ({
              name: pathOf(action),
              url: actionUrl(action.root, action.domain, action.folder),
              summary: plain(firstSentence(action.doc.summary)),
            })),
          ),
          ...Arr.map(hcaPages, (entry) => ({
            name: entry.title,
            url: entry.url,
            summary: entry.description,
          })),
        ],
      },
      {
        slug: "contracts",
        name: "Contracts",
        npm: "@ensforge/contracts",
        url: contractsUrl,
        count: contractPages.length,
        unit: "references",
        description: "ENS ABIs, addresses per chain, interface IDs and roles.",
        items: Arr.map(contractPages, (entry) => ({
          name: entry.title,
          url: entry.url,
          summary: entry.description,
        })),
      },
      {
        slug: "errors",
        name: "Errors",
        npm: null,
        url: errorsUrl,
        count: errorCodes.length,
        unit: "codes",
        description:
          "Every error code by class, with what happened, how to fix it and what to show users.",
        items: [
          ...Arr.map(errorClasses, (errorClass) => ({
            name: errorClass.name,
            url: errorClassUrl(errorClass.name),
            summary: plain(firstSentence(errorClass.summary)),
          })),
          ...Arr.map(errorCodes, (error) => ({
            name: error.code,
            url: errorUrl(error.code),
            summary: plain(error.shortMessage),
          })),
        ],
      },
    ],
  };

  return {
    data: reference,
    page: page(
      {
        title: "API reference",
        description:
          "Look up every action, hook, contract constant and error code of the ensforge packages, generated from their source and checked on each release.",
        keywords: ["API", "reference", ...Arr.map(reference.packages, (entry) => entry.name)],
      },
      ["<ReferenceHome />"],
    ),
  };
};
