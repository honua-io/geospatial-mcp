import assert from "node:assert/strict";
import test from "node:test";
import { certificationFailed, INSPECTOR_PING_SKIP_REASON } from "../semantic-verdict.mjs";
import { DEPLOYMENT_WORKSPACE_OPERATIONS, NO_TARGET_REASON } from "../deployment-workspace-target.mjs";

const inspector = { canonicalClient: "MCP Inspector" };
const sdk = { canonicalClient: "Official MCP TypeScript SDK" };

test("the pinned Inspector's exact structural ping skip preserves a nonpass receipt without failing the runner", () => {
  const checks = { initialize: { result: "pass" }, ping: { result: "skip", reason: INSPECTOR_PING_SKIP_REASON } };
  const retained = structuredClone(checks);
  assert.equal(certificationFailed(checks, inspector), false);
  assert.deepEqual(checks, retained);
  assert.equal(certificationFailed(checks, sdk), true);
  assert.equal(certificationFailed({ ping: { result: "skip", reason: "ping unavailable" } }, inspector), true);
  assert.equal(certificationFailed({ other: { result: "skip", reason: INSPECTOR_PING_SKIP_REASON } }, inspector), true);
  assert.equal(certificationFailed({ ping: { result: "fail", reason: INSPECTOR_PING_SKIP_REASON } }, inspector), true);
});

test("only the exact deployment operations and reason are allowed when no target is configured", () => {
  for (const operation of DEPLOYMENT_WORKSPACE_OPERATIONS) {
    const checks = { [operation]: { result: "skip", reason: NO_TARGET_REASON } };
    for (const client of [inspector, sdk]) {
      assert.equal(certificationFailed(checks, client), false);
      assert.equal(certificationFailed({ [operation]: { result: "fail", reason: NO_TARGET_REASON } }, client), true);
      for (const targetId of ["owned-target", " ", "invalid!"])
        assert.equal(certificationFailed(checks, { ...client, targetId }), true);
      assert.equal(certificationFailed({ [operation]: { result: "skip", reason: "no target" } }, client), true);
    }
    assert.equal(certificationFailed(checks, { canonicalClient: "unknown" }), true);
  }
});

test("semantic failures, unknown skips and missing observers still fail every client", () => {
  for (const client of [inspector, sdk]) {
    for (const operation of ["ping", ...DEPLOYMENT_WORKSPACE_OPERATIONS, "behavior/cancellation", "behavior/resources-pagination", "tools/call:publish_result"]) {
      assert.equal(certificationFailed({ [operation]: { result: "fail" } }, client), true);
      assert.equal(certificationFailed({ [operation]: { result: "skip", reason: "observer unavailable" } }, client), true);
    }
    assert.equal(certificationFailed({ unknown: { result: "skip", reason: NO_TARGET_REASON } }, client), true);
    assert.equal(certificationFailed({ initialize: { result: "pass" }, protocolVersion: "2025-11-25" }, client), false);
  }
});
