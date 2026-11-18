import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

import { EnsforgeLogo } from "@/components/logos";
import { SectionLinks } from "@/components/reference/section-links";

import type { PackageInfo } from "./packages";
import { appName, gitConfig } from "./shared";
import { site } from "./site";

/**
 * Shared layout options. Pass the active package on docs pages to brand the nav
 * with its logo and name.
 */
export function baseOptions(pkg?: PackageInfo): BaseLayoutProps {
  const Logo = pkg?.Logo ?? EnsforgeLogo;

  return {
    nav: {
      title: (
        <>
          <Logo className={pkg ? "size-6 text-ek-accent" : "size-6"} />
          <span className="font-semibold">
            {appName}
            {pkg ? (
              <span className="ms-1.5 font-medium text-fd-muted-foreground">{pkg.name}</span>
            ) : null}
          </span>
        </>
      ),
    },
    // The spacious layout has no top bar: the Guides and API reference links head the sidebar,
    // and GitHub sits with the page actions.
    links: [
      { type: "custom", children: <SectionLinks /> },
      ...(site.blogEnabled ? [{ text: "Blog", url: "/blog", active: "nested-url" as const }] : []),
    ],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
    // Dark only, so the docs chrome has no theme switch.
    themeSwitch: { enabled: false },
  };
}
