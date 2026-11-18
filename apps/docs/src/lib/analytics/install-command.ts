const packageManagers = ["npm", "pnpm", "yarn", "bun"] as const;

export type PackageManager = (typeof packageManagers)[number];

const INSTALL = /^([a-z]+)\s+(?:install|i|add)(?:\s+(.*))?$/;

/**
 * The first command in copied code that installs an `@ensforge/*` package, such as
 * `pnpm add @ensforge/sdk viem`: its package manager and the first ensforge package without its
 * version. Commands chained with `&&` or `;` are read one by one.
 */
export function findInstallCommand(
  text: string,
): { readonly packageManager: PackageManager; readonly package: string } | undefined {
  for (const command of text.split(/\n|&&|;/)) {
    const match = INSTALL.exec(command.trim());
    const packageManager = packageManagers.find((name) => name === match?.[1]);
    if (!match || !packageManager) continue;

    const packageName = (match[2] ?? "")
      .split(/\s+/)
      .map((argument) => /^(@ensforge\/[a-z0-9-]+)/.exec(argument)?.[1])
      .find((name) => name !== undefined);

    if (packageName) return { packageManager, package: packageName };
  }

  return undefined;
}
