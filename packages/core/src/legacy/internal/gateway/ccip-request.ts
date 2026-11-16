import { isHex, type CcipRequestParameters, type Hex, type PublicClient } from "viem";

import type { ResolvedGatewayOptions } from "../../config/gateway-options.js";
import { GatewayError } from "../../errors/gateway-error.js";

type GatewayFetch = typeof globalThis.fetch;

export const assertAllowedGatewayUrl = (value: string, policy: ResolvedGatewayOptions): URL => {
  let url: URL;

  try {
    url = new URL(value);
  } catch (cause) {
    throw new GatewayError({
      code: "GATEWAY_NOT_ALLOWED",
      message: "Gateway URL is invalid",
      cause,
    });
  }

  const host = url.hostname.toLowerCase();

  if (
    policy.deniedHosts.some((denied) => denied.toLowerCase() === host) ||
    (policy.allowedHosts !== null &&
      !policy.allowedHosts.some((allowed) => allowed.toLowerCase() === host))
  ) {
    throw new GatewayError({
      code: "GATEWAY_NOT_ALLOWED",
      message: `Gateway host ${host} is not allowed`,
      cause: { host },
    });
  }

  return url;
};

const fetchWithRedirects = async (
  fetcher: GatewayFetch,
  initialUrl: string,
  init: RequestInit,
  policy: ResolvedGatewayOptions,
): Promise<Response> => {
  let url = assertAllowedGatewayUrl(initialUrl, policy);

  for (let redirects = 0; ; redirects += 1) {
    // Redirect policy must validate each destination before the next request is made.
    // oxlint-disable-next-line no-await-in-loop
    const response = await fetcher(url, { ...init, redirect: "manual" });

    if (response.status < 300 || response.status >= 400) return response;

    const location = response.headers.get("location");

    if (location === null || redirects >= policy.maxRedirects) {
      throw new GatewayError({
        code: "GATEWAY_NOT_ALLOWED",
        message: "Gateway exceeded the configured redirect limit",
        cause: { url: url.toString(), redirects },
      });
    }

    url = assertAllowedGatewayUrl(new URL(location, url).toString(), policy);
  }
};

export const makeCcipRequest =
  (policy: ResolvedGatewayOptions, fetcher: GatewayFetch = globalThis.fetch) =>
  async ({ data, requestOptions, sender, urls }: CcipRequestParameters) => {
    let lastError: unknown = new Error("No CCIP gateway returned a valid response");

    for (const template of urls) {
      const url = template.replace("{sender}", sender.toLowerCase()).replace("{data}", data);
      const method = template.includes("{data}") ? "GET" : "POST";
      const timeout = AbortSignal.timeout(policy.timeout);

      const signal =
        requestOptions?.signal === undefined
          ? timeout
          : AbortSignal.any([requestOptions.signal, timeout]);

      try {
        // CCIP gateway URLs are ordered fallbacks and must not be raced.
        // oxlint-disable-next-line no-await-in-loop
        const response = await fetchWithRedirects(
          fetcher,
          url,
          {
            method,
            signal,
            ...(method === "POST"
              ? {
                  body: JSON.stringify({ data, sender }),
                  headers: { "content-type": "application/json" },
                }
              : {}),
          },
          policy,
        );

        const declaredSize = Number(response.headers.get("content-length") ?? 0);

        if (declaredSize > policy.maxResponseSize) {
          throw new GatewayError({
            code: "GATEWAY_NOT_ALLOWED",
            message: "Gateway response exceeds the configured size limit",
            cause: { declaredSize, maxResponseSize: policy.maxResponseSize },
          });
        }

        // The body is consumed only after its declared size has passed validation.
        // oxlint-disable-next-line no-await-in-loop
        const body = await response.text();
        const actualSize = new TextEncoder().encode(body).byteLength;

        if (actualSize > policy.maxResponseSize) {
          throw new GatewayError({
            code: "GATEWAY_NOT_ALLOWED",
            message: "Gateway response exceeds the configured size limit",
            cause: { actualSize, maxResponseSize: policy.maxResponseSize },
          });
        }

        if (!response.ok) throw new Error(`Gateway returned HTTP ${response.status}`);

        const result = response.headers.get("content-type")?.startsWith("application/json")
          ? (JSON.parse(body) as { readonly data?: unknown }).data
          : body;

        if (!isHex(result)) throw new Error("Gateway returned malformed CCIP data");

        return result satisfies Hex;
      } catch (cause) {
        if (requestOptions?.signal?.aborted === true) throw cause;

        lastError = timeout.aborted
          ? new GatewayError({
              code: "GATEWAY_TIMEOUT",
              message: `Gateway request exceeded the configured ${policy.timeout}ms timeout`,
              cause,
            })
          : cause;
      }
    }

    throw lastError;
  };

export const withGatewayPolicy = (
  client: PublicClient,
  policy: ResolvedGatewayOptions,
): PublicClient => {
  if (client.ccipRead === false || client.ccipRead?.request !== undefined) return client;

  return { ...client, ccipRead: { request: makeCcipRequest(policy) } } as PublicClient;
};
