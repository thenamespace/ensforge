import type { GetLayoutTabsOptions } from "fumadocs-ui/layouts/shared";

import { getPackageFromUrl } from "./packages";

export const tabs: GetLayoutTabsOptions = {
  transform: (option, folder) => {
    // The reference (`root: "reference"`) is reached through the Guides / Reference switch, so
    // the package picker lists the guides only.
    if (folder.root === "reference") return null;

    const pkg = getPackageFromUrl(option.url);
    if (!pkg) return option;

    return {
      ...option,
      // Each package shows its own accent, whichever docs are open.
      icon: <pkg.Logo data-accent={pkg.slug} className="size-full text-ek-accent" />,
    };
  },
};
