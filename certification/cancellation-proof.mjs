const digest = (value) => /^sha256:[0-9a-f]{64}$/.test(value ?? "");

export function verifyCancellationProof(proof, sourceSha, performedBy) {
  const id = proof?.requestId;
  return proof?.schema === "honua.mcp-request-cancellation-proof/v1" && proof.performedBy === performedBy
    && proof.fixtureSourceSha === sourceSha && digest(proof.seedSqlSha256) && digest(proof.allocatedIdsSha256)
    && digest(proof.sessionSha256) && digest(proof.argumentsSha256)
    && proof.requestMethod === "tools/call" && proof.toolName === "honua_query_features"
    && proof.serviceName === "test_service" && proof.layerId === 0 && proof.notificationMethod === "notifications/cancelled"
    && Number.isSafeInteger(id) && id >= 0 && proof.notificationRequestId === id && proof.responseId === id
    && proof.responseCount === 1 && proof.protocolCode === -32800 && proof.code === "cancelled" && proof.hasResult === false
    && proof.clientAbortUsed === false && proof.originalRequestKeptOpen === true
    && proof.provider?.kind === "postgres-relation-lock" && ["public", "honua"].includes(proof.provider.tableSchema)
    && proof.provider.tableName === "features" && Number.isSafeInteger(proof.provider.blockerPid)
    && proof.provider.blockerPid > 0 && Number.isSafeInteger(proof.provider.queryPid) && proof.provider.queryPid > 0
    && proof.provider.queryPid !== proof.provider.blockerPid && proof.provider.observedBlocked === true
    && proof.provider.ceasedBeforeBlockerRelease === true
    && proof.provider.relationLocksReleased === true && digest(proof.provider.beforeRowsSha256)
    && proof.provider.beforeRowsSha256 === proof.provider.afterRowsSha256
    && Number.isFinite(proof.wrongSession?.observedAfterMs) && proof.wrongSession.observedAfterMs >= 600
    && Number.isSafeInteger(proof.wrongSession.samples) && proof.wrongSession.samples >= 2
    && Number.isFinite(proof.wrongIdType?.observedAfterMs) && proof.wrongIdType.observedAfterMs >= 600
    && Number.isSafeInteger(proof.wrongIdType.samples) && proof.wrongIdType.samples >= 2
    && proof.recoveryReadMatchesFixture === true && proof.cleanup?.blockerReleased === true
    && proof.cleanup.otherClientClosed === true && proof.cleanup.originalRequestDrained === true;
}

