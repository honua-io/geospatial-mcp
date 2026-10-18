import { createHash } from "node:crypto";
import { verifyQuery } from "./semantic-reads.mjs";
import { toolOutput } from "./probes.mjs";
import { PostgresObservationError, until } from "./postgres-cancellation-observer.mjs";

const require = (condition, message) => { if (!condition) throw new Error(message); };
const hash = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const digest = (value) => /^sha256:[0-9a-f]{64}$/.test(value ?? "");
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
async function within(promise, milliseconds) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("SDK cancellation response exceeded its bounded budget")), milliseconds);
  })]); } finally { clearTimeout(timer); }
}

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

// This uses public installed-SDK methods. Aborting the SDK promise removes its
// response handler and rejects locally, so no AbortSignal is used as evidence.
export async function requestCancellation({ client, transport, otherClient, otherTransport, observer, fixture,
  performedBy = "Official MCP TypeScript SDK" }) {
  const send = transport.send;
  const onmessage = transport.onmessage;
  const responses = [];
  const notifications = [];
  let capture = null;
  let armed = false;
  let outcome;
  let settled = false;
  let stage = "fixture";
  let failure;
  let proof;
  let otherClosed = false;
  const arguments_ = { serviceId: fixture.serviceName, layerId: fixture.layerId,
    where: "name IN ('alpha','beta') AND count >= 1", outFields: ["name", "count"], outSrid: 4326,
    returnGeometry: true, limit: 3 };
  transport.send = function (message, options) {
    if (armed && message.method === "tools/call") {
      require(capture === null && message.params?.name === "honua_query_features", "unexpected concurrent SDK request");
      capture = { id: message.id, startedAt: new Date().toISOString(), arguments: message.params.arguments };
      armed = false;
    }
    if (message.method === "notifications/cancelled") notifications.push(message.params?.requestId);
    return send.call(this, message, options);
  };
  transport.onmessage = (message, extra) => {
    if (capture && message.id === capture.id) responses.push(message);
    onmessage?.call(transport, message, extra);
  };
  const observeNoninterference = async (pid) => {
    const started = performance.now();
    let samples = 0;
    const check = async () => {
      require(!settled, "original SDK request ended during an unauthorized cancellation");
      const state = await observer.state(pid);
      require(state.waiting === true && state.blockerHeld === true && !settled,
        "unauthorized cancellation changed blocked provider work");
      samples++;
    };
    do { await delay(50); await check(); } while (performance.now() - started < 600);
    // Start a NEW database observation after the complete monitor interval;
    // delayed delivery of an earlier snapshot cannot satisfy this negative.
    const observedAfterMs = performance.now() - started;
    await check();
    return { observedAfterMs, samples };
  };
  try {
    stage = "session-authority";
    require(typeof transport.sessionId === "string" && transport.sessionId.length > 0
      && typeof otherTransport.sessionId === "string" && otherTransport.sessionId !== transport.sessionId,
    "independent authenticated stateful SDK sessions are required");
    stage = "fixture-snapshot";
    const before = await observer.snapshot(fixture);
    stage = "blocker";
    const blockerPid = await observer.hold();
    stage = "blocked-request";
    armed = true;
    outcome = Promise.resolve(client.callTool({ name: "honua_query_features", arguments: arguments_ }, undefined, { timeout: 20_000 }))
      .then((value) => { settled = true; return { value }; }, (error) => { settled = true; return { error }; });
    await until(() => { require(!settled, "SDK request ended before reaching the provider"); return capture; }, 2_000);
    require(capture && Number.isSafeInteger(capture.id) && capture.id >= 0, "installed SDK did not send an integer wire request ID");
    const pid = await observer.blocked(capture.startedAt);
    require(!settled && JSON.stringify(capture.arguments) === JSON.stringify(arguments_), "original SDK request was not kept open");
    stage = "wrong-session";
    await otherClient.notification({ method: "notifications/cancelled", params: { requestId: capture.id, reason: "certification wrong-session control" } });
    const wrongSession = await observeNoninterference(pid);
    stage = "wrong-id-type";
    await client.notification({ method: "notifications/cancelled", params: { requestId: String(capture.id), reason: "certification wrong-id-type control" } });
    const wrongIdType = await observeNoninterference(pid);
    stage = "rightful-cancellation";
    await client.notification({ method: "notifications/cancelled", params: { requestId: capture.id, reason: "certification server cessation" } });
    const result = await within(outcome, 5_000);
    require(result.error?.code === -32800 && result.error.data?.code === "cancelled", "SDK did not receive the typed server cancellation");
    require(responses.length === 1 && responses[0].error?.code === -32800 && responses[0].error?.data?.code === "cancelled"
      && !Object.hasOwn(responses[0], "result") && notifications.includes(capture.id), "missing or contradictory correlated cancellation wire response");
    stage = "provider-cessation";
    await until(async () => {
      const state = await observer.state(pid);
      require(state.blockerHeld === true, "blocker was released before provider cessation proof");
      return state.waiting === false && state.relationLocks === 0;
    }, 5_000);
    stage = "recovery";
    await observer.release();
    const after = await observer.snapshot(fixture);
    require(before === after, "cancellation changed the fixture rows");
    await client.notification({ method: "notifications/cancelled", params: { requestId: capture.id, reason: "certification completed-ID control" } });
    const recovery = await client.callTool({ name: "honua_query_features", arguments: arguments_ });
    require(recovery.isError === undefined || recovery.isError === false, "recovery query returned an MCP error envelope");
    verifyQuery(toolOutput(recovery), fixture);
    require(responses.length === 1, "original SDK request received duplicate terminal responses");
    proof = { schema: "honua.mcp-request-cancellation-proof/v1", performedBy,
      fixtureSourceSha: fixture.sourceSha, seedSqlSha256: fixture.seedSqlSha256, allocatedIdsSha256: fixture.allocatedIdsSha256,
      requestMethod: "tools/call", toolName: "honua_query_features", serviceName: fixture.serviceName,
      layerId: fixture.layerId, notificationMethod: "notifications/cancelled",
      sessionSha256: hash(transport.sessionId), argumentsSha256: hash(JSON.stringify(arguments_)), requestId: capture.id,
      notificationRequestId: capture.id, responseId: responses[0].id, responseCount: responses.length,
      protocolCode: result.error.code, code: result.error.data.code, hasResult: false, clientAbortUsed: false,
      originalRequestKeptOpen: true, wrongSession, wrongIdType, recoveryReadMatchesFixture: true,
      provider: { kind: "postgres-relation-lock", tableSchema: observer.tableSchema, tableName: "features",
        blockerPid, queryPid: pid, observedBlocked: true, ceasedBeforeBlockerRelease: true,
        relationLocksReleased: true, beforeRowsSha256: before, afterRowsSha256: after } };
  } catch (error) {
    const diagnostic = error instanceof PostgresObservationError ? ` (${error.observationCode})` : "";
    failure = new Error(`SDK request-cancellation proof failed at ${stage}${diagnostic}`);
  } finally {
    // Independent owned cleanup continues after a failed adapter/assertion.
    try { await observer.release(); } catch { failure ??= new Error("cancellation blocker cleanup failed"); }
    try { if (outcome) await within(outcome, 5_000); }
    catch { failure ??= new Error("original SDK request could not be drained"); await client.close().catch(() => {}); }
    try { await otherClient.close(); otherClosed = true; } catch { failure ??= new Error("secondary SDK session cleanup failed"); }
    transport.send = send;
    transport.onmessage = onmessage;
  }
  if (failure) throw failure;
  proof.cleanup = { blockerReleased: observer.released === true, otherClientClosed: otherClosed, originalRequestDrained: settled };
  require(verifyCancellationProof(proof, fixture.sourceSha, performedBy), "cancellation proof is incomplete");
  return proof;
}
