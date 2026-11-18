import {
  Array as Arr,
  Effect,
  FileSystem,
  Formatter,
  Path,
  Record as Rec,
  String as Str,
} from "effect";

import { actionLayout } from "../commands/codegen.ts";
import { SetupError } from "../errors.ts";
import { TypeScript } from "../services/TypeScript.ts";
import {
  actionPage,
  actionsPackagePage,
  cards,
  domainPage,
  pathOf,
  presetTarget,
} from "./actionPages.ts";
import { actionDocs } from "./actions.ts";
import { contractsReference, recordOf } from "./contractPages.ts";
import { errorClassPage, errorCodePage, errorsIndexPage } from "./errorPages.ts";
import { errorClassDocs, type ErrorRuntime } from "./errors.ts";
import { anchorOf, exportsPage } from "./exportPages.ts";
import { exportDocs } from "./exports.ts";
import { hookCategory, hookPage, reactPackagePage } from "./hookPages.ts";
import { referenceLanding } from "./landing.ts";
import {
  apiMeta,
  callout,
  firstSentence,
  kebab,
  type LinkResolver,
  meta,
  page,
  plain,
} from "./mdx.ts";
import type { ActionDoc, ExportDoc, Thrower } from "./model.ts";
import { tagValues, throwsOf } from "./sections.ts";
import { actionUrl, errorUrl, hookUrl, packageUrl } from "./urls.ts";

const load = (file: string) =>
  Effect.tryPromise({
    try: (): Promise<Record<string, unknown>> => import(new URL(`file://${file}`).href),
    catch: (cause) =>
      SetupError.make({
        message: `${file}: ${String(cause)}. Build the packages first (pnpm build).`,
      }),
  });

const startsWith = (exports: readonly ExportDoc[], ...prefixes: readonly string[]) =>
  Arr.filter(exports, (entry) =>
    Arr.some(prefixes, (prefix) => Str.startsWith(prefix)(entry.path)),
  );

const named = (exports: readonly ExportDoc[], ...paths: readonly string[]) =>
  Arr.filter(exports, (entry) => paths.includes(entry.path));

/**
 * Every generated file, keyed by its path under `apps/docs`: the reference pages under
 * `content/docs/reference` (SDK and HCA actions, error classes and codes, React hooks and the
 * export references of each package) and `src/content/reference.json`, the counts and items the
 * reference landing page shows. Reads the
 * packages' sources with the TypeScript checker and their built modules for runtime values
 * (error copy, addresses, constants), so the packages must be built.
 */
