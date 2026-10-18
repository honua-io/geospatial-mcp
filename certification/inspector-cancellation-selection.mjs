// Pure selection of the supported server-owned observation profile. Provider
// configuration validation remains in the authenticated owning harness.
export function inspectorCancellationRequested(environment) {
  return environment.HONUA_MCP_CANCELLATION_OBSERVER === "postgres-lock-v1";
}
