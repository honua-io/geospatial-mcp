import { CLIENTS } from "./requirements.mjs";
import { DEPLOYMENT_WORKSPACE_OPERATIONS, NO_TARGET_REASON, deploymentTargetConfigured } from "./deployment-workspace-target.mjs";

export const INSPECTOR_PING_SKIP_REASON = "Pinned Inspector one-shot CLI has no ping method; initialize is not ping proof";

export function certificationFailed(checks, { canonicalClient, targetId }) {
  return Object.entries(checks).some(([operation, check]) => {
    if (operation === "protocolVersion" || check?.result === "pass") return false;
    if (check?.result !== "skip") return true;
    if (canonicalClient === CLIENTS.inspector.canonicalClient && operation === "ping"
        && check.reason === INSPECTOR_PING_SKIP_REASON) return false;
    const knownClient = Object.values(CLIENTS).some(client => client.canonicalClient === canonicalClient);
    return !(knownClient && !deploymentTargetConfigured(targetId)
      && DEPLOYMENT_WORKSPACE_OPERATIONS.includes(operation) && check.reason === NO_TARGET_REASON);
  });
}
