// Pure receipt validation only. Runtime/UI/database observation belongs to the
// immutable server-owned harness, never an executable dependency here.
const digest = (value) => /^sha256:[0-9a-f]{64}$/.test(value ?? "");

export function verifyInspectorCancellationProof(proof, sourceSha, version) {
  const id = proof?.requestId;
  return proof?.schema === "honua.inspector-browser-cancellation-proof/v1" && proof.performedBy === "MCP Inspector"
    && proof.inspectorVersion === version && /^2\.\d+\.\d+$/.test(version ?? "")
    && proof.fixtureSourceSha === sourceSha && /^[0-9a-f]{40}$/.test(sourceSha ?? "")
    && digest(proof.seedSqlSha256) && digest(proof.allocatedIdsSha256)
    && digest(proof.sessionSha256) && digest(proof.argumentsSha256)
    && proof.requestMethod === "tools/call" && proof.toolName === "honua_query_features"
    && proof.serviceName === "test_service" && proof.layerId === 0
    && proof.notificationMethod === "notifications/cancelled" && Number.isSafeInteger(id) && id >= 0
    && proof.notificationRequestId === id && proof.responseId === id && proof.responseCount === 1
    && proof.protocolCode === -32800 && proof.code === "cancelled" && proof.hasResult === false
    && proof.publicUiAction === "Execute Tool / Cancel" && proof.clientAbortUsed === true
    && proof.genuineNotificationObserved === true && proof.originalUpstreamKeptOpen === true
    && proof.provider?.kind === "postgres-relation-lock" && ["public", "honua"].includes(proof.provider.tableSchema)
    && proof.provider.tableName === "features" && Number.isSafeInteger(proof.provider.blockerPid) && proof.provider.blockerPid > 0
    && Number.isSafeInteger(proof.provider.queryPid) && proof.provider.queryPid > 0 && proof.provider.queryPid !== proof.provider.blockerPid
    && proof.provider.observedBlocked === true && proof.provider.ceasedBeforeBlockerRelease === true
    && proof.provider.relationLocksReleased === true && digest(proof.provider.beforeRowsSha256)
    && proof.provider.beforeRowsSha256 === proof.provider.afterRowsSha256 && proof.recoveryReadMatchesFixture === true
    && proof.cleanup?.blockerReleased === true && proof.cleanup.uiClosed === true && proof.cleanup.wireClosed === true;
}
