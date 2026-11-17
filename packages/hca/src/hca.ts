import { Effect } from "effect";

import type { Plan, Write } from "@ensforge/sdk";
import type { Client } from "@ensforge/sdk/extension";
import { isAddressEqual, type Address } from "viem";

import { HcaError } from "./errors/classes/HcaError.js";
import { owner as ownerExecutor } from "./executors/owner.js";
import { predictAddress, readAccount } from "./internal/account.js";
import { tokenApprovals } from "./internal/approvals.js";
import { deployCall, executeByOwnerCall, innerCalls } from "./internal/calls.js";
import { requireHca } from "./internal/deployment.js";
import { checkSessionCalls, sessionProblem } from "./internal/session.js";
import type { ExecutionRequest, Executor, HcaSession } from "./types.js";

/**
 * Options of {@link hca}.
 *
 * @category hca
 * @since 1.0.0
 */
export type HcaOptions = {
  /**
   * How executions run, in order of preference; the first that can run the request is used.
   *
   * @default [owner()]
   */
  executors?: readonly Executor[] | undefined;
  /** Run as this session (no owner prompts); needs an executor with sessions (`rhinestone()`). */
  session?: HcaSession | undefined;
};

// Keeps one execution well inside a block's gas; the ENS app bounds its batches the same way.
const maxCallsPerExecution = 32;

const run = <value>(effect: Effect.Effect<value, unknown>): Promise<value> =>
  Effect.runPromise(effect as Effect.Effect<value>);

const ownerOf = (context: Write.Via.Context): Address => {
  if (context.account === undefined) {
    throw new HcaError({
      code: "HCA_NOT_VERIFIED",
      shortMessage: "An HCA write needs a signer: the HCA's owner.",
    });
  }
  return context.account;
};

const select = (executors: readonly Executor[], session: HcaSession | undefined): Executor => {
  const executor = executors.find(
    (candidate) => session === undefined || candidate.capabilities.sessions,
  );
  if (executor === undefined) throw new HcaError({ code: "HCA_EXECUTOR_UNSUPPORTED" });
  return executor;
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
 * @category hca
 * @since 1.0.0
 */
export const hca = (options: HcaOptions = {}): Write.Via => {
  const executors = options.executors ?? [ownerExecutor()];
  const { session } = options;
  const executor = select(executors, session);

  const prepare = Effect.fnUntraced(function* (plan: Plan, context: Write.Via.Context) {
    const client = context.client as Client;
    const owner = ownerOf(context);
    const deployment = yield* requireHca(client);
    const account = yield* readAccount(client, { owner });
    if (account.deployed && account.problems.length > 0) {
      return yield* Effect.fail(
        new HcaError({ code: "HCA_NOT_VERIFIED", details: account.problems.map(String) }),
      );
    }
    if (session !== undefined) {
      const problem = yield* sessionProblem(client, session);
      if (problem !== undefined || !isAddressEqual(session.owner, owner)) {
        return yield* Effect.fail(
          new HcaError({ code: "HCA_SESSION_INVALID", details: [problem ?? "another owner"] }),
        );
      }
    }

    const v1 = client.deployment.v1?.contracts;
    const warnings: Plan.Warning[] = [...plan.warnings];

    // One setup step first: deploy the HCA and approve it for every name token it moves.
    const routed = plan.steps.filter((step) => step.from !== "signer");
    const approvals = tokenApprovals(
      routed.flatMap((step) => step.calls),
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
      const calls = batch.flatMap((step) => step.calls);
      steps.push({
        id: batch.map((step) => step.id).join("+"),
        description: batch.map((step) => step.description).join(", "),
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
      const size = batch.reduce((total, member) => total + member.calls.length, 0);
      if (step.waitFor !== undefined || size + step.calls.length > maxCallsPerExecution) flush();
      batch.push(step);
    }
    flush();
    if (setup.length > 0) {
      steps.unshift({
        id: "hca-setup",
        description: "Set up your HCA",
        calls: setup,
        from: "signer",
      });
    }

    const quote = executor.quote;
    const fees =
      quote === undefined
        ? plan.fees
        : yield* Effect.tryPromise(() =>
            quote(
              {
                chainId: client.chain.id,
                hca: account.address,
                owner,
                deployed: account.deployed,
                calls: steps.flatMap((step) => innerCalls(step.calls[0] as Plan.Call) ?? []),
                session,
                description: plan.operation,
              },
              context,
            ),
          );

    return {
      ...plan,
      steps,
      calls: steps.flatMap((step) => step.calls),
      warnings,
      ...(fees === undefined ? {} : { fees }),
    } satisfies Plan;
  });

  const send = executor.send;
  return {
    id: `hca:${executor.id}`,
    sender: (context) =>
      run(predictAddress(context.client as Client, ownerOf(context))) as Promise<Address>,
    prepare: (plan, context) => run(prepare(plan, context)),
    ...(send === undefined
      ? {}
      : {
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
          status: async (reference, context) =>
            executor.status === undefined
              ? { status: "pending" as const }
              : executor.status(reference, context),
        }),
  };
};
