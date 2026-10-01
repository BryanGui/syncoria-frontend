import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_TENANTS, DEMO_ACTIONS } from "../src/controlPlane/fixtures.ts";
import {
  prioritizeTenants,
  selectTenantActions,
  summarizeFleet,
} from "../src/controlPlane/model.ts";

test("demo fleet has consistent counters and explicit synthetic provenance", () => {
  const summary = summarizeFleet(DEMO_TENANTS, DEMO_ACTIONS);
  assert.deepEqual(
    [
      summary.total,
      summary.critical,
      summary.watch,
      summary.due,
      summary.healthy,
      summary.openActions,
    ],
    [50, 3, 7, 5, 35, 15],
  );
  assert.ok(
    DEMO_TENANTS.every(
      (t) => t.provenance === "synthetic/demo" && t.id.startsWith("demo:"),
    ),
  );
  assert.ok(
    DEMO_ACTIONS.every(
      (a) =>
        a.provenance === "synthetic/demo" &&
        DEMO_TENANTS.some((t) => t.id === a.tenantId),
    ),
  );
});
test("tenant context excludes other tenants actions", () => {
  const actions = selectTenantActions(DEMO_ACTIONS, "demo:1");
  assert.equal(actions.length, 1);
  assert.ok(actions.every((a) => a.tenantId === "demo:1"));
  assert.deepEqual(selectTenantActions(DEMO_ACTIONS, "real-tenant"), []);
});
test("unconnected tenants never count as healthy and unavailable cost is not zero", () => {
  const live = [
    {
      ...DEMO_TENANTS[0],
      status: "unknown",
      provenance: "syncoria",
      costEur: null,
    },
  ];
  const summary = summarizeFleet(live, []);
  assert.equal(summary.healthy, 0);
  assert.equal(summary.unknown, 1);
  assert.equal(summary.costEur, null);
  assert.equal(summarizeFleet([], []).costEur, null);
});
test("priority order is stable without mutating source", () => {
  const tenants = [...DEMO_TENANTS].reverse();
  const ids = tenants.map((t) => t.id);
  assert.equal(prioritizeTenants(tenants)[0].status, "critical");
  assert.deepEqual(
    tenants.map((t) => t.id),
    ids,
  );
});
