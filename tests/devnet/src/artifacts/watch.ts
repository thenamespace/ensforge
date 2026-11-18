import { Effect } from "effect";

import { ArtifactError } from "../errors.ts";
import { repositories, type Repository } from "./sources.ts";

const fetchText = (url: string) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(url, { headers: { "user-agent": "ensforge-devnet" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    },
    catch: (cause) => new ArtifactError({ artifact: url, message: String(cause) }),
  });

/** `Contract → address` rows of a contracts-v2 `addresses.md` deployment record. */
const addressRows = (markdown: string): ReadonlyMap<string, string> =>
  new Map(
    [...markdown.matchAll(/^\| (\w+) \| \[(0x[0-9a-fA-F]{40})\]/gm)].flatMap(
      ([, contract, address]) =>
        contract === undefined || address === undefined ? [] : [[contract, address.toLowerCase()]],
    ),
  );

/**
 * What changed upstream since the pinned sources: a newer release of either repository and, for
 * a newer contracts-v2 release, its mainnet and Sepolia deployment records against the pinned
 * ones. Each line is one change; none means the artifacts are current.
 */
export const watchReleases = Effect.fn("watchReleases")(function* () {
  const changes: string[] = [];

  for (const [repository, pinned] of Object.entries(repositories) as [
    Repository,
    (typeof repositories)[Repository],
  ][]) {
    const slug = pinned.url.replace("https://github.com/", "").replace(/\.git$/, "");
    const latest = JSON.parse(
      yield* fetchText(`https://api.github.com/repos/${slug}/releases/latest`),
    ) as { readonly tag_name: string };
    if (latest.tag_name === pinned.tag) continue;
    changes.push(`${repository}: release ${latest.tag_name} (pinned ${pinned.tag})`);
    if (repository !== "contracts-v2") continue;

    // contracts-v2 keeps the deployment records of each release on its tag, not on main.
    for (const network of ["mainnet", "sepolia"]) {
      const file = `https://raw.githubusercontent.com/${slug}/%s/contracts/deployments/${network}/addresses.md`;
      const before = addressRows(yield* fetchText(file.replace("%s", pinned.commit)));
      const after = addressRows(yield* fetchText(file.replace("%s", latest.tag_name)));
      for (const [contract, address] of after) {
        const was = before.get(contract);
        if (was === undefined) changes.push(`${network}: ${contract} deployed at ${address}`);
        else if (was !== address) changes.push(`${network}: ${contract} ${was} → ${address}`);
      }
      for (const contract of before.keys()) {
        if (!after.has(contract)) changes.push(`${network}: ${contract} removed`);
      }
    }
  }

  return changes;
});
