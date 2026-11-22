import { Array as Arr, Effect, Option } from "effect";

import type { Plan, Write } from "@ensforge/sdk";
import type { Client } from "@ensforge/sdk/extension";
import { isAddressEqual, type Address } from "viem";

import { HcaError } from "./errors/classes/HcaError.js";
import { owner as ownerExecutor } from "./executors/owner.js";
import { predictAddress, readAccount } from "./internal/account.js";
import { tokenApprovals } from "./internal/approvals.js";
import { deployCall, executeByOwnerCall, innerCalls } from "./internal/calls.js";
import { requireHca } from "./internal/deployment.js";
import { planFunding } from "./internal/funding.js";
import { checkSessionCalls, sessionProblem } from "./internal/session.js";
import type { ExecutionRequest, Executor, HcaFunding, HcaSession } from "./types.js";

/**
 * Options of {@link hca}.
 *
 * @stability experimental
 * @category hca
 * @since 1.0.0
 */
export type HcaOptions = {
  /**
   * How executions run. `hca()` picks the first executor that can run the request (one with
   * sessions when `session` is set) once, and never falls back to another when a send fails.
   *
   * @default [owner()]
   */
  executors?: readonly Executor[] | undefined;
  /** Run as this session (no owner prompts); needs an executor with sessions (`rhinestone()`). */
  session?: HcaSession | undefined;
  /**
   * Move what the HCA is short of from the owner's wallet: tokens its calls spend and the fees
   * executors charge. `"auto"` adds an owner transfer, or for relaying executors a permit (signed
   * while the plan is prepared, valid for `deadline` seconds) and a pull inside the first
   * execution. `"none"` fails with `INSUFFICIENT_TOKEN_BALANCE` instead.
   *
   * @default "auto"
   */
  funding?: HcaFunding | undefined;
};

// Keeps one execution well inside a block's gas; the ENS app bounds its batches the same way.
const maxCallsPerExecution = 32;

const run = <value, failure>(effect: Effect.Effect<value, failure>): Promise<value> =>
  Effect.runPromise(effect);

const ownerOf = (context: Write.Via.Context): Address => {
  if (context.account === undefined) {
    throw new HcaError({
      code: "HCA_NOT_VERIFIED",
      shortMessage: "An HCA write needs a signer: the HCA's owner.",
    });
  }
  return context.account;
};

/**
 * Sends writes through the signer's ENS Hosted Contract Account (HCA): pass it as `via` to any
 * write. Steps run as one atomic `executeByOwner` each, the HCA is deployed on first use, and the
 * approvals it needs to move the owner's names are added as owner transactions.
 *
 * **When to use**
 *
 * Use to migrate several names in one or two transactions instead of one per step, to run writes
 * gaslessly through a bundler, or prompt-free through a Rhinestone session.
 *
 * **Details**
 *
 * - The HCA runs the calls (`msg.sender`), so it needs authority over what they touch: migration
 *   and registration plan for it; other writes need the HCA to hold the roles they use.
 * - When the HCA holds less than the calls spend plus the executor's quoted fees, the shortfall
 *   moves from the owner's wallet (`funding`): an owner transfer, or a permit pull inside the
 *   first relayed execution (warning `HCA_FUNDING`).
 * - With an EIP-5792 wallet the owner's steps (approvals, deployment, executions) share one bundle.
 * - Never selected implicitly: the user should agree to use their HCA.
 *
 * **Example** (Migrating through the HCA)
 *
 * ```ts
 * import { hca } from "@ensforge/hca"
 *
 * await ens.migration.migrateSync({ names: ["alice.eth", "bob.eth"], via: hca() })
 * ```
 *
 * **Example** (Gasless through a bundler)
 *
 * ```ts
 * import { hca, pimlico } from "@ensforge/hca"
 *
 * await ens.hca.executeSync({ calls, via: hca({ executors: [pimlico({ apiKey, sponsor: true })] }) })
 * ```
 *
 * **Example** (Prompt-free with a session)
 *
 * ```ts
 * import { hca, rhinestone } from "@ensforge/hca"
 *
 * const via = hca({ executors: [rhinestone({ sdk })], session })
 * await ens.record.set({ name: "alice.eth", texts: { url }, via })
 * ```
 *
 * @stability experimental
 * @category hca
 * @since 1.0.0
 */
