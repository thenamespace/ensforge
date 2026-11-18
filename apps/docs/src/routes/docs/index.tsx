import { createFileRoute, redirect } from "@tanstack/react-router";

import { defaultPackage } from "@/lib/packages";

export const Route = createFileRoute("/docs/")({
  beforeLoad: () => {
    throw redirect({ to: "/docs/$", params: { _splat: defaultPackage } });
  },
});
