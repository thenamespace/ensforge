import { Array as Arr, Effect, FileSystem, Path, Record as Rec, String as Str } from "effect";

import { actionLayout } from "../commands/codegen.ts";
import { SetupError } from "../errors.ts";
import { TypeScript } from "../services/TypeScript.ts";
import {
  actionPage,
  actionsIndexPage,
  actionUrl,
  domainPage,
  pathOf,
  presetTarget,
} from "./actionPages.ts";
import { actionDocs } from "./actions.ts";
import { contractsReference, recordOf } from "./contractPages.ts";
import { errorCodePage, errorsIndexPage } from "./errorPages.ts";
import { errorClassDocs, type ErrorRuntime } from "./errors.ts";
import { anchorOf, exportsPage } from "./exportPages.ts";
import { exportDocs } from "./exports.ts";
import { hookPage, hooksIndexPage, hookUrl } from "./hookPages.ts";
import { kebab, type LinkResolver, meta } from "./mdx.ts";
import type { ActionDoc, ExportDoc, Thrower } from "./model.ts";
import { tagValues, throwsOf } from "./sections.ts";

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
 * Every generated reference page, keyed by its path under `apps/docs/content/docs`: SDK and HCA
 * actions, error codes, React hooks and the export references of each package. Reads the
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

  const clientUrl = "/docs/sdk/reference/client";
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
  register("/docs/sdk/reference/utilities", [
    ...Arr.flatMap(utilityGroups, (group) => group.entries),
    ...errorHelpers,
  ]);
  register(
    "/docs/sdk/reference/indexers",
    Arr.flatMap(indexerGroups, (group) => group.entries),
  );
  register("/docs/react/reference/components", components);
  register("/docs/react/reference/hooks", hookTypes);
  register("/docs/react/reference/atoms", atomsExports);
  register("/docs/react/reference/server", serverExports);
  register("/docs/hca/reference/executors", executorEntries);
  for (const hook of hooks) links.set(hook.path, hookUrl(hook));
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
      return hook === undefined ? undefined : { name: hook.path, url: hookUrl(hook) };
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
    for (const error of errorClass.codes) links.set(error.code, `/docs/sdk/errors/${error.code}`);

  const pages = new Map<string, string>();

  // SDK and HCA actions.
  const writeActions = (
    docsRoot: string,
    packageName: string,
    domains: readonly { readonly domain: string; readonly actions: readonly ActionDoc[] }[],
    extra: readonly ActionDoc[],
  ) => {
    const base = `${docsRoot}/reference/actions`;
    pages.set(
      `${base}/index.mdx`,
      actionsIndexPage(docsRoot, packageName, domains, resolve, extra),
    );
    pages.set(
      `${base}/meta.json`,
      meta({
        title: "Actions",
        pages: [
          "index",
          ...Arr.map(extra, (action) => kebab(action.folder)),
          ...Arr.map(domains, (entry) => kebab(entry.domain)),
        ],
      }),
    );
    for (const action of extra)
      pages.set(`${base}/${kebab(action.folder)}.mdx`, actionPage(action, actionLinks));
    for (const { domain, actions } of domains) {
      const folder = `${base}/${kebab(domain)}`;
      pages.set(`${folder}/index.mdx`, domainPage(domain, actions, resolve));
      pages.set(
        `${folder}/meta.json`,
        meta({
          title: domain,
          pages: ["index", ...Arr.map(actions, (action) => kebab(action.folder))],
        }),
      );
      for (const action of actions)
        pages.set(`${folder}/${kebab(action.folder)}.mdx`, actionPage(action, actionLinks));
    }
  };
  writeActions(
    "sdk",
    "@ensforge/sdk",
    sdkActions.domains,
    Arr.flatMap(batchAction.domains, (entry) => entry.actions),
  );
  writeActions("hca", "@ensforge/hca", hcaActions.domains, []);

  // SDK reference pages.
  pages.set(
    "sdk/reference/meta.json",
    meta({
      title: "Reference",
      pages: [
        "actions",
        "client",
        "utilities",
        "indexers",
        "entry-points",
        "known-limitations",
        "glossary",
      ],
    }),
  );
  pages.set(
    "sdk/reference/client.mdx",
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
    "sdk/reference/utilities.mdx",
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
    "sdk/reference/indexers.mdx",
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
  pages.set("sdk/errors/index.mdx", errorsIndexPage(errorClasses, resolve));
  pages.set("sdk/errors/meta.json", meta({ title: "Errors", pages: ["index"] }));
  for (const errorClass of errorClasses)
    for (const error of errorClass.codes)
      pages.set(
        `sdk/errors/${error.code}.mdx`,
        errorCodePage(error, errorClass, throwers.get(error.code) ?? [], resolve),
      );

  // React.
  pages.set(
    "react/reference/meta.json",
    meta({ title: "Reference", pages: ["hooks", "components", "server", "atoms"] }),
  );
  pages.set(
    "react/reference/hooks/meta.json",
    meta({ title: "Hooks", pages: ["index", ...Arr.map(hooks, (hook) => kebab(hook.path))] }),
  );
  pages.set("react/reference/hooks/index.mdx", hooksIndexPage(hooks, hookTypes, resolve));
  for (const hook of hooks)
    pages.set(`react/reference/hooks/${kebab(hook.path)}.mdx`, hookPage(hook, resolve));
  pages.set(
    "react/reference/components.mdx",
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
    "react/reference/server.mdx",
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
    "react/reference/atoms.mdx",
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
  pages.set(
    "hca/reference/meta.json",
    meta({ title: "Reference", pages: ["actions", "executors"] }),
  );
  pages.set(
    "hca/reference/executors.mdx",
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
  for (const [file, text] of contractsReference(
    contractsRuntime,
    contractExports,
    entryPoints,
    resolve,
  ))
    pages.set(file, text);

  return pages;
}, Effect.scoped);
