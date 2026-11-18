import { createFileRoute, redirect } from "@tanstack/react-router";

/** `/docs` opens the SDK docs, the starting point for every package. */
export const Route = createFileRoute("/docs/")({
  beforeLoad: () => {
    throw redirect({ to: "/docs/$", params: { _splat: "sdk" }, statusCode: 307 });
  },
});
