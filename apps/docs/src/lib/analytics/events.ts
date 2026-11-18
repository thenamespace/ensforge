/**
 * Every product event the site sends, with its properties. Components call `track()` with one of
 * these names, so event names and property shapes cannot drift from the dashboards built on them.
 *
 * Naming: `object_verb`, snake_case, past tense. Properties are snake_case.
 */

export type Location =
  | "header"
  | "footer"
  | "hero"
  | "closing"
  | "packages"
  | "section"
  | "docs"
  | "not_found"
  | "error"
  | "blog";

export interface AnalyticsEvents {
  // Landing pages
  section_viewed: { section_id: string; section_index: number };
  cta_clicked: { cta: string; location: Location; href: string };
  nav_link_clicked: { location: Location; target: string };
  outbound_link_clicked: { destination: string; host: string; location: Location };
  code_copied: {
    snippet_id: string;
    surface: "code_window" | "playground" | "docs";
    lines: number;
  };
  copy_failed: { surface: string };
  /** A playground read settled (`cached` when it was answered without the network). */
  playground_run_completed: { example_id: string; ok: boolean; cached: boolean; ms: number };
  how_it_fits_step_reached: { step_id: string; index: number };

  // Docs
  docs_page_viewed: { package: string; slug: string; title: string };
  docs_scroll_depth_reached: { percent: 25 | 50 | 75 | 100; slug: string };
  docs_code_copied: { slug: string; language: string; lines: number };
  docs_markdown_opened_in_assistant: { slug: string; assistant: "Claude" | "ChatGPT" };
  docs_markdown_copied: { slug: string };
  docs_view_option_clicked: { option: string; slug: string };
  docs_search_opened: { trigger: "button" | "hotkey"; package: string };
  docs_search_performed: {
    query: string;
    query_length: number;
    result_count: number;
    package: string;
  };
  docs_search_result_clicked: { result_url: string; rank: number; query_length: number };
  docs_package_switched: { from: string; to: string };
  docs_toc_clicked: { slug: string; heading: string };
  docs_outbound_clicked: { slug: string; host: string };
  changelog_viewed: { package: string; page: number; release_count: number; unavailable: boolean };
  changelog_release_clicked: { package: string; release: string };

  // Blog
  blog_post_viewed: {
    slug: string;
    category: string;
    package: string;
    tags: string;
    reading_minutes: number;
    featured: boolean;
  };
  blog_read_depth_reached: { percent: 25 | 50 | 75 | 100; slug: string };
  /** Reached three quarters of the post after at least 30 seconds on it. */
  blog_post_read: { slug: string; seconds: number };
  blog_code_copied: { slug: string; language: string; lines: number };
  blog_outbound_clicked: { slug: string; host: string };
  blog_tag_clicked: { slug: string; tag: string };
  blog_rss_clicked: { location: Location };
  blog_post_clicked: {
    slug: string;
    surface: "featured" | "list" | "related" | "adjacent" | "series";
  };
  blog_filter_changed: { category: string; previous: string };
  blog_share_clicked: { slug: string; network: "x" | "linkedin" | "bluesky" | "copy" };
  blog_toc_clicked: { slug: string; heading: string };

  // Site-wide
  page_not_found: { path: string; referrer_host: string };
  route_error: { path: string; message: string };
}

export type AnalyticsEvent = keyof AnalyticsEvents;
