import { Effect, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { ArtifactError } from "../errors.ts";
import { deploymentRecords, repositories } from "./sources.ts";

/** The body at `url`, or `undefined` when it does not exist. */
const fetchText = (url: string) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(url, { headers: { "user-agent": "ensforge-devnet" } });
      if (response.status === 404) return undefined;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    },
    catch: (cause) => new ArtifactError({ artifact: url, message: String(cause) }),
  });

const fetchJson = <A>(url: string) =>
  fetchText(url).pipe(
    Effect.flatMap((text) =>
      text === undefined
        ? Effect.fail(new ArtifactError({ artifact: url, message: "HTTP 404" }))
        : Effect.succeed(JSON.parse(text) as A),
    ),
  );

/** Branches matching `patterns` and their head commits, listed over git (no API quota). */
const remoteBranches = (url: string, patterns: readonly string[]) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const handle = yield* spawner.spawn(
      ChildProcess.make("git", ["ls-remote", "--heads", url, ...patterns]),
    );
    const output = yield* handle.stdout.pipe(Stream.decodeText(), Stream.mkString);
    if ((yield* handle.exitCode) !== ChildProcessSpawner.ExitCode(0)) {
      return yield* new ArtifactError({ artifact: url, message: "git ls-remote failed" });
    }
    return output.split("\n").flatMap((line) => {
      const [commit, ref] = line.split("\t");
      return commit === undefined || ref === undefined
        ? []
        : [{ branch: ref.replace("refs/heads/", ""), commit }];
    });
  }).pipe(
    Effect.scoped,
    Effect.catchTag("PlatformError", (cause) =>
      Effect.fail(new ArtifactError({ artifact: url, message: String(cause) })),
    ),
  );

/** `Contract → address` rows of a contracts-v2 `addresses.md` deployment record. */
const addressRows = (markdown: string): ReadonlyMap<string, string> =>
  new Map(
    [...markdown.matchAll(/^\| (\w+) \| \[(0x[0-9a-fA-F]{40})\]/gm)].flatMap(
      ([, contract, address]) =>
        contract === undefined || address === undefined ? [] : [[contract, address.toLowerCase()]],
    ),
  );

const slugOf = (url: string) => url.replace("https://github.com/", "").replace(/\.git$/, "");

/**
 * What changed upstream since the pinned sources: a newer release of either repository, and the
 * mainnet and Sepolia deployment records of a newer contracts-v2 release or deployment branch
 * (`deployment`, and the most recently committed `post-audit-*`) against the pinned records
 * (`deploymentRecords`). Each line is one change; none means the artifacts are current. Makes a
 * few GitHub API calls (two releases, one per `post-audit-*` branch); records come from
 * raw.githubusercontent.com and branches from `git ls-remote`.
 */
export const watchReleases = Effect.fn("watchReleases")(function* () {
  const changes: string[] = [];
  const v2 = slugOf(repositories["contracts-v2"].url);
  const records = Effect.fnUntraced(function* (ref: string) {
    const rows = new Map<string, ReadonlyMap<string, string>>();
    for (const network of ["mainnet", "sepolia"]) {
      const markdown = yield* fetchText(
        `https://raw.githubusercontent.com/${v2}/${ref}/contracts/deployments/${network}/addresses.md`,
      );
      // A branch without records for a network has nothing to compare.
      if (markdown !== undefined) rows.set(network, addressRows(markdown));
    }
    return rows;
  });
  const pinned = yield* records(repositories[deploymentRecords].commit);
  const compare = Effect.fnUntraced(function* (source: string, ref: string) {
    for (const [network, after] of yield* records(ref)) {
      const before = pinned.get(network) ?? new Map<string, string>();
      for (const [contract, address] of after) {
        const was = before.get(contract);
        if (was === undefined) {
          changes.push(`${source}, ${network}: ${contract} deployed at ${address}`);
        } else if (was !== address) {
          changes.push(`${source}, ${network}: ${contract} ${was} → ${address}`);
        }
      }
      for (const contract of before.keys()) {
        if (!after.has(contract)) changes.push(`${source}, ${network}: ${contract} removed`);
      }
    }
  });

  for (const [repository, pin] of Object.entries(repositories)) {
    if (!("tag" in pin)) continue;
    const latest = yield* fetchJson<{ readonly tag_name: string }>(
      `https://api.github.com/repos/${slugOf(pin.url)}/releases/latest`,
    );
    if (latest.tag_name === pin.tag) continue;
    changes.push(`${repository}: release ${latest.tag_name} (pinned ${pin.tag})`);
    // contracts-v2 keeps the deployment records of each release on its tag, not on main.
    if (repository === "contracts-v2")
      yield* compare(`release ${latest.tag_name}`, latest.tag_name);
  }

  // ENS redeploys single contracts from deployment branches between releases; a newer
  // `post-audit-*` branch supersedes the older ones.
  const branches = (yield* remoteBranches(repositories["contracts-v2"].url, [
    "deployment",
    "post-audit*",
  ])).filter(({ branch }) => branch === "deployment" || /^post-audit(-[\w.-]+)?$/.test(branch));
  const dated = yield* Effect.forEach(
    branches.filter(({ branch }) => branch !== "deployment"),
    ({ branch, commit }) =>
      fetchJson<{ readonly commit: { readonly committer: { readonly date: string } } }>(
        `https://api.github.com/repos/${v2}/commits/${commit}`,
      ).pipe(Effect.map((response) => ({ branch, commit, date: response.commit.committer.date }))),
  );
  const latestPostAudit = dated.toSorted((a, b) => b.date.localeCompare(a.date))[0];
  const watched = [
    ...branches.filter((head) => head.branch === "deployment"),
    ...(latestPostAudit === undefined ? [] : [latestPostAudit]),
  ];
  for (const head of watched) {
    if (head.commit !== repositories[deploymentRecords].commit) {
      yield* compare(`branch ${head.branch}`, head.commit);
    }
  }

  return changes;
});
