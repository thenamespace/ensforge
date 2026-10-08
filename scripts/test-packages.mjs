import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootPackage = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8"));
const workspaceCatalog = readFileSync(join(repositoryRoot, "pnpm-workspace.yaml"), "utf8");
const temporaryRoot = mkdtempSync(join(tmpdir(), "ensforge-package-smoke-"));
const tarballDirectory = join(temporaryRoot, "tarballs");

const catalogVersion = (dependency) => {
  const escaped = dependency.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = workspaceCatalog.match(
    new RegExp(`^\\s+"?${escaped}"?:\\s+"?([^"\\s]+)"?\\s*$`, "m"),
  );
  assert(match, `Missing ${dependency} from the workspace catalog`);
  return match[1];
};

const dependencyVersion = (dependency) => {
  const declared = rootPackage.devDependencies?.[dependency];
  return declared === undefined || declared === "catalog:" ? catalogVersion(dependency) : declared;
};

const run = (command, arguments_, cwd, options = {}) => {
  process.stdout.write(`\n> ${command} ${arguments_.join(" ")}\n`);
  const result = spawnSync(command, arguments_, {
    cwd,
    env: process.env,
    encoding: options.quiet ? "utf8" : undefined,
    maxBuffer: 10 * 1024 * 1024,
    stdio: options.quiet ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (options.quiet) {
      process.stderr.write(result.stdout ?? "");
      process.stderr.write(result.stderr ?? "");
    }
    throw new Error(`${command} ${arguments_.join(" ")} exited with code ${result.status ?? 1}`);
  }
};

const write = (path, contents) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
};

const fileDependency = (projectDirectory, tarball) => `file:${relative(projectDirectory, tarball)}`;

const writeLocalPackageOverrides = (projectDirectory) => {
  const overrides = packageNames
    .map(
      (packageName) =>
        `  "@ensforge/${packageName}": "${fileDependency(projectDirectory, tarballs[packageName])}"`,
    )
    .join("\n");
  write(
    join(projectDirectory, "pnpm-workspace.yaml"),
    `packages:\n  - "."\n\nallowBuilds:\n  bufferutil: true\n  esbuild: true\n  keccak: true\n  msgpackr-extract: true\n  utf-8-validate: true\n\noverrides:\n  viem: "${viemVersion}"\n${overrides}\n`,
  );
};

const viemVersion = process.env.ENSFORGE_TEST_VIEM_VERSION ?? catalogVersion("viem");

const packageNames = ["contracts", "core", "sdk", "react", "hca"];
const tarballs = Object.fromEntries(
  packageNames.map((packageName) => [packageName, join(tarballDirectory, `${packageName}.tgz`)]),
);

mkdirSync(tarballDirectory, { recursive: true });

try {
  for (const packageName of packageNames) {
    run(
      "pnpm",
      ["pack", "--out", tarballs[packageName]],
      join(repositoryRoot, "packages", packageName),
      { quiet: true },
    );
  }

  const nodeProject = join(temporaryRoot, "node-consumer");
  write(
    join(nodeProject, "package.json"),
    `${JSON.stringify(
      {
        name: "ensforge-node-consumer",
        private: true,
        type: "module",
        scripts: {
          check: "tsc --noEmit && node index.mjs",
        },
        dependencies: {
          "@ensforge/contracts": fileDependency(nodeProject, tarballs.contracts),
          "@ensforge/core": fileDependency(nodeProject, tarballs.core),
          "@ensforge/sdk": fileDependency(nodeProject, tarballs.sdk),
          "@ensforge/hca": fileDependency(nodeProject, tarballs.hca),
          effect: catalogVersion("effect"),
          viem: viemVersion,
        },
        devDependencies: {
          typescript: dependencyVersion("typescript"),
        },
      },
      null,
      2,
    )}\n`,
  );
  write(
    join(nodeProject, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          lib: ["ESNext"],
          module: "NodeNext",
          moduleResolution: "NodeNext",
          noEmit: true,
          skipLibCheck: true,
          strict: true,
          target: "ES2024",
        },
        include: ["index.ts"],
      },
      null,
      2,
    )}\n`,
  );
  write(
    join(nodeProject, "index.ts"),
    `import { mainnetV1Deployment } from "@ensforge/contracts/deployments";
