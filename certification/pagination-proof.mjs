// Pure consumer; executable observation remains owned by the server repository.
export function verifyInspectorPaginationProof(value, sourceSha, version) {
  return value?.schema === "honua.inspector-pagination-observer/v1"
    && value.canonicalClient === "MCP Inspector" && value.inspectorVersion === version
    && /^[a-f0-9]{40}$/.test(sourceSha ?? "") && value.sourceSha === sourceSha
    && Number.isSafeInteger(value.pageCount) && value.pageCount >= 2 && value.pageCount <= 100
    && Number.isSafeInteger(value.cursorHandoffCount) && value.cursorHandoffCount === value.pageCount - 1
    && Number.isSafeInteger(value.resourceCount) && value.resourceCount >= value.pageCount
    && /^sha256:[a-f0-9]{64}$/.test(value.resourceUrisSha256 ?? "")
    && /^sha256:[a-f0-9]{64}$/.test(value.sessionSha256 ?? "")
    && value.complete === true && value.clientResultMatchesWire === true;
}

export function requireSuccessfulInspectorPaginationResult(output, execution) {
  if (execution?.result !== "pass" || execution.inspectorExitCode !== 0
    || execution.inspectorExitSignal !== null || execution.inspectorTimedOut !== false) {
    throw new Error("Inspector pagination command did not complete successfully");
  }
  return output;
}
