import { kebab } from "./mdx.ts";

/** Root of the generated API reference, its own sidebar on the docs site. */
export const referenceUrl = "/docs/reference";

/** A package's reference: `/docs/reference/sdk`. */
export const packageUrl = (root: string): string => `${referenceUrl}/${root}`;

/** A domain of actions: `/docs/reference/sdk/primary-name`. */
export const domainUrl = (root: string, domain: string): string =>
  `${packageUrl(root)}/${kebab(domain)}`;

/** An action: `/docs/reference/sdk/primary-name/get`, or `/docs/reference/sdk/batch` outside a domain. */
export const actionUrl = (root: string, domain: string, folder: string): string =>
  domain === ""
    ? `${packageUrl(root)}/${kebab(folder)}`
    : `${domainUrl(root, domain)}/${kebab(folder)}`;

/** A React hook: `/docs/reference/react/use-address`. */
export const hookUrl = (name: string): string => `${packageUrl("react")}/${kebab(name)}`;

export const errorsUrl = `${referenceUrl}/errors`;

/** An error code's page, the one `error.docsUrl` points to: `/docs/reference/errors/NOT_OWNER`. */
export const errorUrl = (code: string): string => `${errorsUrl}/${code}`;

/** An error class's page: `/docs/reference/errors/unauthorized-error`. */
export const errorClassUrl = (name: string): string => `${errorsUrl}/${kebab(name)}`;