import { createConfig, getOwner } from "@ensforge/core";
import { Ensforge } from "@ensforge/sdk";
import { createMemoryWorkflowStorage } from "@ensforge/core/storage";
import { createIndexedDbWorkflowStorage } from "@ensforge/core/storage/browser";
import { createExecutionAdapter } from "@ensforge/hca";
import { createHcaRemoteHandler } from "@ensforge/hca/remote";
import type { GetOwnerParameters } from "@ensforge/sdk/name";
import type { SetTextParameters } from "@ensforge/sdk/records";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const publicClient = createPublicClient({ chain: mainnet, transport: http() });
const config = createConfig({ network: "mainnet", publicClient });
const sdk = new Ensforge({ network: "mainnet", publicClient });
const ownerParameters = { name: "ens.eth" } satisfies GetOwnerParameters;
const setTextParameters = {
  name: "ens.eth",
  key: "url",
  value: "https://ens.domains",
} satisfies SetTextParameters;

void createMemoryWorkflowStorage;
void createIndexedDbWorkflowStorage;
void createExecutionAdapter;
void createHcaRemoteHandler;
void mainnetV1Deployment.contracts.registry;
void getOwner.request(ownerParameters);
void config.network;
void sdk.name.getOwner;
void setTextParameters;
void sdk.records.setText.call;
`,
  );
  write(
    join(nodeProject, "index.mjs"),
    `import assert from "node:assert/strict";
import { mainnetV1Deployment } from "@ensforge/contracts/deployments";
import { createConfig, getOwner } from "@ensforge/core";
import { Ensforge } from "@ensforge/sdk";
import { createMemoryWorkflowStorage } from "@ensforge/core/storage";
import { createIndexedDbWorkflowStorage } from "@ensforge/core/storage/browser";
import { createExecutionAdapter } from "@ensforge/hca";
import { createHcaRemoteHandler } from "@ensforge/hca/remote";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const publicClient = createPublicClient({ chain: mainnet, transport: http() });
const config = createConfig({ network: "mainnet", publicClient });
const sdk = new Ensforge({ network: "mainnet", publicClient });

assert.equal(config.network, "mainnet");
assert.equal(typeof createExecutionAdapter, "function");
assert.equal(typeof createHcaRemoteHandler, "function");
assert.equal(createMemoryWorkflowStorage().kind, "workflow-storage");
const browserStorage = createIndexedDbWorkflowStorage();
await browserStorage.close();
assert.equal(typeof getOwner, "function");
assert.equal(typeof sdk.name.getOwner, "function");
assert.match(mainnetV1Deployment.contracts.registry, /^0x[0-9a-fA-F]{40}$/);
`,
  );

  const reactProjects = [
    { directory: join(temporaryRoot, "react-consumer-wagmi-2"), wagmi: "2.19.5" },
    { directory: join(temporaryRoot, "react-consumer-wagmi-3"), wagmi: catalogVersion("wagmi") },
  ];

  for (const { directory: reactProject, wagmi } of reactProjects) {
    write(
      join(reactProject, "package.json"),
      `${JSON.stringify(
        {
          name: `ensforge-react-consumer-wagmi-${wagmi.split(".")[0]}`,
          private: true,
          type: "module",
          scripts: {
            check: "tsc --noEmit && vite build",
          },
          dependencies: {
            "@ensforge/contracts": fileDependency(reactProject, tarballs.contracts),
            "@ensforge/core": fileDependency(reactProject, tarballs.core),
            "@ensforge/react": fileDependency(reactProject, tarballs.react),
            "@ensforge/sdk": fileDependency(reactProject, tarballs.sdk),
            effect: catalogVersion("effect"),
            react: catalogVersion("react"),
            "react-dom": catalogVersion("react-dom"),
            scheduler: catalogVersion("scheduler"),
            viem: viemVersion,
            wagmi,
          },
          devDependencies: {
            "@types/react": catalogVersion("@types/react"),
            "@types/react-dom": catalogVersion("@types/react-dom"),
            typescript: dependencyVersion("typescript"),
            vite: dependencyVersion("vite"),
          },
        },
        null,
        2,
      )}\n`,
    );
    write(
      join(reactProject, "tsconfig.json"),
      `${JSON.stringify(
        {
          compilerOptions: {
            jsx: "react-jsx",
            lib: ["DOM", "ES2024"],
            module: "ESNext",
            moduleResolution: "Bundler",
            noEmit: true,
            skipLibCheck: true,
            strict: true,
            target: "ES2024",
          },
          include: ["src"],
        },
        null,
        2,
      )}\n`,
    );
    write(
      join(reactProject, "index.html"),
      `<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n`,
    );
    write(
      join(reactProject, "src/main.tsx"),
      `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { EnsforgeProvider, useOwner, useSetText, useStartHcaRegistration } from "@ensforge/react";
