import { CLIENTS } from "./requirements.mjs";

export const INSPECTOR_PING_SKIP_REASON = "Pinned Inspector one-shot CLI has no ping method; initialize is not ping proof";

export function certificationFailed(checks, { canonicalClient }) {
  return Object.entries(checks).some(([operation, check]) => {
    if (operation === "protocolVersion" || check?.result === "pass") return false;
    if (check?.result !== "skip") return true;
    if (canonicalClient === CLIENTS.inspector.canonicalClient && operation === "ping"
        && check.reason === INSPECTOR_PING_SKIP_REASON) return false;
    return true;
  });
}
