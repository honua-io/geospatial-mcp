import assert from "node:assert/strict";
import test from "node:test";
import { certificationFailed, INSPECTOR_PING_SKIP_REASON } from "../semantic-verdict.mjs";
import { DEPLOYMENT_WORKSPACE_OPERATIONS } from "../deployment-workspace-target.mjs";

import { CLIENTS } from "../requirements.mjs";

const inspector = { canonicalClient: CLIENTS.inspector.canonicalClient };
const sdk = { canonicalClient: CLIENTS.sdk.canonicalClient };

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

test("semantic failures, unknown skips and missing observers still fail every client", () => {
  for (const client of [inspector, sdk]) {
    for (const operation of ["ping", ...DEPLOYMENT_WORKSPACE_OPERATIONS, "behavior/cancellation", "behavior/resources-pagination", "tools/call:publish_result"]) {
      assert.equal(certificationFailed({ [operation]: { result: "fail" } }, client), true);
      assert.equal(certificationFailed({ [operation]: { result: "skip", reason: "observer unavailable" } }, client), true);
    }
    assert.equal(certificationFailed({ unknown: { result: "skip", reason: "observer unavailable" } }, client), true);
    assert.equal(certificationFailed({ initialize: { result: "pass" }, protocolVersion: "2025-11-25" }, client), false);
  }
});
