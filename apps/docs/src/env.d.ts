/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin for canonical URLs, Open Graph images and the sitemap. */
  readonly VITE_SITE_URL?: string;
  /** PostHog project key (public). Analytics stays off without it. */
  readonly VITE_POSTHOG_KEY?: string;
  /** PostHog ingestion host or reverse proxy. Defaults to PostHog US cloud. */
  readonly VITE_POSTHOG_HOST?: string;
  /** Git SHA of the deploy, set at build time. */
  readonly VITE_RELEASE: string;
}
