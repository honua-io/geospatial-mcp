import assert from "node:assert/strict";
import test from "node:test";
import { DEPLOYMENT_WORKSPACE_OPERATIONS, NO_TARGET_REASON, deploymentTargetConfigured,
  recordUntargetedDeploymentWorkspace } from "../deployment-workspace-target.mjs";

test("an absent or empty target is untargeted; any configured value is passed on for validation", () => {
  for (const value of [undefined, ""]) assert.equal(deploymentTargetConfigured(value), false);
  for (const value of ["owned-target", " ", "bad target!"]) assert.equal(deploymentTargetConfigured(value), true);
});

test("an untargeted cohort records every operation as an explicit skip, never pass or fail", () => {
  const lane = recordUntargetedDeploymentWorkspace({ performedBy: "MCP Inspector", checks: { initialize: { result: "pass" } } });
  assert.deepEqual(Object.keys(lane.checks).toSorted(), ["initialize", ...DEPLOYMENT_WORKSPACE_OPERATIONS].toSorted());
  for (const operation of DEPLOYMENT_WORKSPACE_OPERATIONS)
    assert.deepEqual(lane.checks[operation], { result: "skip", reason: NO_TARGET_REASON });
  assert.throws(() => recordUntargetedDeploymentWorkspace({ checks: [] }), /lane identity/);
});
