import type { ComponentType } from "react";

import { ContractsLogo, HcaLogo, type LogoProps, ReactLogo, SdkLogo } from "@/components/logos";

import { docsRoute, gitConfig } from "./shared";

export interface PackageInfo {
  /** Root folder under `content/docs`, also the URL segment and search tag. */
  readonly slug: string;
  readonly name: string;
  /** Published name, e.g. `@ensforge/sdk`; its GitHub releases back the changelog. */
  readonly npm: string;
  readonly Logo: ComponentType<LogoProps>;
  /** Whether `content/docs/<slug>` exists yet. */
  readonly hasDocs: boolean;
}

export const packages: readonly PackageInfo[] = [
  { slug: "sdk", name: "SDK", npm: "@ensforge/sdk", Logo: SdkLogo, hasDocs: true },
  {
    slug: "contracts",
    name: "Contracts",
    npm: "@ensforge/contracts",
    Logo: ContractsLogo,
    hasDocs: true,
  },
  { slug: "react", name: "React", npm: "@ensforge/react", Logo: ReactLogo, hasDocs: true },
  { slug: "hca", name: "HCA", npm: "@ensforge/hca", Logo: HcaLogo, hasDocs: true },
];

export const documentedPackages = packages.filter((pkg) => pkg.hasDocs);

/** The package `/docs` opens on. */
export const defaultPackage = "sdk";

export function getPackage(slug: string | undefined): PackageInfo | undefined {
  return packages.find((pkg) => pkg.slug === slug);
}

/**
 * Resolve the package from a docs URL such as `/docs/sdk/getting-started`, or from its API
 * reference, `/docs/reference/sdk/record/get`.
 */
export function getPackageFromUrl(url: string): PackageInfo | undefined {
  if (!url.startsWith(`${docsRoute}/`)) return undefined;

  const [first, second] = url.slice(docsRoute.length + 1).split("/");

  return getPackage(first === "reference" ? second : first);
}

/** The package a docs path like `/docs/sdk/changelog` (as slugs) is the changelog of. */
export function getChangelogPackage(slugs: readonly string[]): PackageInfo | undefined {
  if (slugs.length !== 2 || slugs[1] !== "changelog") return undefined;

  const pkg = getPackage(slugs[0]);

  return pkg?.hasDocs ? pkg : undefined;
}

/** The package's releases on GitHub: the monorepo's releases, filtered to the package's tags. */
export const releasesUrl = (pkg: PackageInfo) =>
  `https://github.com/${gitConfig.user}/${gitConfig.repo}/releases?q=${encodeURIComponent(pkg.npm)}&expanded=true`;
