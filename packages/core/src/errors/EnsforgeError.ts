import type { Address } from "viem";

import { version } from "../version.js";
import { getConfig } from "./config.js";

/**
 * Base class of every error ensforge throws.
 *
 * **Details**
 *
 * - `_tag` and `name` are the class name, so `Effect.catchTag("UnauthorizedError", …)` and
 *   `error.name === "UnauthorizedError"` match the same errors.
 * - `code` says exactly what happened and is stable across releases.
 * - Promise and Effect users receive the same instance.
 *
 * @see https://ensforge.com/errors
 * @category errors
 * @since 1.0.0
 */
export abstract class EnsforgeError<
  tag extends string = string,
  code extends string = string,
> extends Error {
  readonly "~ensforge/error" = true;
  readonly _tag: tag;
  override readonly name: tag;
  readonly code: code;
  /** One-line, developer-facing summary. */
  readonly shortMessage: string;
  /** How to fix the problem, when ensforge knows. */
  readonly hint: string | undefined;
  /** Extra developer-facing lines shown under the summary. */
  readonly details: readonly string[];
  /** Whether retrying the same call can succeed. */
  readonly retryable: boolean;
  /** The ENS operation and inputs the error happened in. */
  readonly context: EnsforgeError.Context;

  constructor(tag: tag, options: EnsforgeError.Options<code>) {
    super(options.shortMessage, options.cause === undefined ? undefined : { cause: options.cause });
    this._tag = tag;
    this.name = tag;
    this.code = options.code;
    this.shortMessage = options.shortMessage;
    this.hint = options.hint;
    this.details = options.details ?? [];
    this.retryable = options.retryable ?? false;
    this.context = options.context ?? {};
    this.message = this.render();
  }

  /** Documentation page for this error's code. */
  get docsUrl(): string {
    return `${getConfig().docsOrigin}/errors/${this.code}`;
  }

  /**
   * Adds context without overwriting fields that are already set, and returns the same instance.
   *
   * @internal
   */
  withContext(context: EnsforgeError.Context | undefined): this {
    if (context === undefined) return this;

    (this as { context: EnsforgeError.Context }).context = { ...context, ...this.context };
    this.message = this.render();
    return this;
  }

  /**
   * Sets `cause` when the error was created without one, and returns the same instance.
   *
   * @internal
   */
  withCause(cause: unknown): this {
    if (this.cause === undefined) this.cause = cause;
    return this;
  }

  /** A plain object that is safe to log or send to an error tracker. */
  toJSON(): EnsforgeError.Json {
    return {
      name: this.name,
      code: this.code,
      shortMessage: this.shortMessage,
      hint: this.hint,
      details: this.details,
      retryable: this.retryable,
      context: this.context,
      docsUrl: this.docsUrl,
    };
  }

  private render(): string {
    const { context } = this;
    const footer = [
      `Code: ${this.code}`,
      context.operation === undefined ? undefined : `Operation: ${context.operation}`,
      context.name === undefined ? undefined : `Name: ${context.name}`,
      context.contract === undefined ? undefined : `Contract: ${context.contract}`,
      context.functionName === undefined ? undefined : `Function: ${context.functionName}`,
      `Docs: ${this.docsUrl}`,
      `Version: @ensforge/core@${version}`,
    ].filter((line) => line !== undefined);

    return [
      this.shortMessage,
      this.details.length === 0 ? undefined : this.details.join("\n"),
      this.hint === undefined ? undefined : `Hint: ${this.hint}`,
      footer.join("\n"),
    ]
      .filter((block) => block !== undefined)
      .join("\n\n");
  }
}

/**
 * Fills a subclass's constructor options with the defaults for its code. Explicit options win;
 * `undefined` never overwrites a default.
 *
 * @internal
 */
export const withDefaults = <code extends string>(
  defaults: EnsforgeError.Defaults,
  options: EnsforgeError.ClassOptions<code>,
  retryable = false,
): EnsforgeError.Options<code> => ({
  code: options.code,
  shortMessage: options.shortMessage ?? defaults.shortMessage,
  hint: options.hint ?? defaults.hint,
  details: options.details ?? defaults.details,
  retryable,
  context: options.context,
  cause: options.cause,
});

export declare namespace EnsforgeError {
  /** Where an error happened. Filled in by every action. */
  type Context = {
    /** Action path, e.g. `record.set`. */
    readonly operation?: string | undefined;
    /** ENS name the action was called with. */
    readonly name?: string | undefined;
    /** Account that signed or was checked. */
    readonly account?: Address | undefined;
    readonly chainId?: number | undefined;
    /** Contract that reverted or was called. */
    readonly contract?: Address | undefined;
    /** Contract function that reverted or was called. */
    readonly functionName?: string | undefined;
    /** Kind of contract, used to name roles in `MISSING_ROLES` errors. */
    readonly contractKind?: "registry" | "resolver" | "wrapper" | "registrar" | undefined;
    /** ENSv2 registry that wrapped the revert in `ResolutionError` (mainnet). */
    readonly registry?: Address | undefined;
  };

  /** Constructor options shared by every error class. */
  type Options<code extends string> = {
    readonly code: code;
    readonly shortMessage: string;
    readonly hint?: string | undefined;
    readonly details?: readonly string[] | undefined;
    readonly retryable?: boolean | undefined;
    readonly context?: Context | undefined;
    readonly cause?: unknown;
  };

  /** Options every subclass constructor accepts; the summary defaults from the code. */
  type ClassOptions<code extends string> = {
    readonly code: code;
    /** Overrides the default summary for `code`. */
    readonly shortMessage?: string | undefined;
    readonly hint?: string | undefined;
    readonly details?: readonly string[] | undefined;
    readonly context?: Context | undefined;
    readonly cause?: unknown;
  };

  /** Default summary and hint for one code. */
  type Defaults = {
    readonly shortMessage: string;
    readonly hint?: string | undefined;
    readonly details?: readonly string[] | undefined;
  };

  /** Shape returned by `toJSON`. */
  type Json = {
    readonly name: string;
    readonly code: string;
    readonly shortMessage: string;
    readonly hint: string | undefined;
    readonly details: readonly string[];
    readonly retryable: boolean;
    readonly context: Context;
    readonly docsUrl: string;
  };
}
