import assert from "node:assert/strict";
import test from "node:test";
import { observerConfiguration } from "../postgres-cancellation-observer.mjs";
import { verifyCancellationProof } from "../request-cancellation.mjs";
import { syntheticCancellationProof } from "./cancellation-fixture.mjs";

test("synthetic cancellation proof controls require every cessation and authority obligation", () => {
  const valid = syntheticCancellationProof();
  const verify = (proof) => verifyCancellationProof(proof, "a".repeat(40), "Official MCP TypeScript SDK");
  assert.equal(verify(valid), true);
  for (const path of ["schema", "performedBy", "fixtureSourceSha", "seedSqlSha256", "allocatedIdsSha256",
    "sessionSha256", "argumentsSha256", "requestMethod", "toolName", "serviceName", "layerId", "notificationMethod",
    "requestId", "notificationRequestId", "responseId", "responseCount", "protocolCode", "code", "hasResult",
    "clientAbortUsed", "originalRequestKeptOpen", "provider.kind", "provider.blockerPid", "provider.queryPid",
    "provider.observedBlocked", "provider.ceasedBeforeBlockerRelease", "provider.relationLocksReleased",
    "provider.beforeRowsSha256", "provider.afterRowsSha256", "wrongSession.observedAfterMs", "wrongSession.samples",
    "wrongIdType.observedAfterMs", "wrongIdType.samples", "recoveryReadMatchesFixture", "cleanup.blockerReleased",
    "cleanup.otherClientClosed", "cleanup.originalRequestDrained"]) {
    const proof = structuredClone(valid);
    const parts = path.split(".");
    const key = parts.pop();
    const parent = parts.reduce((value, part) => value[part], proof);
    delete parent[key];
    assert.equal(verify(proof), false, path);
  }
  for (const update of [
    (p) => { p.requestId = "7"; }, (p) => { p.responseCount = 2; },
    (p) => { p.provider.queryPid = p.provider.blockerPid; },
    (p) => { p.provider.afterRowsSha256 = `sha256:${"3".repeat(64)}`; },
    (p) => { p.wrongSession.observedAfterMs = 599; }, (p) => { p.wrongIdType.samples = 1; },
    (p) => { p.clientAbortUsed = true; }, (p) => { p.provider.ceasedBeforeBlockerRelease = false; },
    (p) => { p.hasResult = true; }, (p) => { p.cleanup.blockerReleased = false; },
  ]) {
    const proof = structuredClone(valid); update(proof); assert.equal(verify(proof), false);
  }
});

test("observer is restricted to an explicit owned loopback database and a safe application binding", () => {
  const environment = Object.fromEntries(Object.entries({ HOST: "127.0.0.1", PORT: "5432", DATABASE: "control",
    USER: "control", PASSWORD: "synthetic-secret", SERVER_APP_NAME: "honua-cert-control" })
    .map(([key, value]) => [`HONUA_MCP_OBSERVER_PG${key}`, value]));
  assert.equal(observerConfiguration(environment).HOST, "127.0.0.1");
  for (const [name, value] of [["HOST", "production.example.com"], ["PORT", "0"], ["PORT", "65536"],
    ["PORT", "5432;select"], ["SERVER_APP_NAME", "x' OR true--"], ["PASSWORD", ""]]) {
    assert.throws(() => observerConfiguration({ ...environment, [`HONUA_MCP_OBSERVER_PG${name}`]: value }));
  }
});
