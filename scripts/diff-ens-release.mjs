#!/usr/bin/env node
// Describe the ENSv2 contracts that are live on mainnet and Sepolia at a contracts-v2 release.
//
// Usage:
//   node scripts/diff-ens-release.mjs --repo <contracts-v2 checkout> --tag v1.0.1 [--out file.json]
//   node scripts/diff-ens-release.mjs --clone --tag v1.0.1 [--out file.json]
//   node scripts/diff-ens-release.mjs --clone --tag v1.0.2 --compare packages/contracts/test/fixtures/ensv2-v1.0.1.json
//
// Read-only. The "current" contract set comes from contracts/docs/addresses/<network>.md, because
// ENS records redeployed contracts in extra deployment namespaces (`<network>-adhoc`,
// `<network>-*redeploy*`) and the main namespace can hold replaced artifacts. Bytecode hashes strip
// the Solidity CBOR metadata trailer so identical code built from different paths compares equal.
// With --compare, prints the differences against a previous output and exits 1 when any exist.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { format } from "oxfmt";

const repository = "https://github.com/ensdomains/contracts-v2.git";
const networks = ["mainnet", "sepolia"];

const { values } = parseArgs({
  options: {
    repo: { type: "string" },
    clone: { type: "boolean", default: false },
    tag: { type: "string" },
    out: { type: "string" },
    compare: { type: "string" },
  },
  strict: true,
});

if (!values.tag || (!values.repo && !values.clone)) {
  throw new Error("Usage: --tag <tag> and either --repo <checkout> or --clone");
}

const git = (directory, args) =>
  execFileSync("git", ["-C", directory, ...args], { encoding: "utf8" }).trim();

const cloneDirectory = values.clone ? mkdtempSync(join(tmpdir(), "contracts-v2-")) : null;
const directory = values.repo ?? cloneDirectory;

if (cloneDirectory) {
  execFileSync(
    "git",
    [
      "-c",
      "advice.detachedHead=false",
      "clone",
      "--quiet",
      "--depth",
      "1",
      "--branch",
      values.tag,
      repository,
      cloneDirectory,
    ],
    { stdio: "inherit" },
  );
}

const commit = git(directory, ["rev-parse", `${values.tag}^{commit}`]);

if (git(directory, ["rev-parse", "HEAD"]) !== commit) {
  throw new Error(`${directory} must have ${values.tag} (${commit}) checked out`);
}

const deploymentsDirectory = join(directory, "contracts", "deployments");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

// Sorted keys and entries make the hash independent of compiler output ordering.
const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).toSorted();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const abiHash = (abi) => sha256(`[${abi.map(canonicalJson).toSorted().join(",")}]`);

// The last two bytes of runtime bytecode encode the length of the CBOR metadata that precedes them.
const stripMetadata = (code) => {
  const hex = code.startsWith("0x") ? code.slice(2) : code;
  if (hex.length < 4) return hex;
  const metadataBytes = Number.parseInt(hex.slice(-4), 16);
  const end = hex.length - 4 - metadataBytes * 2;
  return end > 0 ? hex.slice(0, end) : hex;
};

const codeHash = (code) => (code && code !== "0x" ? sha256(stripMetadata(code)) : null);

const currentAddresses = (network) => {
  const document = readFileSync(
    join(directory, "contracts", "docs", "addresses", `${network}.md`),
    "utf8",
  );
  const table = document.split("## Changelog")[0];
  const rows = [...table.matchAll(/^\| (\w+) \| \[(0x[0-9a-fA-F]{40})\]/gm)];
  return new Map(rows.map(([, name, address]) => [name, address.toLowerCase()]));
};

// The main namespace wins, then ad hoc deployments, then archived redeploy namespaces.
const namespacesFor = (network) => {
  const rank = (name) => (name === network ? 0 : name === `${network}-adhoc` ? 1 : 2);
  return readdirSync(deploymentsDirectory)
    .filter((name) => name === network || name.startsWith(`${network}-`))
    .toSorted((a, b) => rank(a) - rank(b) || a.localeCompare(b));
};

const readArtifact = (namespace, name) => {
  const file = join(deploymentsDirectory, namespace, `${name}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
};

const describe = (artifact) => ({
  address: artifact.address.toLowerCase(),
  buildInfoId: artifact.buildInfoId ?? null,
  abiHash: abiHash(artifact.abi ?? []),
  codeHash: codeHash(artifact.deployedBytecode),
});

const describeNetwork = (network) => {
  const namespaces = namespacesFor(network);
  const contracts = {};

  for (const [name, address] of [...currentAddresses(network)].toSorted(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const namespace = namespaces.find(
      (candidate) => readArtifact(candidate, name)?.address.toLowerCase() === address,
    );

    if (namespace === undefined) {
      throw new Error(`No ${network} artifact for ${name} at ${address}`);
    }

    const implementation = readArtifact(namespace, `${name}_Implementation`);

    contracts[name] = {
      namespace,
      ...describe(readArtifact(namespace, name)),
      proxyImplementation: implementation ? describe(implementation) : null,
    };
  }

  return contracts;
};

const described = Object.fromEntries(
  networks.map((network) => [network, describeNetwork(network)]),
);

const [mainnet, sepolia] = networks.map((network) => described[network]);
const shared = Object.keys(mainnet).filter((name) => name in sepolia);

const output = {
  repository,
  tag: values.tag,
  commit,
  networks: described,
  comparison: {
    identical: shared.filter(
      (name) =>
        mainnet[name].abiHash === sepolia[name].abiHash &&
        mainnet[name].codeHash === sepolia[name].codeHash,
    ),
    different: shared.filter(
      (name) =>
        mainnet[name].abiHash !== sepolia[name].abiHash ||
        mainnet[name].codeHash !== sepolia[name].codeHash,
    ),
    mainnetOnly: Object.keys(mainnet).filter((name) => !(name in sepolia)),
    sepoliaOnly: Object.keys(sepolia).filter((name) => !(name in mainnet)),
  },
};

if (cloneDirectory) rmSync(cloneDirectory, { recursive: true, force: true });

// Format like the repository formatter so a regenerated fixture produces no diff noise.
const formatted = await format(values.out ?? "output.json", JSON.stringify(output));
if (formatted.errors.length > 0) throw new Error("Unable to format the output JSON");
const json = formatted.code;

if (values.out) writeFileSync(values.out, json);
else if (!values.compare) process.stdout.write(json);

if (values.compare) {
  const previous = JSON.parse(readFileSync(values.compare, "utf8"));
  const differences = [];

  for (const network of networks) {
    const before = previous.networks[network] ?? {};
    const after = described[network];

    for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (!(name in before))
        differences.push(`${network}: added ${name} at ${after[name].address}`);
      else if (!(name in after)) differences.push(`${network}: removed ${name}`);
      else if (canonicalJson(before[name]) !== canonicalJson(after[name])) {
        differences.push(
          `${network}: changed ${name} (${before[name].address} → ${after[name].address})`,
        );
      }
    }
  }

  process.stdout.write(
    differences.length === 0
      ? `No differences between ${previous.tag} and ${values.tag}.\n`
      : `${differences.join("\n")}\n`,
  );

  if (differences.length > 0) process.exitCode = 1;
}
