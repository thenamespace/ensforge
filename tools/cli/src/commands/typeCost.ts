import { Console, Effect, FileSystem, Path, Record as Rec, String as Str } from "effect";
import { Command, Flag } from "effect/cli";

import { overBudget, readBudgets, writeBudgets } from "../budgets.ts";
import { CheckFailed, ToolFailed } from "../errors.ts";
import { baseCompilerOptions, TypeScript } from "../services/TypeScript.ts";
import { Workspace } from "../services/Workspace.ts";

const viemClient = `import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";`;

const reads = `export const state = await ens.name.get({ name: "nick.eth" });
export const records = await ens.record.get({ name: "nick.eth", texts: ["url"], addresses: ["eth", "btc"] });
export const primary = await ens.primaryName.get({ address: "0xb8c2C29ee19D8307cb7255e1Cd9CbDE883A267d5" });
export const sent = await ens.record.set({ name: "nick.eth", texts: { url: "https://ens.domains" } });`;

// What typical apps write, type-checked against the built `.d.ts` of the package that would
// install them. Instantiations count what an app's type checker does for ensforge's types.
export const scenarios: Readonly<Record<string, readonly [pkg: string, source: string]>> = {
  "sdk: Ensforge client, viem client in a variable": [
    "sdk",
    `import { Ensforge, ensActions } from "@ensforge/sdk";
${viemClient}
const publicClient = createPublicClient({ chain: mainnet, transport: http() });
const ens = Ensforge.create({ publicClient }).extend(ensActions());
${reads}`,
  ],
  "sdk: Ensforge client, viem client created inline": [
    "sdk",
    `import { Ensforge, ensActions } from "@ensforge/sdk";
${viemClient}
const ens = Ensforge.create({
  publicClient: createPublicClient({ chain: mainnet, transport: http() }),
}).extend(ensActions());
${reads}`,
  ],
  "sdk: Actions with a viem client": [
    "sdk",
    `import { Actions } from "@ensforge/sdk";
${viemClient}
const client = createPublicClient({ chain: mainnet, transport: http() });
export const state = await Actions.name.get(client, { name: "nick.eth" });
export const records = await Actions.record.get(client, { name: "nick.eth", texts: ["url"], addresses: ["eth"] });`,
  ],
  "sdk/effect: Actions in Effect.gen": [
    "sdk",
    `import { Effect } from "effect";
import { Actions, Ensforge } from "@ensforge/sdk/effect";
${viemClient}
const ens = Ensforge.create({ publicClient: createPublicClient({ chain: mainnet, transport: http() }) });
export const program = Effect.gen(function* () {
  const state = yield* Actions.name.get(ens, { name: "nick.eth" });
  const records = yield* Actions.record.get(ens, { name: "nick.eth", texts: ["url"], addresses: ["eth"] });
  return [state, records] as const;
});`,
  ],
  "react: useName and useAddress": [
    "react",
    `import { useAddress, useName } from "@ensforge/react";
export const useProfile = (name: string) => [useName({ name }), useAddress({ name })] as const;`,
  ],
  "hca: hcaActions() and hca()": [
    "hca",
    `import { hca, hcaActions } from "@ensforge/hca";
import { Ensforge, ensActions } from "@ensforge/sdk";
${viemClient}
const publicClient = createPublicClient({ chain: mainnet, transport: http() });
const ens = Ensforge.create({ publicClient }).extend(ensActions()).extend(hcaActions());
export const account = await ens.hca.get();
export const migrated = await ens.migration.migrateSync({ names: ["alice.eth"], via: hca() });`,
  ],
};

/**
 * Type instantiations `tsc` makes to check `source`, a file in `folder` that resolves imports as
 * an app there would (built `.d.ts`, published exports).
 */
export const measure = Effect.fn("typeCost.measure")(function* (folder: string, source: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const typescript = yield* TypeScript;
  yield* fs.remove(folder, { recursive: true, force: true });
  yield* fs.makeDirectory(folder, { recursive: true });
  const probe = path.join(folder, "probe.ts");
  yield* fs.writeFileString(probe, source);

  const config = yield* typescript.writeConfig(folder, {
    compilerOptions: { ...baseCompilerOptions, types: [] },
    files: [probe],
  });
  const output = yield* typescript.tsc(
    ["-p", config, "--extendedDiagnostics", "--pretty", "false"],
    {
      cwd: folder,
    },
  );
  const instantiations = /Instantiations:\s+(\d+)/.exec(output)?.[1];
  if (instantiations === undefined)
    return yield* ToolFailed.make({ tool: "tsc --extendedDiagnostics", output });
  return Number(instantiations);
});

/**
 * Type-checks each scenario and compares its instantiations with `.config/type-budgets.json` (5%
 * growth allowed); `write` records the current counts instead.
 */
export const typeCost = Effect.fn("typeCost")(function* (write: boolean) {
  const workspace = yield* Workspace;
  const path = yield* Path.Path;
  const budgets = write ? {} : yield* readBudgets(workspace.root, "type-budgets.json");

  const counts = yield* Effect.forEach(
    Rec.toEntries(scenarios),
    ([name, [pkg, source]], index) =>
      measure(
        path.join(workspace.root, "packages", pkg, `node_modules/.cache/type-cost/${index}`),
        source,
      ).pipe(Effect.map((count) => [name, count] as const)),
    { concurrency: "unbounded" },
  );

  for (const [name, count] of counts)
    yield* Console.log(`${Str.padStart(9)(String(count))}  ${name}`);
  if (write) {
    yield* writeBudgets(workspace.root, "type-budgets.json", counts);
    return yield* Console.log("type-cost: budgets written");
  }

  const problems = overBudget(counts, budgets, "instantiations");
  if (problems.length > 0) return yield* CheckFailed.make({ check: "type-cost", problems });
  return yield* Console.log("type-cost: ok");
});

export const typeCostCommand = Command.make(
  "type-cost",
  {
    write: Flag.Boolean("write").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Record the current counts as budgets"),
    ),
  },
  ({ write }) => typeCost(write),
).pipe(
  Command.withDescription(
    "Check the type instantiations typical app code costs against the budgets",
  ),
);
