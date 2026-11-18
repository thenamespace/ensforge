import type { DocKind } from "./docs-page";
import type { PackageManager } from "./install-command";

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

export type DocsFeedbackReason =
  | "missing_information"
  | "hard_to_follow"
  | "code_failed"
  | "outdated"
  | "other";

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
  /**
   * A playground read settled (`cached` when it was answered without the network). `input` says
   * whether the name came from a preset chip or was typed; `error_code` is set when it failed.
   */
  playground_run_completed: {
    example_id: string;
    ok: boolean;
    cached: boolean;
    ms: number;
    chain: string;
    input: "preset" | "typed";
    error_code?: string;
  };
  how_it_fits_step_reached: { step_id: string; index: number };

  // Docs
  /** `api_name` is set on action, hook and error-code pages (`record.get`, `NAME_EXPIRED`). */
  docs_page_viewed: {
    package: string;
    slug: string;
    title: string;
    doc_kind: DocKind;
    api_name?: string;
  };
  docs_code_copied: { slug: string; language: string; lines: number };
  /** Copied code that installs an `@ensforge/*` package; sent with `docs_code_copied`. */
  install_command_copied: { package: string; package_manager: PackageManager; slug: string };
  /** A reader picked another tab: the call style (`api`) or package manager tabs. */
  docs_tab_switched: {
    slug: string;
    group: "api" | "package_manager" | "other";
    from: string;
    to: string;
  };
  docs_feedback_submitted: { slug: string; helpful: boolean };
  /** The reason picked after "No" on the feedback control. */
  docs_feedback_reason_selected: { slug: string; reason: DocsFeedbackReason };
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
