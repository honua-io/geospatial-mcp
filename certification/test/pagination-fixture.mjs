// Synthetic pure-consumer fixture, never candidate proof.
export function syntheticInspectorPaginationProof() {
  return { schema: "honua.inspector-pagination-observer/v2", canonicalClient: "MCP Inspector",
    inspectorVersion: "2.10.1", sourceSha: "a".repeat(40), method: "tools/list", workflowView: "full",
    authenticated: true, pageCount: 3, cursorHandoffCount: 2, toolCount: 3,
    toolNamesSha256: "sha256:" + "d".repeat(64), sessionSha256: "sha256:" + "e".repeat(64),
    complete: true, clientResultMatchesWire: true };
}
