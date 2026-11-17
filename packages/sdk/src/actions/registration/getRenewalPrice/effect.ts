import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
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
  ): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
    const names = yield* parseEthNames(options.names);
    const contracts = yield* requireRegistrationContracts(client);
    const token = yield* paymentTokenAddress(contracts, options.paymentToken);

    const { quotes, info } = yield* Effect.all(
      {
        quotes: quoteRenewals(client, contracts, { ...options, names, token }),
        // Each route's price check enforces its own oracle's payment tokens.
        info: tokenInfo(client, token),
      },
      { concurrency: "unbounded" },
    );

    return {
      total: quotes.reduce((sum, quote) => sum + quote.amount, 0n),
      token: info,
      items: quotes.map(({ name, route, amount }) => ({ name, route, amount })),
    };
  },
  Action.withContext("registration.getRenewalPrice", { contractKind: "registrar" }),
);
