import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { Context, Effect, Layer, type Scope } from "effect";

import { gatewayAnswer, type Proof } from "./dnssec.ts";

/** What a gateway answers: an HTTP status and a raw body. */
export type GatewayAnswer = { readonly status: number; readonly body: string };

/** A running gateway: its URL, and how many requests reached it. */
export type Gateway = { readonly url: string; readonly requests: () => number };

const serve = (answer: () => GatewayAnswer): Effect.Effect<Gateway, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.callback<{ readonly gateway: Gateway; readonly close: () => void }>((resume) => {
      let requests = 0;
      // Answers once the request body is read; answering earlier can reset the connection.
      const server = createServer((request, response) => {
        requests += 1;
        request.resume().on("end", () => {
          const { status, body } = answer();
          response.writeHead(status, { "Content-Type": "application/json" }).end(body);
        });
      });
      server.listen(0, "127.0.0.1", () => {
        const { port } = server.address() as AddressInfo;
        resume(
          Effect.succeed({
            gateway: { url: `http://127.0.0.1:${port}/`, requests: () => requests },
            close: () => server.close(),
          }),
        );
      });
    }),
    ({ close }) => Effect.sync(close),
  ).pipe(Effect.map(({ gateway }) => gateway));

/** In-process CCIP-Read and DNSSEC gateways on 127.0.0.1. */
export class Gateways extends Context.Service<
  Gateways,
  {
    /** A gateway that answers every request with `answer()`, for the enclosing scope. */
    readonly serve: (answer: () => GatewayAnswer) => Effect.Effect<Gateway, never, Scope.Scope>;
    /** An ENSIP-17 DNSSEC gateway that answers every request with `proof`. */
    readonly serveProof: (proof: Proof) => Effect.Effect<Gateway, never, Scope.Scope>;
  }
>()("@ensforge/test-integration/Gateways") {
  static readonly layer = Layer.succeed(
    Gateways,
    Gateways.of({ serve, serveProof: (proof) => serve(() => gatewayAnswer(proof)) }),
  );
}
