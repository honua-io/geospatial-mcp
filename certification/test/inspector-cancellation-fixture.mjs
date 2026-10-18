// Synthetic receipt metadata for pure controls only, never candidate evidence.
export function syntheticInspectorCancellationProof() {
  return { schema: "honua.inspector-browser-cancellation-proof/v1", performedBy: "MCP Inspector", inspectorVersion: "2.10.1",
    fixtureSourceSha: "a".repeat(40), seedSqlSha256: `sha256:${"d".repeat(64)}`, allocatedIdsSha256: `sha256:${"e".repeat(64)}`,
    sessionSha256: `sha256:${"f".repeat(64)}`, argumentsSha256: `sha256:${"1".repeat(64)}`,
    requestMethod: "tools/call", toolName: "honua_query_features", serviceName: "test_service", layerId: 0,
    notificationMethod: "notifications/cancelled", requestId: 7, notificationRequestId: 7, responseId: 7, responseCount: 1,
    protocolCode: -32800, code: "cancelled", hasResult: false, publicUiAction: "Execute Tool / Cancel",
    clientAbortUsed: true, genuineNotificationObserved: true, originalUpstreamKeptOpen: true, recoveryReadMatchesFixture: true,
    provider: { kind: "postgres-relation-lock", tableSchema: "honua", tableName: "features", blockerPid: 101, queryPid: 102,
      observedBlocked: true, ceasedBeforeBlockerRelease: true, relationLocksReleased: true,
      beforeRowsSha256: `sha256:${"2".repeat(64)}`, afterRowsSha256: `sha256:${"2".repeat(64)}` },
    cleanup: { blockerReleased: true, uiClosed: true, wireClosed: true } };
}
