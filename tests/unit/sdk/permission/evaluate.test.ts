import { assert, describe, it } from "@effect/vitest";

import { Roles } from "@ensforge/contracts";
import type {
  Operation,
  PermissionCheck,
} from "@ensforge/sdk/internal/actions/permission/get/types";
import { evaluate } from "@ensforge/sdk/internal/internal/permission/evaluate";
import type { PermissionFacts } from "@ensforge/sdk/internal/internal/permission/facts";
import * as Fuse from "@ensforge/sdk/internal/utils/Fuse";
import { getAddress, type Address } from "viem";

const address = (n: number): Address => getAddress(`0x${n.toString(16).padStart(40, "0")}`);
const [me, owner, registry, subregistry, resolver, wrapper, registrar, ensRegistry] = [
  1, 2, 3, 4, 5, 6, 7, 8,
].map(address) as [Address, Address, Address, Address, Address, Address, Address, Address];
const contracts = { registry: ensRegistry, baseRegistrar: registrar, nameWrapper: wrapper };

type Overrides = {
  readonly protocol?: "v1" | "v2";
  readonly status?: string;
  readonly wrapped?: boolean;
  readonly isEth2ld?: boolean;
  readonly owner?: Address | null;
  readonly registrant?: Address | null;
  readonly manager?: Address | null;
  readonly fuses?: number;
  readonly subregistry?: Address | null;
  readonly v1?: Partial<PermissionFacts["v1"]>;
  readonly v2?: Partial<PermissionFacts["v2"]>;
  readonly resolver?: PermissionFacts["resolver"];
};

const factsOf = (o: Overrides = {}): PermissionFacts =>
  ({
    account: me,
    loaded: {
      state: {
        status: o.status ?? "registered",
        protocol: o.protocol ?? "v2",
        wrapped: o.wrapped ?? false,
        owner: o.owner === undefined ? me : o.owner,
        registrant: o.registrant === undefined ? me : o.registrant,
        registry,
        resource: 7n,
        subregistry: o.subregistry ?? null,
      },
      data: {
        parts: { isEth2ld: o.isEth2ld ?? true },
        v1: {
          registryOwner: o.manager === undefined ? me : o.manager,
          wrapper: { fuses: o.fuses ?? 0 },
        },
      },
    },
    v1: {
      registryOperator: false,
      registrarOperator: false,
      registrarApproved: null,
      wrapperOperator: false,
      wrapperApproved: null,
      ...o.v1,
    },
    v2: {
      roles: 0n,
      ownerRoles: Roles.registry.canTransferAdmin,
      ownerOnlyAssignee: true,
      operator: false,
      subregistryRoles: null,
      ...o.v2,
    },
    resolver: o.resolver,
  }) as unknown as PermissionFacts;

/** What a check says, in one comparable line. */
const summary = (check: PermissionCheck) =>
  check.allowed === true
    ? `allowed via ${check.via}`
    : check.allowed === null
      ? "unknown"
      : `denied: ${check.missing
          .map((requirement) =>
            requirement.type === "blocked"
              ? `blocked ${requirement.reason}`
              : requirement.type === "roles"
                ? `roles ${requirement.roles.join("+")} on ${requirement.contract}`
                : `${requirement.type} ${"owner" in requirement ? requirement.owner : ""} on ${requirement.contract}`,
          )
          .join(", ")}`;

const check = (overrides: Overrides, operation: Operation, withContracts = true) =>
  summary(evaluate(factsOf(overrides), operation, withContracts ? contracts : undefined));

const permissioned = (roles: { root?: bigint; resource?: Map<bigint, bigint> } = {}) => ({
  address: resolver,
  kind: "permissioned" as const,
  rootRoles: roles.root ?? 0n,
  resourceRoles: roles.resource ?? new Map(),
  owner: null,
  operator: undefined,
  delegate: undefined,
  nameKnown: true,
  frozen: false,
});

