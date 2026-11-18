import { createServer, type RequestListener } from "node:http";
import type { AddressInfo } from "node:net";

import { Context, Effect, Layer, type Scope } from "effect";

import type { Address, Hex } from "viem";

import { gatewayAnswer, type Proof } from "./dnssec.ts";

/** What a gateway answers: an HTTP status and a raw body. */
export type GatewayAnswer = { readonly status: number; readonly body: string };

/** A running gateway: its URL, and how many requests reached it. */
export type Gateway = { readonly url: string; readonly requests: () => number };

/** An HTTP server on 127.0.0.1 that handles requests with `handle`, for the enclosing scope. */
const listen = (handle: RequestListener): Effect.Effect<Gateway, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.callback<{ readonly gateway: Gateway; readonly close: () => void }>((resume) => {
      let requests = 0;
      const server = createServer((request, response) => {
        requests += 1;
        handle(request, response);
      });
      server.listen(0, "127.0.0.1", () => {
        const { port } = server.address() as AddressInfo;
        resume(
          Effect.succeed({
            gateway: { url: `http://127.0.0.1:${port}/`, requests: () => requests },
            // Requests left unanswered keep their connections open until closed here.
            close: () => server.close().closeAllConnections(),
          }),
        );
      });
    }),
    ({ close }) => Effect.sync(close),
  ).pipe(Effect.map(({ gateway }) => gateway));

const serve = (answer: () => GatewayAnswer): Effect.Effect<Gateway, never, Scope.Scope> =>
  // Answers once the request body is read; answering earlier can reset the connection.
  listen((request, response) => {
    request.resume().on("end", () => {
      const { status, body } = answer();
      response.writeHead(status, { "Content-Type": "application/json" }).end(body);
    });
  });

/** An EIP-3668 request: the contract that reverted with `OffchainLookup`, and its call data. */
export type Lookup = { readonly sender: Address; readonly data: Hex };

const serveLookups = (
  answer: (lookup: Lookup) => Effect.Effect<Hex, unknown>,
): Effect.Effect<Gateway, never, Scope.Scope> =>
  listen((request, response) => {
    let body = "";
    request
      .setEncoding("utf8")
      .on("data", (chunk: string) => {
        body += chunk;
      })
      .on("end", () => {
        Effect.runFork(
          answer(JSON.parse(body) as Lookup).pipe(
            Effect.match({
              onSuccess: (data) => ({ status: 200, json: { data } }),
              onFailure: (error) => ({ status: 500, json: { message: String(error) } }),
            }),
            Effect.map(({ status, json }) =>
              response
                .writeHead(status, { "Content-Type": "application/json" })
                .end(JSON.stringify(json)),
            ),
          ),
        );
      });
  });

/** In-process CCIP-Read and DNSSEC gateways on 127.0.0.1. */
export class Gateways extends Context.Service<
  Gateways,
  {
    /** A gateway that answers every request with `answer()`, for the enclosing scope. */
    readonly serve: (answer: () => GatewayAnswer) => Effect.Effect<Gateway, never, Scope.Scope>;
    /**
     * An EIP-3668 gateway that answers each lookup (POSTed) with `answer`'s data, or HTTP 500
     * when it fails, for the enclosing scope.
     */
    readonly serveLookups: (
      answer: (lookup: Lookup) => Effect.Effect<Hex, unknown>,
    ) => Effect.Effect<Gateway, never, Scope.Scope>;
    /** A gateway that never answers, for the enclosing scope. */
    readonly hang: Effect.Effect<Gateway, never, Scope.Scope>;
    /** An ENSIP-17 DNSSEC gateway that answers every request with `proof`. */
    readonly serveProof: (proof: Proof) => Effect.Effect<Gateway, never, Scope.Scope>;
  }
>()("@ensforge/test-integration/Gateways") {
  static readonly layer = Layer.succeed(
    Gateways,
    Gateways.of({
      serve,
      serveLookups,
      hang: listen((request) => request.resume()),
      serveProof: (proof) => serve(() => gatewayAnswer(proof)),
    }),
  );
}
