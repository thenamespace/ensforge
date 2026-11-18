import { Effect, Array as Arr } from "effect";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { requireRegistrationContracts } from "../../../internal/registration/contracts.js";
import { parseEthNames } from "../../../internal/registration/labels.js";
import { paymentTokenAddress, tokenInfo } from "../../../internal/registration/payment.js";
import { quoteRenewals } from "../../../internal/registration/renewal.js";
import type { getRenewalPrice as Promises } from "./index.js";

/** @internal Implementation of `Actions.registration.getRenewalPrice`. */
export const getRenewalPrice = Effect.fn("ensforge.registration.getRenewalPrice")(
  function* (
    client: Client,
    options: Promises.Options,
  ): Effect.fn.Return<Promises.ReturnType, AnyError> {
    const names = yield* parseEthNames(options.names);
    const contracts = yield* requireRegistrationContracts(client);
    const token = yield* paymentTokenAddress(contracts, options.paymentToken);

    const results = yield* Effect.all(
      {
        quotes: Effect.result(quoteRenewals(client, contracts, { ...options, names, token })),
        info: Effect.result(tokenInfo(client, token)),
      },
      { concurrency: "unbounded" },
    );
    // Each route's price check enforces its own oracle's payment tokens; a refused token fails as
    // unsupported, not on its (possibly missing) ERC-20 metadata.
    const quotes = yield* Effect.fromResult(results.quotes);
    const info = yield* Effect.fromResult(results.info);

    return {
      total: Arr.reduce(quotes, 0n, (sum, quote) => sum + quote.amount),
      token: info,
      items: Arr.map(quotes, ({ name, route, amount }) => ({ name, route, amount })),
    };
  },
  Action.withContext("registration.getRenewalPrice", { contractKind: "registrar" }),
);
