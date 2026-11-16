/** Global error settings. */
export type Config = {
  /** Origin of the documentation site used in `docsUrl`. @default "https://ensforge.com" */
  readonly docsOrigin: string;
};

let current: Config = { docsOrigin: "https://ensforge.com" };

/**
 * Changes global error settings, e.g. to point `docsUrl` at a self-hosted docs mirror.
 *
 * @category errors
 * @since 1.0.0
 */
export const setConfig = (config: Partial<Config>): void => {
  current = { ...current, ...config };
};

/** @internal */
export const getConfig = (): Config => current;
