// The owned deployment target is an optional dispatch input (README: a missing target
// remains NONPASS). Without one, every cohort operation is recorded as an explicit skip so
// the fragment emits NONPASS rows rather than the certify step failing.
export const DEPLOYMENT_WORKSPACE_OPERATIONS = Object.freeze(["tools/call:deploy_operations",
  "tools/call:propose_rollback", "resources/read:Deployment", "resources/read:Workspace"]);
export const NO_TARGET_REASON = "no owned deployment target configured (deployment_target_id)";

export function deploymentTargetConfigured(targetId) {
  return typeof targetId === "string" && targetId !== "";
}

export function recordUntargetedDeploymentWorkspace(lane) {
  if (!lane?.checks || typeof lane.checks !== "object" || Array.isArray(lane.checks))
    throw new Error("canonical baseline lane identity is missing");
  for (const operation of DEPLOYMENT_WORKSPACE_OPERATIONS)
    lane.checks[operation] = { result: "skip", reason: NO_TARGET_REASON };
  return lane;
}