export const hca = (options: HcaOptions = {}): Write.Via => {
  const executors = options.executors ?? [ownerExecutor()];
  const { session } = options;
  const executor = Option.getOrUndefined(
    Arr.findFirst(
      executors,
      (candidate) => session === undefined || candidate.capabilities.sessions,
    ),
  );
  if (executor === undefined) throw new HcaError({ code: "HCA_EXECUTOR_UNSUPPORTED" });

  const prepare = Effect.fnUntraced(function* (plan: Plan, context: Write.Via.Context) {
    const client = context.client as Client;
    const owner = ownerOf(context);
    const deployment = yield* requireHca(client);
    const account = yield* readAccount(client, { owner });
    if (account.deployed && account.problems.length > 0) {
      return yield* Effect.fail(
        new HcaError({ code: "HCA_NOT_VERIFIED", details: Arr.map(account.problems, String) }),
      );
    }
    if (session !== undefined) {
      const problem =
        (yield* sessionProblem(client, session)) ??
        (!isAddressEqual(session.owner, owner)
          ? "another owner"
          : !isAddressEqual(session.hca, account.address)
            ? "another account"
            : undefined);
      if (problem !== undefined) {
        return yield* Effect.fail(
          new HcaError({ code: "HCA_SESSION_INVALID", details: [problem] }),
        );
      }
    }

    const v1 = client.deployment.v1?.contracts;
    const warnings: Plan.Warning[] = [...plan.warnings];

    // One setup step first: deploy the HCA and approve it for every name token it moves.
    const routed = Arr.filter(plan.steps, (step) => step.from !== "signer");
    const approvals = tokenApprovals(
      Arr.flatMap(routed, (step) => step.calls),
      {
        owner,
        hca: account.address,
        baseRegistrar: v1?.baseRegistrar,
        nameWrapper: v1?.nameWrapper,
      },
    );
    if (approvals.wrapper) {
      warnings.push({
        code: "HCA_WRAPPER_APPROVAL",
        message:
          "Your HCA becomes a NameWrapper operator for your wrapped names; revoke it with approval.setOperator once done.",
      });
    }
    const setup = [
      ...(!account.deployed && !executor.capabilities.deploys
        ? [
            deployCall(
              deployment.contracts.standaloneFactory,
              owner,
              deployment.contracts.standaloneImplementation,
            ),
          ]
        : []),
      ...approvals.calls,
    ];

    // Consecutive HCA steps without a wait run as one atomic execution, up to a call budget.
    const steps: Plan.Step[] = [];
    let batch: Plan.Step[] = [];
    const flush = () => {
      const [first] = batch;
      if (first === undefined) return;
      const calls = Arr.flatMap(batch, (step) => step.calls);
      steps.push({
        id: Arr.join(
          Arr.map(batch, (step) => step.id),
          "+",
        ),
        description: Arr.join(
          Arr.map(batch, (step) => step.description),
          ", ",
        ),
        // The wallet funds its own executions; bundlers and intents spend the HCA's balance.
        calls: [executeByOwnerCall(account.address, calls, executor.send === undefined)],
        ...(first.waitFor === undefined ? {} : { waitFor: first.waitFor }),
      });
      batch = [];
    };
    for (const step of plan.steps) {
      if (step.from === "signer") {
        flush();
        steps.push(step);
        continue;
      }
      if (session !== undefined) yield* checkSessionCalls(client, session, step.calls);
      const size = Arr.reduce(batch, 0, (total, member) => total + member.calls.length);
      if (step.waitFor !== undefined || size + step.calls.length > maxCallsPerExecution) flush();
      batch.push(step);
    }
    flush();

    // Each HCA execution is its own intent with its own fee; only the first deploys the HCA.
    const quote = executor.quote;
    const executions = Arr.filter(steps, (step) => step.from !== "signer");
    const quoted =
      quote === undefined
        ? undefined
        : yield* Effect.forEach(
            executions,
            (step, index) =>
              Effect.tryPromise({
                try: () =>
                  quote(
                    {
                      chainId: client.chain.id,
                      hca: account.address,
                      owner,
                      deployed: account.deployed || index > 0,
                      calls: Arr.flatMap(step.calls, (call) => innerCalls(call) ?? []),
                      session,
                      description: step.description,
                    },
                    context,
                  ),
                catch: (cause) =>
                  cause instanceof HcaError
                    ? cause
                    : new HcaError({ code: "HCA_EXECUTION_FAILED", cause }),
              }),
            { concurrency: "unbounded" },
          );
    const fees = quoted === undefined ? plan.fees : Arr.flatten(quoted);

    // What the HCA spends and pays in fees comes from the owner's wallet when the HCA is short.
    const funding = yield* planFunding(client, {
      plan,
      owner,
      hca: account.address,
      fees: fees ?? [],
      relayed: executor.send !== undefined,
      session,
      wallet: context.walletClient,
      mode: options.funding ?? "auto",
    });
    const first = Arr.findFirstIndex(steps, (step) => step.from !== "signer");
    const opening = Option.flatMap(first, (index) => Arr.get(steps, index));
    if (funding.pulls.length > 0 && Option.isSome(first) && Option.isSome(opening)) {
      const calls = [
        ...funding.pulls,
        ...Arr.flatMap(opening.value.calls, (call) => innerCalls(call) ?? []),
      ];
      if (session !== undefined) yield* checkSessionCalls(client, session, calls);
      steps[first.value] = {
        ...opening.value,
        calls: [executeByOwnerCall(account.address, calls, false)],
      };
    }
    warnings.push(...funding.warnings);
    if (setup.length > 0 || funding.transfers.length > 0) {
      steps.unshift({
        id: "hca-setup",
        description: "Set up your HCA",
        calls: [...setup, ...funding.transfers],
        from: "signer",
      });
    }

    return {
      ...plan,
      steps,
      calls: Arr.flatMap(steps, (step) => step.calls),
      requirements: [...plan.requirements, ...funding.requirements],
      warnings,
      ...(fees === undefined ? {} : { fees }),
    } satisfies Plan;
  });

  const send = executor.send;
  return {
    id: `hca:${executor.id}`,
    sender: (context) => run(predictAddress(context.client as Client, ownerOf(context))),
    prepare: (plan, context) => run(prepare(plan, context)),
    ...(send === undefined
      ? {}
      : {
          // `Write.Via` routes are Promise-based, like the executor they wrap.
          // oxlint-disable-next-line effecttsgo/async-function
          send: async (step, context) => {
            const call = step.calls[0];
            const calls = call === undefined ? undefined : innerCalls(call);
            if (call === undefined || calls === undefined) {
              throw new HcaError({
                code: "HCA_EXECUTION_FAILED",
                shortMessage: `"${step.description}" is not an HCA execution.`,
              });
            }
            const owner = ownerOf(context);
            const account = await run(readAccount(context.client as Client, { owner }));
            const request: ExecutionRequest = {
              chainId: context.chainId,
              hca: call.to,
              owner,
              deployed: account.deployed,
              calls,
              session,
              description: step.description,
            };
            return send(request, context);
          },
          // oxlint-disable-next-line effecttsgo/async-function
          status: async (reference, context) =>
            executor.status === undefined
              ? { status: "pending" as const }
              : executor.status(reference, context),
        }),
  };
};
