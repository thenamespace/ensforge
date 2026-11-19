/**
 * PostHog project settings shared by the browser and server clients. The project key comes from
 * `VITE_POSTHOG_KEY` (`.env.local` locally, the deploy workflow's `DOCS_DOTENV` secret in
 * production); without it analytics stays off. Events only ever leave the production site.
 */
export const analyticsConfig = {
  key: import.meta.env.VITE_POSTHOG_KEY ?? "",
  /**
   * Ingestion host: our managed reverse proxy, so ad blockers that list PostHog's hosts do not
   * drop events. `VITE_POSTHOG_HOST` overrides it.
   */
  host: import.meta.env.VITE_POSTHOG_HOST ?? "https://t.namespace.ninja",
  uiHost: "https://eu.posthog.com",
  productionHost: "ensforge.com",
} as const;
