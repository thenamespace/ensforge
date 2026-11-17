import { Console, Effect, FileSystem, Path } from "effect";
import { Command, Flag } from "effect/cli";

import { discover, type Layout } from "../codegen/discover.ts";
import {
  decorators,
  domainBarrel,
  effectBarrel,
  extensionProfile,
  requestsTable,
  sdkProfile,
  treeBarrel,
} from "../codegen/render.ts";
import { CheckFailed, SetupError } from "../errors.ts";
import { formatFiles } from "../services/Format.ts";
import { TypeScript } from "../services/TypeScript.ts";
import { Workspace } from "../services/Workspace.ts";

const sortedDirectories = Effect.fn("codegen.directories")(function* (folder: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const names: string[] = [];
  for (const name of yield* fs.readDirectory(folder)) {
    if ((yield* fs.stat(path.join(folder, name))).type === "Directory") names.push(name);
  }
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts a fresh array
  return names.sort();
});

/**
 * Generates the action barrels, the `Actions` trees (Promise and Effect) and the decorators from
 * `src/actions/<domain>/<action>/{index,effect}.ts`; with `check`, fails when they are stale.
 */
export const codegen = Effect.fn("codegen")(function* (check: boolean) {
  const workspace = yield* Workspace;
  const typescript = yield* TypeScript;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  if (workspace.config.codegen === undefined)
    return yield* new SetupError({
      message: `${workspace.name} has no "ensforge.codegen" setting.`,
    });
  const profile = workspace.config.codegen === "sdk" ? sdkProfile : extensionProfile;
  const actionsDir = path.join(workspace.packageDir, "src/actions");

  const layout: Layout[number][] = [];
  for (const domain of yield* sortedDirectories(actionsDir)) {
    const folders: { readonly folder: string; readonly files: readonly string[] }[] = [];
    for (const folder of yield* sortedDirectories(path.join(actionsDir, domain))) {
      folders.push({
        folder,
        files: yield* fs.readDirectory(path.join(actionsDir, domain, folder)),
      });
    }
    layout.push({ domain, folders });
  }
  const project = yield* typescript.open(
    layout.flatMap(({ domain, folders }) =>
      folders.flatMap(({ folder, files }) =>
        ["index.ts", "effect.ts"]
          .filter((file) => files.includes(file))
          .map((file) => path.join(actionsDir, domain, folder, file)),
      ),
    ),
  );
  const { domains, problems } = discover(project, actionsDir, layout);
  if (problems.length > 0) return yield* new CheckFailed({ check: "codegen", problems });

  const outputs = new Map<string, string>([
    ["src/actions/index.ts", treeBarrel(domains, "index", profile)],
    ["src/actions/effect.ts", treeBarrel(domains, "effect", profile)],
    ["src/actions/decorators.ts", decorators(domains, profile)],
    ...(profile.batch ? [["src/actions/requests.ts", requestsTable(domains)] as const] : []),
    ...domains.flatMap((entry) => [
      [`src/actions/${entry.domain}/index.ts`, domainBarrel(entry)] as const,
      [`src/actions/${entry.domain}/effect.ts`, effectBarrel(entry)] as const,
    ]),
  ]);

  // With `check`, format in a scratch copy so the comparison never touches src. It lives outside
  // node_modules, which oxfmt skips.
  const stage = check ? path.join(workspace.packageDir, ".codegen-check") : workspace.packageDir;
  for (const [file, text] of outputs) {
    yield* fs.makeDirectory(path.dirname(path.join(stage, file)), { recursive: true });
    yield* fs.writeFileString(path.join(stage, file), text);
  }
  yield* formatFiles([...outputs.keys()].map((file) => path.join(stage, file)));

  const actionCount = domains.flatMap((domain) => domain.actions).length;
  if (!check) return yield* Console.log(`codegen: wrote ${outputs.size} files`);

  const stale: string[] = [];
  for (const file of outputs.keys()) {
    const current = yield* fs
      .readFileString(path.join(workspace.packageDir, file))
      .pipe(Effect.orElseSucceed(() => ""));
    if (current !== (yield* fs.readFileString(path.join(stage, file)))) stale.push(file);
  }
  yield* fs.remove(stage, { recursive: true, force: true });
  if (stale.length > 0) {
    return yield* new CheckFailed({
      check: "codegen",
      problems: [...stale, "Generated files are stale; run `ensforge-dev codegen`."],
    });
  }
  yield* Console.log(`codegen: ok (${domains.length} domains, ${actionCount} actions)`);
}, Effect.scoped);

export const codegenCommand = Command.make(
  "codegen",
  {
    check: Flag.Boolean("check").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Fail when generated files are stale"),
    ),
  },
  ({ check }) => codegen(check),
).pipe(Command.withDescription("Generate the action barrels and decorators"));