export const docsSite = Effect.fn("docs.site")(function* (root: string) {
  const typescript = yield* TypeScript;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const pkg = (name: string, file: string) => path.join(root, "packages", name, file);

  const sdkRuntime = yield* load(pkg("sdk", "dist/index.js"));
  const hcaRuntime = yield* load(pkg("hca", "dist/index.js"));
  const contractsRuntime = yield* load(pkg("contracts", "dist/index.js"));

  const sdkLayout = yield* actionLayout(pkg("sdk", "src/actions"));
  const hcaLayout = yield* actionLayout(pkg("hca", "src/actions"));
  const errorFiles = (name: string) =>
    Effect.map(fs.readDirectory(pkg(name, "src/errors/classes")), (files) =>
      Arr.map(
        Arr.filter(files, (file) => file !== "index.ts"),
        (file) => pkg(name, `src/errors/classes/${file}`),
      ),
    );
  const sdkErrorFiles = yield* errorFiles("sdk");
  const hcaErrorFiles = yield* errorFiles("hca");

  const entryFiles = {
    sdk: pkg("sdk", "src/index.ts"),
    sdkEffect: pkg("sdk", "src/effect.ts"),
    sdkIndexer: pkg("sdk", "src/indexer/index.ts"),
    sdkWagmi: pkg("sdk", "src/wagmi/index.ts"),
    hca: pkg("hca", "src/index.ts"),
    react: pkg("react", "src/index.ts"),
    reactAtoms: pkg("react", "src/atoms/index.ts"),
    reactServer: pkg("react", "src/server/index.ts"),
    contracts: pkg("contracts", "src/index.ts"),
  };
  const contractEntries = [
    [".", pkg("contracts", "src/index.ts")],
    ["./shared", pkg("contracts", "src/shared/index.ts")],
    ["./v1", pkg("contracts", "src/v1/index.ts")],
    ["./v2", pkg("contracts", "src/v2/index.ts")],
    ["./v2/experimental/hca", pkg("contracts", "src/v2/experimental/hca/index.ts")],
  ] as const;
  const actionFiles = (name: string, layout: typeof sdkLayout) =>
    Arr.flatMap(layout, ({ domain, folders }) =>
      Arr.flatMap(folders, ({ folder }) => [
        pkg(name, `src/actions/${domain}/${folder}/index.ts`),
        pkg(name, `src/actions/${domain}/${folder}/effect.ts`),
      ]),
    );

  const project = yield* typescript.open([
    ...actionFiles("sdk", sdkLayout),
    ...actionFiles("hca", hcaLayout),
    pkg("sdk", "src/batch/index.ts"),
    pkg("sdk", "src/batch/effect.ts"),
    ...sdkErrorFiles,
    ...hcaErrorFiles,
    ...Rec.values(entryFiles),
    ...Arr.map(contractEntries, ([, file]) => file),
  ]);

  // Actions
  const sdkActions = actionDocs(project, "sdk", pkg("sdk", "src/actions"), sdkLayout);
  const batchAction = actionDocs(project, "sdk", pkg("sdk", "src"), [
    { domain: "", folders: [{ folder: "batch", files: ["index.ts", "effect.ts"] }] },
  ]);
  const hcaActions = actionDocs(project, "hca", pkg("hca", "src/actions"), hcaLayout);
  const problems = [...sdkActions.problems, ...batchAction.problems, ...hcaActions.problems];
  if (problems.length > 0) return yield* SetupError.make({ message: Arr.join(problems, "\n") });
  const allActions: readonly ActionDoc[] = Arr.flatMap(
    [...sdkActions.domains, ...batchAction.domains, ...hcaActions.domains],
    (entry) => entry.actions,
  );

  // Exports
  const sdkExports = exportDocs(project, entryFiles.sdk);
  const effectExports = exportDocs(project, entryFiles.sdkEffect);
  const wagmiExports = exportDocs(project, entryFiles.sdkWagmi);
  const indexerExports = exportDocs(project, entryFiles.sdkIndexer);
  const hcaExports = exportDocs(project, entryFiles.hca);
  const reactExports = exportDocs(project, entryFiles.react);
  const atomsExports = exportDocs(project, entryFiles.reactAtoms);
  const serverExports = exportDocs(project, entryFiles.reactServer);
  const contractExports = exportDocs(project, entryFiles.contracts);

  const sdkUrl = packageUrl("sdk");
  const reactUrl = packageUrl("react");
  const hcaUrl = packageUrl("hca");
  const contractsUrl = packageUrl("contracts");
  const clientUrl = `${sdkUrl}/client`;
  const clientGroups = [
    {
      heading: "Create a client",
      entries: [
        ...startsWith(sdkExports, "Ensforge."),
        ...named(wagmiExports, "Ensforge.fromWagmi", "Ensforge.fromWagmi.Options"),
        ...named(effectExports, "Ensforge.layer", "Ensforge.Ensforge"),
      ],
    },
    {
      heading: "Action groups",
      intro:
        "Decorators add action groups to a client: `Ensforge.create(options).extend(ensActions())`.",
      entries: Arr.filter(sdkExports, (entry) =>
        /^[a-z]\w*Actions$|^[A-Z]\w*Actions$/.test(entry.path),
      ),
    },
    { heading: "Read options", entries: startsWith(sdkExports, "Read.") },
    {
      heading: "Write options",
      entries: Arr.filter(
        startsWith(sdkExports, "Write."),
        (entry) => !["Write.SyncOptions", "Write.SyncResult", "Write.Result"].includes(entry.path),
      ),
    },
    { heading: "Write results", entries: named(sdkExports, "Write.Result") },
    {
      heading: "Sync options",
      entries: named(sdkExports, "Write.SyncOptions", "Write.SyncResult"),
    },
    { heading: "Requests", entries: named(sdkExports, "Request") },
    { heading: "Plans", entries: startsWith(sdkExports, "Plan") },
  ];
  const utilityGroups = Arr.map(
    ["Name", "CoinType", "ContentHash", "Duration", "Fuse", "Role"],
    (namespace) => ({ heading: namespace, entries: startsWith(sdkExports, `${namespace}.`) }),
  );
  const errorHelpers = Arr.filter(
    startsWith(sdkExports, "Errors."),
    (entry) => entry.kind !== "class" && !/Error\.\w+$/.test(entry.path),
  );
  const indexerGroups = [
    {
      heading: "Indexers",
      entries: Arr.filter(
        indexerExports,
        (entry) => entry.kind === "function" || entry.kind === "const",
      ),
    },
    { heading: "Queries", entries: startsWith(indexerExports, "Query.") },
    {
      heading: "Types",
      entries: Arr.filter(
        indexerExports,
        (entry) =>
          entry.kind !== "function" &&
          entry.kind !== "const" &&
          !Str.startsWith("Query.")(entry.path),
      ),
    },
  ];
  const hooks = Arr.filter(
    reactExports,
    (entry) =>
      /^use[A-Z]/.test(entry.path) && (entry.kind === "function" || entry.kind === "const"),
  );
  const components = named(
    reactExports,
    "EnsforgeProvider",
    "EnsforgeProviderProps",
    "ReadErrorResetBoundary",
    "ReadErrorResetBoundaryProps",
    "HydrationBoundary",
  );
  const atomPaths = new Set(Arr.map(atomsExports, (entry) => entry.path));
  const hookTypes = Arr.filter(
    reactExports,
    (entry) =>
      !hooks.includes(entry) &&
      !components.includes(entry) &&
      !atomPaths.has(entry.path) &&
      (entry.kind === "type" || entry.kind === "interface"),
  );
  const executorEntries = Arr.filter(
    hcaExports,
    (entry) => !Str.startsWith("Actions.")(entry.path) && !Str.startsWith("HcaError")(entry.path),
  );

  // Links: every action, and every export section, by the name `{@link}` uses.
  const links = new Map<string, string>();
  for (const action of allActions) {
    const url = actionUrl(action.root, action.domain, action.folder);
    links.set(`Actions.${pathOf(action)}`, url);
    if (action.sync !== undefined)
      links.set(
        `Actions.${action.domain}.${action.sync.name}`,
        `${url}#${anchorOf(`Wait for the receipt with ${action.sync.name}`)}`,
      );
  }
  const register = (url: string, entries: readonly ExportDoc[]) => {
    for (const entry of entries)
      if (!links.has(entry.path)) links.set(entry.path, `${url}#${anchorOf(entry.path)}`);
  };
  register(
    clientUrl,
    Arr.flatMap(clientGroups, (group) => group.entries),
  );
  register(`${sdkUrl}/utilities`, [
    ...Arr.flatMap(utilityGroups, (group) => group.entries),
    ...errorHelpers,
  ]);
  register(
    `${sdkUrl}/indexers`,
    Arr.flatMap(indexerGroups, (group) => group.entries),
  );
  register(`${reactUrl}/components`, components);
  register(reactUrl, hookTypes);
  register(`${reactUrl}/atoms`, atomsExports);
  register(`${reactUrl}/server`, serverExports);
  register(`${hcaUrl}/executors`, executorEntries);
  for (const hook of hooks) links.set(hook.path, hookUrl(hook.path));
  const resolve: LinkResolver = (target) =>
    links.get(target) ?? links.get(Str.replace(/^Actions\./, "")(target));

  const presets = new Map(
    Arr.flatMap(hooks, (hook) => {
      const target = presetTarget(hook.doc.summary);
      return target === undefined ? [] : [[target, hook] as const];
    }),
  );
  const actionLinks = {
    resolve,
    hookOf: (actionPath: string) => {
      const hook = presets.get(actionPath);
      return hook === undefined ? undefined : { name: hook.path, url: hookUrl(hook.path) };
    },
  };

  // Errors.
  const describe = recordOf(sdkRuntime["Errors"])["describe"];
  const runtime = (classes: Readonly<Record<string, unknown>>): ErrorRuntime => ({
    classes,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `Errors.describe` of the built sdk
    describe: describe as ErrorRuntime["describe"],
  });
  const errorClasses = [
    ...errorClassDocs(
      Arr.map(sdkErrorFiles, (file) => project.sourceFile(file)),
      "sdk",
      runtime(recordOf(sdkRuntime["Errors"])),
    ),
    ...errorClassDocs(
      Arr.map(hcaErrorFiles, (file) => project.sourceFile(file)),
      "hca",
      runtime(hcaRuntime),
    ),
  ];
  for (const errorClass of errorClasses)
    for (const error of errorClass.codes) links.set(error.code, errorUrl(error.code));

  // Pages, keyed by their path under `content/docs/reference`.
  const pages = new Map<string, string>();
  const sdkDomains = sdkActions.domains;
  const sdkExtra = Arr.flatMap(batchAction.domains, (entry) => entry.actions);
  const hcaDomains = hcaActions.domains;

  pages.set(
    "meta.json",
    meta({
      title: "Reference",
      description: "API reference of every package",
      root: "reference",
      pages: [
        "index",
        "sdk",
        "react",
        "hca",
        "contracts",
        "errors",
        "---[intro]More---",
        "entry-points",
        "known-limitations",
        "glossary",
      ],
    }),
  );

  // SDK and HCA actions.
  const writeDomains = (
    packageRoot: string,
    domains: readonly { readonly domain: string; readonly actions: readonly ActionDoc[] }[],
  ) => {
    for (const { domain, actions } of domains) {
      pages.set(
        `${packageRoot}/${kebab(domain)}/index.mdx`,
        domainPage(packageRoot, domain, actions, resolve),
      );
      pages.set(
        `${packageRoot}/${kebab(domain)}/meta.json`,
        meta({
          title: domain,
          pages: ["index", ...Arr.map(actions, (action) => kebab(action.folder))],
        }),
      );
      for (const action of actions)
        pages.set(
          `${packageRoot}/${kebab(domain)}/${kebab(action.folder)}.mdx`,
          actionPage(action, actionLinks),
        );
    }
  };
  writeDomains("sdk", sdkDomains);
  writeDomains("hca", hcaDomains);
  for (const action of sdkExtra)
    pages.set(`sdk/${kebab(action.folder)}.mdx`, actionPage(action, actionLinks));

  // SDK.
  const sdkPages = [
    {
      title: "Client",
      url: clientUrl,
      description: "Ensforge.create, the action groups, and the read, write and plan option types.",
    },
    ...Arr.map(sdkExtra, (action) => ({
      title: pathOf(action),
      url: actionUrl(action.root, action.domain, action.folder),
      description: plain(firstSentence(action.doc.summary)),
    })),
    {
      title: "Utilities",
      url: `${sdkUrl}/utilities`,
      description: "Name, coin type, content hash, duration, fuse, role and error helpers.",
    },
    {
      title: "Indexers",
      url: `${sdkUrl}/indexers`,
      description: "The indexers, query options and result types of @ensforge/sdk/indexer.",
    },
  ];
  pages.set(
    "sdk/meta.json",
    meta({
      title: "SDK",
      icon: "code",
      pages: [
        "index",
        "client",
        ...Arr.map(sdkExtra, (action) => kebab(action.folder)),
        "utilities",
        "indexers",
        "---Domains---",
        ...Arr.map(sdkDomains, (entry) => kebab(entry.domain)),
      ],
    }),
  );
  pages.set(
    "sdk/index.mdx",
    actionsPackagePage({
      root: "sdk",
      title: "SDK",
      packageName: "@ensforge/sdk",
      description:
        "Browse every action of @ensforge/sdk by domain, with the client, batching, utilities and indexers it exports.",
      intro: [
        "Every action of `@ensforge/sdk`, by domain. Each page lists its signature, options, result, errors and examples.",
      ],
      pages: sdkPages,
      domains: sdkDomains,
      resolve,
    }),
  );
  pages.set(
    "sdk/client.mdx",
    exportsPage(
      {
        title: "Client",
        description:
          "Look up the options of Ensforge.create, the action groups, and the read, write and plan types.",
      },
      "The client, its options and the option and result types every action shares. See [Create a client](/docs/sdk/create-a-client).",
      clientGroups,
      resolve,
    ),
  );
  pages.set(
    "sdk/utilities.mdx",
    exportsPage(
      {
        title: "Utilities",
        description:
          "Look up the name, coin type, content hash, duration, fuse, role and error helpers.",
      },
      "Helpers exported from `@ensforge/sdk` (and the same from `@ensforge/sdk/effect`).",
      [...utilityGroups, { heading: "Errors", entries: errorHelpers }],
      resolve,
    ),
  );
  pages.set(
    "sdk/indexers.mdx",
    exportsPage(
      {
        title: "Indexers",
        description:
          "Look up the indexers, query options and result types of @ensforge/sdk/indexer.",
      },
      "Exports of `@ensforge/sdk/indexer`. See [Connect an indexer](/docs/sdk/connect-an-indexer).",
      indexerGroups,
      resolve,
    ),
  );

  // Errors.
  const throwers = new Map<string, Thrower[]>();
  for (const action of allActions) {
    for (const doc of [action.doc, ...(action.sync === undefined ? [] : [action.sync.doc])]) {
      for (const value of tagValues(doc, "throws")) {
        const thrown = throwsOf(value);
        for (const errorCode of thrown.codes) {
          const list = throwers.get(errorCode) ?? [];
          const actionPath = pathOf(action);
          if (!Arr.some(list, (entry) => entry.path === actionPath))
            list.push({
              path: actionPath,
              url: actionUrl(action.root, action.domain, action.folder),
              when: thrown.when,
            });
          throwers.set(errorCode, list);
        }
      }
    }
  }
  pages.set("errors/index.mdx", errorsIndexPage(errorClasses, resolve));
  pages.set(
    "errors/meta.json",
    meta({
      title: "Errors",
      icon: "errors",
      pages: ["index", ...Arr.map(errorClasses, (errorClass) => `(${kebab(errorClass.name)})`)],
    }),
  );
  for (const errorClass of errorClasses) {
    // A route group keeps codes at `/errors/<CODE>` while the sidebar groups them by class.
    const folder = `errors/(${kebab(errorClass.name)})`;
    pages.set(
      `${folder}/meta.json`,
      meta({
        title: errorClass.name,
        pagesIndex: kebab(errorClass.name),
        pages: Arr.map(errorClass.codes, (error) => error.code),
      }),
    );
    pages.set(`${folder}/${kebab(errorClass.name)}.mdx`, errorClassPage(errorClass, resolve));
    for (const error of errorClass.codes)
      pages.set(
        `${folder}/${error.code}.mdx`,
        errorCodePage(error, errorClass, throwers.get(error.code) ?? [], resolve),
      );
  }

  // React.
  const reactPages = [
    {
      title: "Components",
      url: `${reactUrl}/components`,
      description: "EnsforgeProvider and the read error and hydration boundaries.",
    },
    {
      title: "Server",
      url: `${reactUrl}/server`,
      description: "Prefetch reads on the server with @ensforge/react/server.",
    },
    {
      title: "Atoms",
      url: `${reactUrl}/atoms`,
      description: "The atom layer of @ensforge/react/atoms that the hooks are built on.",
    },
  ];
  const hookCategories = Arr.groupBy(hooks, hookCategory);
  pages.set(
    "react/meta.json",
    meta({
      title: "React",
      icon: "react",
      pages: ["index", "(hooks)", "components", "server", "atoms"],
    }),
  );
  // Hooks sit at `/react/<hook>`; the route group only makes them a folder in the sidebar.
  pages.set(
    "react/(hooks)/meta.json",
    meta({
      title: "Hooks",
      pages: Arr.flatMap(Rec.toEntries(hookCategories), ([category, entries]) => [
        `---${category}---`,
        ...Arr.map(entries, (hook) => kebab(hook.path)),
      ]),
    }),
  );
  pages.set("react/index.mdx", reactPackagePage(hooks, hookTypes, reactPages, resolve));
  for (const hook of hooks)
    pages.set(`react/(hooks)/${kebab(hook.path)}.mdx`, hookPage(hook, resolve));
  pages.set(
    "react/components.mdx",
    exportsPage(
      {
        title: "Components",
        description: "Look up the provider and boundary components of @ensforge/react.",
      },
      "Components exported from `@ensforge/react`. See [Set up the provider](/docs/react/set-up-the-provider).",
      [{ heading: "Components", entries: components }],
      resolve,
    ),
  );
  pages.set(
    "react/server.mdx",
    exportsPage(
      {
        title: "Server",
        description: "Look up the server rendering helpers of @ensforge/react/server.",
      },
      "Exports of `@ensforge/react/server`, for prefetching reads on the server.",
      [{ heading: "Exports", entries: serverExports }],
      resolve,
    ),
  );
  pages.set(
    "react/atoms.mdx",
    exportsPage(
      {
        title: "Atoms",
        description: "Look up the atom layer of @ensforge/react/atoms that the hooks are built on.",
      },
      "Exports of `@ensforge/react/atoms`. See [Atoms](/docs/react/atoms).",
      [{ heading: "Exports", entries: atomsExports }],
      resolve,
    ),
  );

  // HCA.
  const hcaPages = [
    {
      title: "Executors",
      url: `${hcaUrl}/executors`,
      description: "The HCA route, the executors and their options.",
    },
  ];
  pages.set(
    "hca/meta.json",
    meta({
      title: "HCA",
      icon: "plug",
      pages: [
        "index",
        "executors",
        "---Domains---",
        ...Arr.map(hcaDomains, (entry) => kebab(entry.domain)),
      ],
    }),
  );
  pages.set(
    "hca/index.mdx",
    actionsPackagePage({
      root: "hca",
      title: "HCA",
      packageName: "@ensforge/hca",
      description:
        "Browse every action of @ensforge/hca by domain, and the route and executors that send HCA calls.",
      intro: [
        callout(
          "info",
          "Experimental",
          "`@ensforge/hca` is experimental: its API can change in a minor release.",
        ),
        "Every action of `@ensforge/hca`, by domain, and the executors that send them.",
      ],
      pages: hcaPages,
      domains: hcaDomains,
      resolve,
    }),
  );
  pages.set(
    "hca/executors.mdx",
    exportsPage(
      {
        title: "Executors",
        description: "Look up the HCA route, the executors and their options in @ensforge/hca.",
      },
      "Exports of `@ensforge/hca` besides its actions and `HcaError`. `@ensforge/hca` is experimental.",
      [
        {
          heading: "Route and executors",
          entries: Arr.filter(
            executorEntries,
            (entry) => entry.kind === "function" || entry.kind === "const",
          ),
        },
        {
          heading: "Types",
          entries: Arr.filter(
            executorEntries,
            (entry) => entry.kind !== "function" && entry.kind !== "const",
          ),
        },
      ],
      resolve,
    ),
  );

  // Contracts.
  const entryPoints = Arr.map(contractEntries, ([subpath, file]) => ({
    subpath,
    names: [
      ...new Set(
        Arr.map(exportDocs(project, file), (entry) => Str.split(entry.path, ".")[0] ?? entry.path),
      ),
    ],
  }));
  const contractPages = [
    {
      title: "ABIs",
      url: `${contractsUrl}/abis`,
      description: "Every ENS contract ABI, by protocol version.",
    },
    {
      title: "Deployments",
      url: `${contractsUrl}/deployments`,
      description: "Contract addresses per chain and their capability flags.",
    },
    {
      title: "Interface IDs",
      url: `${contractsUrl}/interface-ids`,
      description: "ERC-165 interface IDs of registries, resolvers and profiles.",
    },
    { title: "Roles", url: `${contractsUrl}/roles`, description: "ENSv2 role bitmaps." },
    {
      title: "Entry points",
      url: `${contractsUrl}/entry-points`,
      description: "What each import path of @ensforge/contracts exports.",
    },
  ];
  for (const [file, text] of contractsReference(
    contractsRuntime,
    contractExports,
    entryPoints,
    resolve,
  ))
    pages.set(Str.replace(/^reference\//, "")(file), text);
  pages.set(
    "contracts/index.mdx",
    page(
      {
        title: "Contracts",
        description:
          "Look up the ENS ABIs, contract addresses per chain, interface IDs and roles that @ensforge/contracts exports.",
        keywords: ["@ensforge/contracts", "Abis", "Deployments", "InterfaceIds", "Roles"],
      },
      [
        apiMeta({
          summary: `${contractPages.length} references`,
          since: "1.0.0",
          source: "packages/contracts/src",
        }),
        "Runtime-neutral ENS ABIs, addresses and constants, with no dependency on the SDK.",
        cards(contractPages),
      ],
    ),
  );

  const landing = referenceLanding({
    sdkDomains,
    sdkExtra,
    sdkPages,
    hooks,
    reactPages,
    hcaDomains,
    hcaPages,
    contractPages,
    errorClasses,
  });
  pages.set("index.mdx", landing.page);

  return new Map<string, string>([
    ...Arr.map([...pages], ([file, text]) => [`content/docs/reference/${file}`, text] as const),
    [
      "src/content/reference.json",
      `${Formatter.formatJson(landing.data, { space: 2 })}\n`,
    ] as const,
  ]);
}, Effect.scoped);