const nodeBased = (overrides: Partial<NonNullable<PermissionFacts["resolver"]>> = {}) => ({
  address: resolver,
  kind: "node" as const,
  rootRoles: 0n,
  resourceRoles: new Map(),
  owner: me,
  operator: false,
  delegate: false,
  nameKnown: true,
  frozen: false,
  ...overrides,
});

describe("evaluate", () => {
  it("allows nothing on a name that is not registered, but renewing in grace", () => {
    assert.strictEqual(check({ status: "expired" }, "transfer"), "denied: blocked status");
    assert.strictEqual(check({ status: "grace" }, "transfer"), "denied: blocked status");
    assert.strictEqual(check({ status: "grace" }, "renew"), "allowed via anyone");
    assert.strictEqual(check({ status: "available" }, "renew"), "denied: blocked status");
  });

  describe("ENSv2", () => {
    it("transfers by the owner or an operator, while the token may move safely", () => {
      assert.strictEqual(check({}, "transfer"), "allowed via owner");
      assert.strictEqual(check({ owner }, "transfer"), `denied: owner ${owner} on ${registry}`);
      assert.strictEqual(
        check({ owner, v2: { operator: true } }, "transfer"),
        "allowed via operator",
      );
      assert.strictEqual(
        check({ v2: { ownerRoles: 0n } }, "transfer"),
        "denied: blocked transfer-disallowed",
      );
      assert.strictEqual(
        check({ v2: { ownerOnlyAssignee: false } }, "transfer"),
        "denied: blocked transfer-disallowed",
      );
    });

    it("sets resolvers and subregistries with the matching role", () => {
      for (const operation of ["setResolver", "setSubregistry"] as const) {
        assert.strictEqual(check({}, operation), `denied: roles ${operation} on ${registry}`);
        assert.strictEqual(
          check({ v2: { roles: Roles.registry[operation] } }, operation),
          "allowed via roles",
        );
      }
      // Another role is not enough.
      assert.strictEqual(
        check({ v2: { roles: Roles.registry.setSubregistry } }, "setResolver"),
        `denied: roles setResolver on ${registry}`,
      );
    });

    it("creates subnames with the registrar role, attaching a subregistry first when there is none", () => {
      assert.strictEqual(check({}, "createSubname"), `denied: roles setSubregistry on ${registry}`);
      assert.strictEqual(
        check({ v2: { roles: Roles.registry.setSubregistry } }, "createSubname"),
        "allowed via roles",
      );
      assert.strictEqual(
        check({ subregistry, v2: { subregistryRoles: 0n } }, "createSubname"),
        `denied: roles registrar on ${subregistry}`,
      );
      assert.strictEqual(
        check({ subregistry, v2: { subregistryRoles: Roles.registry.registrar } }, "createSubname"),
        "allowed via roles",
      );
    });

    it("removes subnames with the unregister role on the subregistry", () => {
      assert.strictEqual(check({}, "removeSubname"), "denied: blocked unsupported");
      assert.strictEqual(
        check({ subregistry, v2: { subregistryRoles: Roles.registry.registrar } }, "removeSubname"),
        `denied: roles unregister on ${subregistry}`,
      );
      assert.strictEqual(
        check(
          { subregistry, v2: { subregistryRoles: Roles.registry.unregister } },
          "removeSubname",
        ),
        "allowed via roles",
      );
    });

    it("renews .eth names for anyone, and other names with the renew role", () => {
      assert.strictEqual(check({ owner }, "renew"), "allowed via anyone");
      assert.strictEqual(check({ isEth2ld: false }, "renew"), `denied: roles renew on ${registry}`);
      assert.strictEqual(
        check({ isEth2ld: false, v2: { roles: Roles.registry.renew } }, "renew"),
        "allowed via roles",
      );
    });

    it("has no TTL or manager", () => {
      for (const operation of ["setTtl", "setManager", "reclaim"] as const) {
        assert.strictEqual(check({}, operation), "denied: blocked unsupported");
      }
    });
  });

  describe("wrapped ENSv1", () => {
    const wrapped = { protocol: "v1", wrapped: true } as const;

    it("lets the owner, an operator or an approved account act until a fuse is burned", () => {
      const guarded = {
        transfer: "cannotTransfer",
        setResolver: "cannotSetResolver",
        setTtl: "cannotSetTtl",
        createSubname: "cannotCreateSubdomain",
      } as const;
      for (const [operation, fuse] of Object.entries(guarded) as [
        keyof typeof guarded,
        Fuse.Name,
      ][]) {
        assert.strictEqual(check(wrapped, operation), "allowed via owner", operation);
        assert.strictEqual(
          check({ ...wrapped, owner }, operation),
          `denied: owner ${owner} on ${wrapper}`,
          operation,
        );
        assert.strictEqual(
          check({ ...wrapped, owner, v1: { wrapperOperator: true } }, operation),
          "allowed via operator",
        );
        assert.strictEqual(
          check({ ...wrapped, owner, v1: { wrapperApproved: me } }, operation),
          "allowed via approved",
        );
        assert.strictEqual(
          check({ ...wrapped, fuses: Fuse.from([fuse]) }, operation),
          "denied: blocked fuse",
          operation,
        );
      }
    });

    it("removes subnames as the owner, whatever the fuses", () => {
      assert.strictEqual(
        check({ ...wrapped, fuses: Fuse.from(["cannotCreateSubdomain"]) }, "removeSubname"),
        "allowed via owner",
      );
      assert.strictEqual(
        check({ ...wrapped, owner }, "removeSubname"),
        `denied: owner ${owner} on ${wrapper}`,
      );
    });

    it("renews .eth names for anyone, and subnames only with canExtendExpiry", () => {
      assert.strictEqual(check({ ...wrapped, owner }, "renew"), "allowed via anyone");
      assert.strictEqual(
        check({ ...wrapped, isEth2ld: false }, "renew"),
        "denied: blocked unsupported",
      );
      assert.strictEqual(
        check({ ...wrapped, isEth2ld: false, fuses: Fuse.from(["canExtendExpiry"]) }, "renew"),
        "allowed via owner",
      );
    });

    it("has no manager or subregistry", () => {
      for (const operation of ["setSubregistry", "setManager", "reclaim"] as const) {
        assert.strictEqual(check(wrapped, operation), "denied: blocked unsupported");
      }
    });
  });

  describe("unwrapped ENSv1", () => {
    const unwrapped = { protocol: "v1" } as const;

    it("transfers .eth names as the registrant and other names as the manager", () => {
      assert.strictEqual(check({ ...unwrapped, manager: owner }, "transfer"), "allowed via owner");
      assert.strictEqual(
        check({ ...unwrapped, registrant: owner }, "transfer"),
        `denied: owner ${owner} on ${registrar}`,
      );
      assert.strictEqual(
        check({ ...unwrapped, registrant: owner, v1: { registrarOperator: true } }, "transfer"),
        "allowed via operator",
      );
      assert.strictEqual(
        check({ ...unwrapped, registrant: owner, v1: { registrarApproved: me } }, "transfer"),
        "allowed via approved",
      );
      assert.strictEqual(
        check({ ...unwrapped, isEth2ld: false, manager: owner }, "transfer"),
        `denied: owner ${owner} on ${ensRegistry}`,
      );
    });

    it("sets resolvers, TTLs and subnames as the manager or a registry operator", () => {
      for (const operation of [
        "setResolver",
        "setTtl",
        "createSubname",
        "removeSubname",
      ] as const) {
        assert.strictEqual(check(unwrapped, operation), "allowed via owner");
        assert.strictEqual(
          check({ ...unwrapped, manager: owner }, operation),
          `denied: owner ${owner} on ${ensRegistry}`,
        );
        assert.strictEqual(
          check({ ...unwrapped, manager: owner, v1: { registryOperator: true } }, operation),
          "allowed via operator",
        );
      }
    });

    it("changes the manager as the manager, or as the registrant of a .eth name", () => {
      assert.strictEqual(
        check({ ...unwrapped, registrant: owner }, "setManager"),
        "allowed via owner",
      );
      assert.strictEqual(
        check({ ...unwrapped, manager: owner }, "setManager"),
        "allowed via owner",
      );
      assert.strictEqual(
        check({ ...unwrapped, manager: owner, registrant: owner }, "setManager"),
        `denied: owner ${owner} on ${registrar}`,
      );
      assert.strictEqual(
        check({ ...unwrapped, isEth2ld: false, manager: owner }, "setManager"),
        `denied: owner ${owner} on ${ensRegistry}`,
      );
    });

    it("reclaims and renews only .eth names", () => {
      assert.strictEqual(check({ ...unwrapped, manager: owner }, "reclaim"), "allowed via owner");
      assert.strictEqual(
        check({ ...unwrapped, isEth2ld: false }, "reclaim"),
        "denied: blocked unsupported",
      );
      assert.strictEqual(check({ ...unwrapped, registrant: owner }, "renew"), "allowed via anyone");
      assert.strictEqual(
        check({ ...unwrapped, isEth2ld: false }, "renew"),
        "denied: blocked unsupported",
      );
      assert.strictEqual(check(unwrapped, "setSubregistry"), "denied: blocked unsupported");
    });

    it("needs the deployment's ENSv1 contracts", () => {
      assert.strictEqual(check(unwrapped, "transfer", false), "denied: blocked unsupported");
    });
  });

  describe("records", () => {
    const text = { setRecord: "text", key: "url" } as const;

    it("needs a resolver", () => {
      assert.strictEqual(check({}, text), "denied: blocked unsupported");
    });

    it("checks PermissionedResolver roles at the root or on the record's resource", () => {
      assert.strictEqual(
        check({ resolver: permissioned() }, text),
        `denied: roles setText on ${resolver}`,
      );
      assert.strictEqual(
        check({ resolver: permissioned({ root: Roles.resolver.setText }) }, text),
        "allowed via roles",
      );
      assert.strictEqual(
        check({ resolver: permissioned({ root: Roles.resolver.setAddr }) }, text),
        `denied: roles setText on ${resolver}`,
      );
      const roles = {
        address: "setAddr",
        contentHash: "setContenthash",
        abi: "setAbi",
        name: "setName",
        interface: "setInterface",
        data: "setData",
        link: "link",
      } as const;
      for (const [setRecord, role] of Object.entries(roles)) {
        const operation = { setRecord } as Operation;
        assert.strictEqual(
          check({ resolver: permissioned({ root: Roles.resolver[role] }) }, operation),
          "allowed via roles",
          setRecord,
        );
        assert.strictEqual(
          check({ resolver: permissioned() }, operation),
          `denied: roles ${role} on ${resolver}`,
          setRecord,
        );
      }
      assert.strictEqual(
        check(
          { resolver: permissioned({ root: Roles.resolver.setText }) },
          { setRecord: "pubkey" },
        ),
        "denied: blocked unsupported",
      );
    });

    it("lets the owner, an operator or a delegate edit a node-based resolver", () => {
      assert.strictEqual(check({ resolver: nodeBased() }, text), "allowed via owner");
      assert.strictEqual(
        check({ resolver: nodeBased({ owner }) }, text),
        `denied: owner ${owner} on ${resolver}`,
      );
      assert.strictEqual(
        check({ resolver: nodeBased({ owner, operator: true }) }, text),
        "allowed via operator",
      );
      assert.strictEqual(
        check({ resolver: nodeBased({ owner, delegate: true }) }, text),
        "allowed via delegate",
      );
      assert.strictEqual(
        check({ resolver: nodeBased({ operator: undefined, delegate: undefined }) }, text),
        "unknown",
      );
      assert.strictEqual(
        check({ resolver: nodeBased({ frozen: true }) }, text),
        "denied: blocked unsupported",
      );
      assert.strictEqual(
        check({ resolver: nodeBased({ nameKnown: false }) }, text),
        "denied: blocked unsupported",
      );
    });
  });
});
