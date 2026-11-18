import type { GetLayoutTabsOptions } from "fumadocs-ui/layouts/shared";

import { EnsforgeLogo } from "@/components/logos";

import { getPackageFromUrl } from "./packages";

export const tabs: GetLayoutTabsOptions = {
  transform: (option) => {
    const pkg = getPackageFromUrl(option.url);
    if (!pkg) return option;

    return {
      ...option,
      // Each package shows its own accent, whichever docs are open.
      icon: <EnsforgeLogo data-accent={pkg.slug} className="size-full text-ek-accent" />,
    };
  },
};
