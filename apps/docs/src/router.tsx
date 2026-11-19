import { createRouter } from "@tanstack/react-router";

import { ErrorPage } from "@/components/error-page";
import { NotFound } from "@/components/not-found";

import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: "intent",
    scrollRestoration: true,
    defaultErrorComponent: ErrorPage,
    defaultNotFoundComponent: NotFound,
  });
}
