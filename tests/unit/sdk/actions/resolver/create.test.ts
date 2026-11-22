import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect } from "effect";

import { Abis, Deployments, Roles } from "@ensforge/contracts";
import { predictVerifiableProxyAddress } from "@ensforge/contracts/v2";
import { Actions } from "@ensforge/sdk/effect";
import { decodeFunctionData, type Hex } from "viem";

import { clientFor, decodeCalls, other, resolverA, signer } from "../world.js";

const v2 = Deployments.mainnet.v2.contracts;
const all = Roles.enhancedAccessControl.allRoles;

describe("resolver.create.prepare", () => {
  // The ENS app only accepts resolvers whose writers hold the full mask, and the grant cannot be
  // widened later; a route's account deploys the proxy, so the address comes from it.
  it.effect.each([
    ["the signer", undefined, signer, [signer]],
    // `sender` is the route's adapter boundary, a Promise by contract.
    // oxlint-disable-next-line effecttsgo/async-function -- the Promise-typed sender boundary under test
    ["a route's account", { id: "account", sender: async () => other }, other, [other, signer]],
  ] as const)("grants every role to the writers when %s deploys it", ([, via, deployer, writers]) =>
    Effect.gen(function* () {
      const { ens } = clientFor({ name: "alice.eth" });

      const plan = yield* Actions.resolver.create.prepare(ens, via === undefined ? {} : { via });

      assert.strictEqual(plan.account, signer);
      const [to, functionName, args] = decodeCalls(plan.calls, Abis.v2.verifiableFactory)[0] ?? [];
      assert.strictEqual(to, v2.verifiableFactory);
      assert.strictEqual(functionName, "deployProxy");
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `deployProxy(implementation, salt, data)`
      const [, salt, data] = args as readonly [Hex, bigint, Hex];
      assert.strictEqual(
        plan.deploys[0]?.address,
        predictVerifiableProxyAddress({
          factory: v2.verifiableFactory,
          proxyLogic: resolverA,
          deployer,
          salt,
        }),
      );
      const init = decodeFunctionData({ abi: Abis.v2.permissionedResolver, data });
      assert.deepStrictEqual(
        init.args?.[0],
        Arr.map(writers, (account) => ({ account, roleBitmap: all })),
      );
    }),
  );
});
