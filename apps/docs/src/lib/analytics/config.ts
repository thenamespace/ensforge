/**
 * PostHog project settings shared by the browser and server clients. The project key comes from
 * `VITE_POSTHOG_KEY` (`.env.local` locally, the Vercel project settings in production); without it
 * analytics stays off. Events only ever leave the production site.
 */
export const analyticsConfig = {
  key: import.meta.env.VITE_POSTHOG_KEY ?? "",
  /**
   * Ingestion host. Point `VITE_POSTHOG_HOST` at a managed reverse proxy so ad blockers that list
   * PostHog's hosts do not drop events.
   */
  host: import.meta.env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com",
  uiHost: "https://us.posthog.com",
  productionHost: "ensforge.com",
} as const;