import { createConfig, http } from "wagmi";
import { mainnet } from "viem/chains";

const wagmiConfig = createConfig({
  chains: [mainnet],
  transports: { [mainnet.id]: http() },
});

const Profile = () => {
  const owner = useOwner({ name: "ens.eth" });
  const setText = useSetText();
  const registration = useStartHcaRegistration();
  const registrationStatus: string | undefined = registration.data?.progress.status;
  void registrationStatus;
  // @ts-expect-error HCA registration requires typed inputs, not arbitrary values.
  const invalid: Parameters<typeof registration.mutate>[0] = "invalid";
  void invalid;

  return (
    <button
      disabled={owner.isWaiting || setText.isWaiting}
      onClick={() => setText.mutate({ name: "ens.eth", key: "url", value: "https://ens.domains" })}
      type="button"
    >
      {owner.data?.owner ?? "ENS"}
    </button>
  );
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <EnsforgeProvider config={{ network: "mainnet", wagmiConfig }}>
      <Profile />
    </EnsforgeProvider>
  </StrictMode>,
);
`,
    );
  }

  const providerProjects = [
    { provider: "pimlico", dependency: "permissionless", version: "0.4.0" },
    { provider: "rhinestone", dependency: "@rhinestone/sdk", version: "1.8.0" },
  ].map(({ provider, dependency, version }) => {
    const directory = join(temporaryRoot, `${provider}-consumer`);
    const manifest = JSON.parse(readFileSync(join(nodeProject, "package.json"), "utf8"));
    manifest.name = `ensforge-${provider}-consumer`;
    for (const packageName of ["contracts", "core", "sdk", "hca"])
      manifest.dependencies[`@ensforge/${packageName}`] = fileDependency(
        directory,
        tarballs[packageName],
      );
    manifest.dependencies[dependency] = version;
    write(join(directory, "package.json"), JSON.stringify(manifest, null, 2));
    write(
      join(directory, "tsconfig.json"),
      readFileSync(join(nodeProject, "tsconfig.json"), "utf8"),
    );
    write(
      join(directory, "index.ts"),
      `import { ${provider} } from "@ensforge/hca/${provider}";
void ${provider};
`,
    );
    write(
      join(directory, "index.mjs"),
      `import assert from "node:assert/strict";
import { ${provider} } from "@ensforge/hca/${provider}";
assert.equal(typeof ${provider}, "function");
`,
    );
    return { directory, provider };
  });

  for (const project of [
    nodeProject,
    ...reactProjects.map(({ directory }) => directory),
    ...providerProjects.map(({ directory }) => directory),
  ]) {
    writeLocalPackageOverrides(project);
    if (
      providerProjects.some(
        ({ directory, provider }) => directory === project && provider === "rhinestone",
      )
    ) {
      const patch = readFileSync(
        join(repositoryRoot, "packages/hca/patches/rhinestone-sdk-1.8.0.patch"),
        "utf8",
      );
      write(join(project, "patches/rhinestone-sdk-1.8.0.patch"), patch);
      const workspace = join(project, "pnpm-workspace.yaml");
      write(
        workspace,
        `${readFileSync(workspace, "utf8")}\npatchedDependencies:\n  "@rhinestone/sdk@1.8.0": patches/rhinestone-sdk-1.8.0.patch\n`,
      );
    }
    run("pnpm", ["install", "--prefer-offline"], project);
    if (
      providerProjects.some(
        ({ directory, provider }) => directory === project && provider === "rhinestone",
      )
    )
      assert.equal(
        readFileSync(
          join(project, "node_modules/@ensforge/hca/patches/rhinestone-sdk-1.8.0.patch"),
          "utf8",
        ),
        readFileSync(join(project, "patches/rhinestone-sdk-1.8.0.patch"), "utf8"),
      );
    run("pnpm", ["check"], project);
  }
} finally {
  if (process.env.ENSFORGE_KEEP_PACKAGE_SMOKE === "1") {
    process.stdout.write(`\nPackage smoke projects retained at ${temporaryRoot}\n`);
  } else {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}
