import { verifyEntityResolution } from "../entity-resolution.mjs";
import { verifyCancellationProof } from "../cancellation-proof.mjs";
import { verifyInspectorPaginationProof } from "../pagination-proof.mjs";
import { verifyInspectorCancellationProof } from "../inspector-cancellation-proof.mjs";
import { planScenarios, verifyPlanProof } from "../plan-validation.mjs";
import { renderScenarios, verifyRenderProof } from "../render-validation.mjs";
import { controlledRenderBootstrap, controlledRenderResponse, controlledDockerProgram } from "./render-fixture.mjs";
import { entityObservations } from "./entity-fixture.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { buildFragment as build } from "../build-fragment.mjs";
import { CLIENTS, CONTRACT_REVISION, FIXTURE_REVISION, OPERATIONS } from "../requirements.mjs";
import { syntheticCancellationProof } from "./cancellation-fixture.mjs";
import { syntheticInspectorPaginationProof } from "./pagination-fixture.mjs";
import { syntheticInspectorCancellationProof } from "./inspector-cancellation-fixture.mjs";
// Build the expected catalog from published vocabulary, independently of the
// producer's OPERATIONS. Deriving both from OPERATIONS hid the retired tool.
const publishedIndex = JSON.parse(readFileSync(new URL("../../spec/schemas/index.json", import.meta.url), "utf8"));
const publishedManifest = JSON.parse(readFileSync(new URL("../../conformance/manifests/honua.manifest.json", import.meta.url), "utf8"));
const expectedOperations = [
  ...["initialize", "ping", "tools/list", "resources/templates/list"].map((operation) => ["mcp.transport", operation]),
  ...publishedManifest.resources.map(({ family }) => ["mcp.resource", `resources/read:${family}`]),
  ...publishedIndex.tools.filter(({ implementationStatus }) => implementationStatus === "implemented")
    .map(({ standardName }) => ["mcp.tool", `tools/call:${standardName}`]),
];
const requirements = { schema: "honua.protocol-certification-requirements/v1", receipt_schema_min: "v2", complete: true,
  revision: "test-owned-catalog/v1", requirements: expectedOperations.flatMap(([capability_key, operation]) => Object.values(CLIENTS).map((client) => ({
    capability_key, surface: "mcp", operation, canonical_client: client.canonicalClient, client_version: client.version,
    deployment_target: "local-docker", maturity: "supported", required_tier: "nightly",
    scenario_facets: ["positive", "negative", "media-schema", "auth"], fixture_revision: FIXTURE_REVISION,
    contract_revision: CONTRACT_REVISION, auth_policy_revision: operation.startsWith("tools/call:") || operation.startsWith("resources/read:") ? "mcp-protected-operation-v1" : "anonymous-public-v1",
  }))) };
const authPolicy = {
  schema: "honua.mcp-operation-auth-policy/v1", revision: "mcp-operation-auth-v1",
  owner_issue: "https://github.com/honua-io/honua-release/issues/695",
  required_observations: {
    "anonymous-public-v1": ["anonymous-success", "fresh-anonymous-session", "no-credentials"],
    "mcp-protected-operation-v1": ["authenticated-success", "fresh-anonymous-refusal", "no-credential-forwarding", "no-authenticated-session-reuse", "caller-session-binding"],
  },
  operations: expectedOperations.map(([, operation]) => ({operation, auth_policy_revision:
    operation.startsWith("tools/call:") || operation.startsWith("resources/read:") ? "mcp-protected-operation-v1" : "anonymous-public-v1"})),
};
const buildFragment = (input) => build({ requirements, authPolicy, executedTier: "nightly", ...input });

const identity = {
  sourceSha: "a".repeat(40), producerSourceSha: "c".repeat(40),
  imageDigest: `sha256:${"b".repeat(64)}`, cutAt: "2026-08-26T20:00:00Z",
  startedAt: "2026-08-26T21:00:00Z", runtimeEnvironment: "Production",
  requestUrl: "http://localhost:8080/mcp",
};
const passingBase = Object.fromEntries(["initialize", "ping", "tools/list", "resources/templates/list"].map((operation) =>
  [operation, { result: "pass", startedAt: identity.startedAt, completedAt: "2026-08-26T21:01:00Z" }]));
for (const operation of ["behavior/auth", "behavior/error", "behavior/cancellation", "behavior/resources-pagination"]) {
  passingBase[operation] = { result: "pass", startedAt: identity.startedAt, completedAt: "2026-08-26T21:01:00Z" };
}
const passing = (key) => ({ ...passingBase, "behavior/cancellation": { ...passingBase["behavior/cancellation"],
  value: key === "inspector" ? syntheticInspectorCancellationProof() : syntheticCancellationProof(CLIENTS[key].canonicalClient) },
  ...(key === "inspector" ? { "behavior/resources-pagination": { ...passingBase["behavior/resources-pagination"],
    value: syntheticInspectorPaginationProof() } } : {}) });

test("offline findings and event reads join all eight original rows through protected semantics and authority", () => {
  const vector = JSON.parse(readFileSync(new URL("./fixtures/offline-ops-events-oracle-vector.json", import.meta.url)));
  assert.match(vector.meaning, /offline.*no.*candidate/i);
  const operations = ["tools/call:ops_findings", "tools/call:alert_events", "tools/call:operate_events", "resources/read:Ops findings"];
  const selectedIdentity = { ...identity, sourceSha: vector.proof.candidateSourceSha,
    imageDigest: vector.proof.candidateImage.split("@").at(-1) };
  const checks = {};
  for (const key of ["sdk", "inspector"]) {
    const proof = key === "sdk" ? vector.proof : vector.inspectorProof;
    checks[key] = { ...passing(key), ...Object.fromEntries(operations.map(operation =>
      [operation, { result: "pass", value: structuredClone(proof) }])) };
    checks[key]["behavior/cancellation"].value.fixtureSourceSha = selectedIdentity.sourceSha;
    if (key === "inspector") checks[key]["behavior/resources-pagination"].value.sourceSha = selectedIdentity.sourceSha;
  }
  const joined = (selectedChecks, executedTier = "release") => buildFragment({ identity: selectedIdentity, executedTier,
    results: Object.fromEntries(["sdk", "inspector"].map(key => [key, { protocolVersion: "2025-06-18", checks: selectedChecks[key] }])) });
  const selected = fragment => fragment.observations.filter(row => operations.includes(row.operation));
  const directory = mkdtempSync(join(tmpdir(), "offline-ops-events-join-"));
  const inputs = {
    HONUA_MCP_RENDER_BOOTSTRAP: ["original-bootstrap.json", Buffer.from(vector.bootstrapBase64, "base64")],
    HONUA_MCP_OPS_SETUP: ["original-setup.json", Buffer.from(vector.setupBase64, "base64")],
    HONUA_MCP_OPS_MANIFEST: ["original-manifest.yaml", Buffer.from(vector.manifestBase64, "base64")],
    HONUA_MCP_OPS_MANIFEST_BINDING: ["original-manifest-binding.json", JSON.stringify(vector.manifestBinding)],
    HONUA_MCP_OPS_GOVERNANCE_BINDING: ["original-governance-binding.json", JSON.stringify({ repository: vector.manifestBinding.repository, sourceSha: vector.manifestBinding.sourceSha })],
  };
  assert.equal(createHash("sha256").update(inputs.HONUA_MCP_RENDER_BOOTSTRAP[1]).digest("hex"), vector.bootstrapBytesSha256);
  assert.equal(createHash("sha256").update(inputs.HONUA_MCP_OPS_SETUP[1]).digest("hex"), vector.setupBytesSha256);
  const before = Object.fromEntries(Object.keys(inputs).map(name => [name, process.env[name]]));
  for (const [name, [file, bytes]] of Object.entries(inputs)) {
    process.env[name] = join(directory, file); writeFileSync(process.env[name], bytes);
  }
  try {
    const fragment = joined(checks), rows = selected(fragment);
    assert.equal(fragment.observations.length, 82);
    assert.equal(rows.length, 8);
    for (const row of rows) {
      assert.equal(row.result, "pass", row.operation + row.canonical_client);
      assert.deepEqual(row.scenario_facets, ["positive", "negative", "media-schema", "auth"]);
      assert.equal(row.evidence_receipt.facets.auth, "pass");
    }
    for (const key of ["sdk", "inspector"]) for (const operation of operations) {
      for (const mutation of ["no-raw", "helper", "image", "flag", "session", "anonymous-credentials", "store", "filter", "paging", "source-error", "preflight-caller", "limited-read", "key-cleanup", "time", "restart"]) {
        const broken = structuredClone(checks), proof = broken[key][operation].value;
        if (mutation === "no-raw") delete proof.observations;
        else if (mutation === "helper") proof.helperSourceSha = "f".repeat(40);
        else if (mutation === "image") proof.candidateImage += "-other";
        else if (mutation === "flag") proof.independentStores = false;
        else if (mutation === "session") proof.observations.calls[1].wire.initialize.response.sessionSha256 = proof.observations.calls[0].wire.initialize.response.sessionSha256;
        else if (mutation === "anonymous-credentials") proof.observations.calls.find(call => call.authenticated === false).wire.invocation.request.credentialPresent = true;
        else if (mutation === "store") proof.observations.calls[0].before.storeObservation.store.alerts = [];
        else if (mutation === "filter") proof.observations.calls.find(call => call.id === "alerts-resolved").params.arguments.severity = "warning";
        else if (mutation === "paging") delete proof.observations.calls.find(call => call.id === "alerts-second").params.arguments.cursor;
        else if (mutation === "source-error") proof.observations.calls.find(call => call.id === "alerts").result.structuredContent.evidencePosture.status = "complete";
        else if (mutation === "preflight-caller") proof.observations.calls[0].before.preflight.credentialFingerprint = proof.observations.identityFixtures.limited.identity.credentialFingerprint;
        else if (mutation === "limited-read") delete proof.observations.limitedRead;
        else if (mutation === "key-cleanup") proof.observations.identityFixtures.limited.cleanupComplete = false;
        else if (mutation === "time") proof.observations.calls[0].before.completedAt = "2100-01-01T00:00:00Z";
        else proof.observations.runtimeRestarted.startedAt = proof.observations.runtimeBefore.startedAt;
        const row = selected(joined(broken)).find(item => item.operation === operation && item.canonical_client === CLIENTS[key].canonicalClient);
        assert.notEqual(row.result, "pass", `${key} ${operation} ${mutation}`);
        assert.equal(row.evidence_receipt, null);
      }
    }
    for (const mutation of ["missing-auth", "missing-cancellation", "failed-cancellation", "under-tier"]) {
      const broken = structuredClone(checks);
      for (const key of ["sdk", "inspector"]) {
        if (mutation === "missing-auth") delete broken[key]["behavior/auth"];
        else if (mutation === "missing-cancellation") delete broken[key]["behavior/cancellation"];
        else if (mutation === "failed-cancellation") broken[key]["behavior/cancellation"].result = "fail";
      }
      for (const row of selected(joined(broken, mutation === "under-tier" ? "pr" : "release"))) {
        assert.notEqual(row.result, "pass", mutation);
        assert.equal(row.evidence_receipt, null);
      }
    }
  } finally {
    for (const [name, value] of Object.entries(before)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    rmSync(directory, { recursive: true, force: true });
  }
});


test("offline Ops health joins all four original rows through protected semantics and authority", () => {
  const vector = JSON.parse(readFileSync(new URL("./fixtures/offline-ops-health-oracle-vector.json", import.meta.url)));
  assert.match(vector.meaning, /offline.*no.*candidate/i);
  const operations = ["tools/call:ops_health", "resources/read:Ops health"];
  const selectedIdentity = { ...identity, sourceSha: vector.proof.candidateSourceSha,
    imageDigest: vector.proof.candidateImage.split("@").at(-1) };
  const checks = {};
  for (const key of ["sdk", "inspector"]) {
    const proof = key === "sdk" ? vector.proof : vector.inspectorProof;
    checks[key] = { ...passing(key), ...Object.fromEntries(operations.map(operation =>
      [operation, { result: "pass", value: structuredClone(proof) }])) };
    checks[key]["behavior/cancellation"].value.fixtureSourceSha = selectedIdentity.sourceSha;
    if (key === "inspector") checks[key]["behavior/resources-pagination"].value.sourceSha = selectedIdentity.sourceSha;
  }
  const joined = (selectedChecks, executedTier = "release") => buildFragment({ identity: selectedIdentity, executedTier,
    results: Object.fromEntries(["sdk", "inspector"].map(key => [key, { protocolVersion: "2025-06-18", checks: selectedChecks[key] }])) });
  const selected = fragment => fragment.observations.filter(row => operations.includes(row.operation));
  const before = process.env.HONUA_MCP_RENDER_BOOTSTRAP;
  const directory = mkdtempSync(join(tmpdir(), "offline-ops-health-join-"));
  const bytes = Buffer.from(vector.bootstrapBase64, "base64");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), vector.bootstrapBytesSha256);
  process.env.HONUA_MCP_RENDER_BOOTSTRAP = join(directory, "original-bootstrap.json");
  writeFileSync(process.env.HONUA_MCP_RENDER_BOOTSTRAP, bytes);
  try {
    const fragment = joined(checks), rows = selected(fragment);
    assert.equal(fragment.observations.length, 82);
    assert.equal(rows.length, 4);
    for (const row of rows) {
      assert.equal(row.result, "pass", row.operation + row.canonical_client);
      assert.deepEqual(row.scenario_facets, ["positive", "negative", "media-schema", "auth"]);
      assert.equal(row.evidence_receipt.facets.auth, "pass");
    }
    for (const key of ["sdk", "inspector"]) for (const operation of operations) {
      for (const mutation of ["no-raw", "helper", "image", "flag", "session", "anonymous-credentials", "queue", "restart"]) {
        const broken = structuredClone(checks), proof = broken[key][operation].value;
        if (mutation === "no-raw") delete proof.observations;
        else if (mutation === "helper") proof.helperSourceSha = "f".repeat(40);
        else if (mutation === "image") proof.candidateImage += "-other";
        else if (mutation === "flag") proof.independentStores = false;
        else if (mutation === "session") proof.observations.calls[1].wire.initialize.response.sessionSha256 = proof.observations.calls[0].wire.initialize.response.sessionSha256;
        else if (mutation === "anonymous-credentials") proof.observations.calls.find(call => call.authenticated === false).wire.invocation.request.credentialPresent = true;
        else if (mutation === "queue") proof.observations.calls[0].before.redis.jobs = [];
        else proof.observations.runtimeRestarted.startedAt = proof.observations.runtimeBefore.startedAt;
        const row = selected(joined(broken)).find(item => item.operation === operation && item.canonical_client === CLIENTS[key].canonicalClient);
        assert.notEqual(row.result, "pass", `${key} ${operation} ${mutation}`);
        assert.equal(row.evidence_receipt, null);
      }
    }
    for (const mutation of ["missing-auth", "missing-cancellation", "failed-cancellation", "under-tier"]) {
      const broken = structuredClone(checks);
      for (const key of ["sdk", "inspector"]) {
        if (mutation === "missing-auth") delete broken[key]["behavior/auth"];
        else if (mutation === "missing-cancellation") delete broken[key]["behavior/cancellation"];
        else if (mutation === "failed-cancellation") broken[key]["behavior/cancellation"].result = "fail";
      }
      for (const row of selected(joined(broken, mutation === "under-tier" ? "pr" : "release"))) {
        assert.notEqual(row.result, "pass", mutation);
        assert.equal(row.evidence_receipt, null);
      }
    }
  } finally {
    if (before === undefined) delete process.env.HONUA_MCP_RENDER_BOOTSTRAP; else process.env.HONUA_MCP_RENDER_BOOTSTRAP = before;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("offline location proofs join all three primary paths with authority and global gates intact", () => {
  const vector = JSON.parse(readFileSync(new URL("./fixtures/offline-location-oracle-vector.json", import.meta.url)));
  assert.match(vector.meaning, /offline.*no.*candidate/i);
  const operations = ["tools/call:geocode_address", "tools/call:geocode_addresses", "tools/call:solve_route"];
  const first = vector.proofs[operations[0]];
  const selectedIdentity = { ...identity, sourceSha: first.candidateSourceSha, imageDigest: first.candidateImage.split("@").at(-1) };
  const checks = { ...passing("sdk"), "behavior/cancellation": { result: "pass", value: {
    ...syntheticCancellationProof(), fixtureSourceSha: selectedIdentity.sourceSha } },
  ...Object.fromEntries(operations.map(operation => [operation, { result: "pass", value: vector.proofs[operation] }])) };
  const joined = (sdkChecks, executedTier = "release") => buildFragment({ identity: selectedIdentity, executedTier,
    results: { sdk: { protocolVersion: "2025-06-18", checks: sdkChecks },
      inspector: { protocolVersion: "2025-06-18", checks: passing("inspector") } } });
  const selected = fragment => fragment.observations.filter(row => operations.includes(row.operation)
    && row.canonical_client === CLIENTS.sdk.canonicalClient);
  const before = process.env.HONUA_MCP_RENDER_BOOTSTRAP;
  const directory = mkdtempSync(join(tmpdir(), "offline-location-join-"));
  const bytes = Buffer.from(vector.bootstrapBase64, "base64");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), vector.bootstrapBytesSha256);
  process.env.HONUA_MCP_RENDER_BOOTSTRAP = join(directory, "original-bootstrap.json");
  writeFileSync(process.env.HONUA_MCP_RENDER_BOOTSTRAP, bytes);
  try {
    const fragment = joined(checks), positive = selected(fragment);
    assert.equal(fragment.observations.length, 82);
    assert.equal(positive.length, 3);
    for (const row of positive) {
      assert.equal(row.result, "pass", row.operation);
      assert.deepEqual(row.scenario_facets, ["positive", "negative", "media-schema", "auth"]);
      assert.equal(row.evidence_receipt.facets.auth, "pass");
    }
    for (const operation of operations) {
      for (const mutation of ["no-raw", "helper", "operation", "image", "client", "anonymous-credentials", "tool", "flag"]) {
        const broken = structuredClone(checks), proof = broken[operation].value;
        if (mutation === "no-raw") delete proof.observations;
        else if (mutation === "helper") proof.helperSourceSha = "f".repeat(40);
        else if (mutation === "operation") proof.operation = "tools/call:publish_result";
        else if (mutation === "image") proof.candidateImage += "-other";
        else if (mutation === "client") proof.canonicalClient = "MCP Inspector";
        else if (mutation === "anonymous-credentials") proof.observations.cases.at(-1).wire.invocation.request.credentialPresent = true;
        else if (mutation === "tool") proof.observations.cases[0].wire.expectedParams.name = "honua_publish_result";
        else proof.coordinateSemantics = false;
        const row = selected(joined(broken)).find(item => item.operation === operation);
        assert.notEqual(row.result, "pass", `${operation}: ${mutation}`);
        assert.equal(row.evidence_receipt, null);
      }
    }
    for (const mutation of ["missing-auth", "missing-cancellation", "failed-cancellation", "under-tier"]) {
      const broken = structuredClone(checks);
      if (mutation === "missing-auth") delete broken["behavior/auth"];
      else if (mutation === "missing-cancellation") delete broken["behavior/cancellation"];
      else if (mutation === "failed-cancellation") broken["behavior/cancellation"].result = "fail";
      for (const row of selected(joined(broken, mutation === "under-tier" ? "pr" : "release"))) {
        assert.notEqual(row.result, "pass", mutation);
        assert.equal(row.evidence_receipt, null);
      }
    }
    const failed = structuredClone(checks);
    failed[operations[1]] = { result: "fail", error: "Actual provider setup absent" };
    assert.equal(selected(joined(failed)).find(row => row.operation === operations[1]).result, "fail");
  } finally {
    if (before === undefined) delete process.env.HONUA_MCP_RENDER_BOOTSTRAP; else process.env.HONUA_MCP_RENDER_BOOTSTRAP = before;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("producer operations match the independent published vocabulary without retired or missing tools", () => {
  const keys = (operations) => operations.map(([capability, operation]) => `${capability}:${operation}`).sort();
  assert.deepEqual(keys(OPERATIONS), keys(expectedOperations));
  assert.equal(new Set(keys(OPERATIONS)).size, OPERATIONS.length);
  assert.equal(OPERATIONS.some(([, operation]) => operation === "tools/call:propose_operation"), false);
});

test("emits the complete governed denominator and truthful execution identity", () => {
  const fragment = buildFragment({ identity, results: {
    sdk: { performedBy: "Official MCP TypeScript SDK", requestUrl: identity.requestUrl, protocolVersion: "2025-06-18", checks: passing("sdk") },
    inspector: { performedBy: "MCP Inspector", requestUrl: identity.requestUrl, protocolVersion: "2025-06-18", checks: passing("inspector") },
  }, now: "2026-08-26T21:02:00Z" });
  assert.equal(fragment.observations.length, 82);
  assert.deepEqual(Object.fromEntries(["Official MCP TypeScript SDK", "MCP Inspector"].map((client) =>
    [client, fragment.observations.filter((row) => row.canonical_client === client).length])), {
    "Official MCP TypeScript SDK": 41, "MCP Inspector": 41,
  });
  for (const row of fragment.observations) {
    assert.equal(row.surface, "mcp");
    assert.equal(row.protocol_version, "2025-06-18");
    assert.equal(row.runtime_environment, "Production");
    assert.equal(row.client_id, row.canonical_client);
    assert.equal(row.performed_by, row.canonical_client);
    assert.match(row.request_url, /^https?:\/\//);
    assert.ok(["mcp-typescript-sdk", "mcp-inspector"].includes(row.runner_lane));
    if (row.result === "skip") {
      assert.match(row.skip_reason, /release\/issues\/123/);
      assert.equal(row.evidence_receipt, null);
    } else {
      const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
        : value && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
          : JSON.stringify(value);
      const digest = `sha256:${createHash("sha256").update(canonical(row.evidence_receipt)).digest("hex")}`;
      assert.equal(row.evidence_digest, digest);
      assert.equal(row.evidence_uri, `https://evidence.honua.io/data/sha256/${digest.slice(7)}`);
    }
  }
});

test("fails closed on ambiguous candidate identity", () => {
  assert.throws(() => buildFragment({ identity: { ...identity, sourceSha: "trunk" }, results: {} }), /full lowercase/);
});

test("requires negotiated protocol versions from every certification client", () => {
  assert.throws(() => buildFragment({ identity, results: {} }), /missing negotiated protocol version/);
});

test("preserves failed checks as fail", () => {
  const failing = {
    ...passing("sdk"),
    initialize: { ...passingBase.initialize, result: "fail", error: "initialize transport down" },
  };
  const fragment = buildFragment({ identity, results: {
    sdk: { performedBy: "Official MCP TypeScript SDK", requestUrl: identity.requestUrl, protocolVersion: "2025-06-18", checks: failing },
    inspector: { performedBy: "MCP Inspector", requestUrl: identity.requestUrl, protocolVersion: "2025-06-18", checks: passing("inspector") },
  }});
  const initializeRow = fragment.observations.find((row) =>
    row.canonical_client === "Official MCP TypeScript SDK" && row.operation === "initialize",
  );
  assert.equal(initializeRow.result, "fail");
  assert.equal(initializeRow.skip_reason, null);
  assert.equal(initializeRow.evidence_receipt, null);
  assert.equal(initializeRow.evidence_digest, null);
});

test("preserves failed initialization when negotiation did not complete", () => {
  const failing = {
    ...passing("sdk"),
    initialize: { ...passingBase.initialize, result: "fail", error: "initialize transport down" },
  };
  const fragment = buildFragment({ identity, results: {
    sdk: { performedBy: "Official MCP TypeScript SDK", requestUrl: identity.requestUrl, protocolVersion: null, checks: failing },
    inspector: { performedBy: "MCP Inspector", requestUrl: identity.requestUrl, protocolVersion: "2025-06-18", checks: passing("inspector") },
  }});
  const initializeRow = fragment.observations.find((row) =>
    row.canonical_client === "Official MCP TypeScript SDK" && row.operation === "initialize",
  );
  assert.equal(initializeRow.result, "fail");
  assert.equal(initializeRow.protocol_version, null);
});


test("unobserved public authority retains governed identity without minting receipt v2", async () => {
  const fragment = buildFragment({ identity, results: Object.fromEntries(Object.keys(CLIENTS).map((key) => [key, {
    protocolVersion: "2025-06-18", checks: passing(key),
  }])) });
  const row = fragment.observations.find((row) => row.operation === "initialize");
  assert.equal(row.evidence_receipt, null);
  assert.equal(row.requirements_revision, requirements.revision);
  assert.equal(row.maturity, "supported");
  assert.equal(row.required_tier, "nightly");
  assert.equal(row.auth_policy_revision, "anonymous-public-v1");
  assert.deepEqual(row.scenario_facets, ["positive", "negative", "media-schema", "auth"]);
  assert.match(row.skip_reason, /caller\/session authority/);
});

test("missing, ambiguous, stale-version and incomplete requirement context fail closed", () => {
  const results = Object.fromEntries(Object.keys(CLIENTS).map((key) => [key, { protocolVersion: "2025-06-18", checks: passing(key) }]));
  for (const catalog of [undefined, { ...requirements, receipt_schema_min: "v1" },
    { ...requirements, complete: false }, { ...requirements, requirements: requirements.requirements.slice(1) },
    { ...requirements, requirements: [...requirements.requirements, requirements.requirements[0]] },
    { ...requirements, requirements: requirements.requirements.map((row) => ({ ...row, client_version: "stale" })) }]) {
    assert.throws(() => build({ identity, results, requirements: catalog }), /governed|requirement/);
  }
});

test("unsupported cancellation and auth never mint negative facets or pass receipts", () => {
  for (const behavior of ["behavior/cancellation", "behavior/auth"]) {
    const checks = { ...passing("sdk"), [behavior]: { result: "skip", reason: "not implemented" } };
    const fragment = buildFragment({ identity, results: Object.fromEntries(Object.keys(CLIENTS).map((key) => [key, {
      protocolVersion: "2025-06-18", checks,
    }])) });
    assert.equal(fragment.observations.filter((row) => row.result === "pass").length, 0);
    assert.equal(fragment.observations.some((row) => row.evidence_receipt), false);
  }
});

test("bare or contradictory cancellation successes cannot mint any candidate receipts", () => {
  for (const change of [
    (proof) => Object.keys(proof).forEach((key) => delete proof[key]),
    (proof) => { proof.performedBy = "MCP Inspector"; },
    (proof) => { proof.fixtureSourceSha = "f".repeat(40); },
    (proof) => { proof.clientAbortUsed = true; },
    (proof) => { proof.provider.ceasedBeforeBlockerRelease = false; },
    (proof) => { proof.cleanup.originalRequestDrained = false; },
  ]) {
    const checks = structuredClone(passing("sdk"));
    change(checks["behavior/cancellation"].value);
    const fragment = buildFragment({ identity, results: {
      sdk: { protocolVersion: "2025-06-18", checks },
      inspector: { protocolVersion: "2025-06-18", checks: { ...passing("inspector"),
        "behavior/cancellation": { result: "skip", reason: "not implemented" } } },
    } });
    assert.equal(fragment.observations.length, 82);
    assert.equal(fragment.observations.some((row) => row.result === "pass" || row.evidence_receipt), false);
  }
});

test("semantic and cessation evidence must use the same independently allocated fixture", () => {
  const checks = { ...passing("sdk"), "tools/call:query_features": { result: "pass", value: {
    schema: "honua.mcp-read-semantic-proof/v1", positive: true, negative: true, mediaSchema: true,
    fixtureSourceSha: identity.sourceSha, seedSqlSha256: `sha256:${"d".repeat(64)}`, allocatedIdsSha256: `sha256:${"9".repeat(64)}`,
  } } };
  const fragment = buildFragment({ identity, results: {
    sdk: { protocolVersion: "2025-06-18", checks },
    inspector: { protocolVersion: "2025-06-18", checks: passing("inspector") },
  } });
  assert.equal(fragment.observations.find((row) => row.operation === "tools/call:query_features").result, "skip");
  assert.equal(fragment.observations.length, 82);
});


test("real release consumer validates synthetic v2 schema integrity without granting authority", { skip: !process.env.HONUA_RELEASE_CHECKER }, () => {
  const fragment = buildFragment({ identity, results: Object.fromEntries(Object.keys(CLIENTS).map((key) => [key, {
    protocolVersion: "2025-06-18", checks: passing(key),
  }])) });
  // Explicit schema-only synthetic fixture: production normalization above
  // correctly emits no receipt without actual authority. This retains consumer
  // identity/digest negative controls independently of runtime qualification.
  const row = structuredClone(fragment.observations.find((row) => row.operation === "initialize"));
  assert.equal(row.evidence_receipt, null);
  row.result = "pass";
  row.skip_reason = null;
  row.exercised_capabilities = [...row.scenario_facets];
  const fields = ["capability_key", "surface", "operation", "canonical_client", "client_version", "deployment_target", "source_sha", "producer_source_sha", "image_digest", "fixture_revision", "contract_revision", "auth_policy_revision", "started_at", "completed_at", "maturity", "required_tier", "requirements_revision"];
  row.evidence_receipt = {schema: "honua.certification-evidence-receipt/v2",
    identity: Object.fromEntries(fields.map((key) => [key, row[key]])), result: "pass",
    facets: Object.fromEntries(row.scenario_facets.map((facet) => [facet, "pass"])),
    payload_base64: Buffer.from("schema-only synthetic test fixture; no candidate authority").toString("base64")};
  const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
    : value && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);
  row.evidence_digest = `sha256:${createHash("sha256").update(canonical(row.evidence_receipt)).digest("hex")}`;
  row.facet_results = Object.fromEntries(row.scenario_facets.map((facet) => [facet, {result:"pass", evidence_digest:row.evidence_digest}]));
  const code = `import copy,importlib.util,json,sys
spec=importlib.util.spec_from_file_location("release_checker",sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
row=json.load(sys.stdin);revision=row["requirements_revision"]
assert m._valid_receipt(row, requirements_revision=revision)
for field,value in [("requirements_revision","stale"),("required_tier","release"),("maturity","preview"),("schema","honua.certification-evidence-receipt/v1")]:
    bad=copy.deepcopy(row)
    if field=="schema": bad["evidence_receipt"][field]=value
    else: bad["evidence_receipt"]["identity"][field]=value
    assert not m._valid_receipt(bad, requirements_revision=revision),field
bad=copy.deepcopy(row);bad["evidence_digest"]="sha256:"+"0"*64
assert m._receipt_digest(bad["evidence_receipt"]) != bad["evidence_digest"]
`;
  const checked = spawnSync("python3", ["-c", code, process.env.HONUA_RELEASE_CHECKER], { input: JSON.stringify(row), encoding: "utf8" });
  assert.equal(checked.status, 0, checked.stderr);
});


test("semantic read fixture proof cannot replace missing per-operation authority", () => {
  const semantic = { result: "pass", value: { schema: "honua.mcp-read-semantic-proof/v1", positive: true, negative: true,
    mediaSchema: true, fixtureSourceSha: identity.sourceSha, seedSqlSha256: `sha256:${"d".repeat(64)}`, allocatedIdsSha256: `sha256:${"e".repeat(64)}` } };
  for (const [value, expected] of [[semantic, "skip"], [{ ...semantic, value: {} }, "skip"],
    [{ ...semantic, value: { ...semantic.value, fixtureSourceSha: "f".repeat(40) } }, "skip"]]) {
    const checks = { ...passing("sdk"), "tools/call:query_features": value };
    const fragment = buildFragment({ identity, results: Object.fromEntries(Object.keys(CLIENTS).map((key) => [key, { protocolVersion: "2025-06-18", checks }])) });
    assert.equal(fragment.observations.find((row) => row.operation === "tools/call:query_features").result, expected);
  }
});


test("missing or invalid executed tier cannot create certification receipts", () => {
  for (const executedTier of [undefined, null, "", "production", "Release", true]) {
    assert.throws(() => buildFragment({ identity, results: {}, executedTier }), /executed certification tier/);
  }
});

test("governed tier and actual authority are independently required for pass receipts", () => {
  const tiers = ["pr", "nightly", "release"];
  const results = Object.fromEntries(Object.keys(CLIENTS).map((key) => [key, { protocolVersion: "2025-06-18", checks: passing(key) }]));
  for (const executedTier of tiers) {
    for (const requiredTier of tiers) {
      const catalog = { ...requirements, requirements: requirements.requirements.map((row) => ({ ...row, required_tier: requiredTier })) };
      const fragment = buildFragment({ identity, results, requirements: catalog, executedTier });
      const row = fragment.observations.find((value) => value.operation === "ping");
      if (tiers.indexOf(executedTier) >= tiers.indexOf(requiredTier)) {
        assert.equal(row.result, "skip");
        assert.equal(row.required_tier, requiredTier);
        assert.equal(row.evidence_receipt, null);
        assert.match(row.skip_reason, /caller\/session authority/);
      } else {
        assert.equal(row.result, "skip");
        assert.match(row.skip_reason, /executed .* tier does not satisfy required/);
        assert.equal(row.evidence_receipt, null);
        assert.equal(row.evidence_digest, null);
        assert.equal(row.facet_results, null);
        assert.deepEqual(row.exercised_capabilities, []);
      }
    }
  }
  const failed = buildFragment({ identity, executedTier: "pr", results: Object.fromEntries(Object.keys(CLIENTS).map((key) => [key, {
    protocolVersion: "2025-06-18", checks: { ...passing(key), ping: { result: "fail" } },
  }])) });
  assert.equal(failed.observations.find((row) => row.operation === "ping").result, "fail");
});

test("workflow supplies resolved event tier to the fragment builder", async () => {
  const { readFile } = await import("node:fs/promises");
  const workflow = await readFile(new URL("../../.github/workflows/protocol-certification.yml", import.meta.url), "utf8");
  const emit = workflow.split("- name: Emit normalized digest-bound fragment")[1].split("- name: Upload governed producer artifact")[0];
  assert.ok(emit.includes("EXECUTED_TIER: ${{ steps.identity.outputs.tier }}"));
  assert.ok(emit.includes('--arg executedTier "${EXECUTED_TIER}"'));
  assert.ok(emit.includes("{executedTier:$executedTier,identity:"));
});

test("Inspector apparent passes cannot survive missing or mismatched independent pagination proof", () => {
  for (const change of [undefined, { pageCount: 1 }, { sourceSha: "f".repeat(40) }, { inspectorVersion: "2.3.0" },
    { cursorHandoffCount: 0 }, { clientResultMatchesWire: false }]) {
    const checks = passing("inspector");
    checks["behavior/resources-pagination"].value = change === undefined ? undefined : { ...syntheticInspectorPaginationProof(), ...change };
    const result = buildFragment({ identity, results: {
      sdk: { protocolVersion: "2025-06-18", checks: passing("sdk") },
      inspector: { protocolVersion: "2025-06-18", checks },
    }});
    assert.equal(result.observations.filter((row) => row.canonical_client === "MCP Inspector" && row.result === "pass").length, 0);
    assert.equal(result.observations.some((row) => row.evidence_receipt), false);
    assert.equal(verifyInspectorPaginationProof(checks["behavior/resources-pagination"].value, identity.sourceSha, CLIENTS.inspector.version), false);
    assert.equal(verifyCancellationProof(passing("sdk")["behavior/cancellation"].value, identity.sourceSha, CLIENTS.sdk.canonicalClient), true);
    assert.equal(result.observations.length, 82);
  }
});

test("Inspector browser and SDK cancellation proofs cannot substitute for one another or a local abort", () => {
  for (const value of [undefined, syntheticCancellationProof('MCP Inspector'),
    { ...syntheticInspectorCancellationProof(), genuineNotificationObserved: false },
    { ...syntheticInspectorCancellationProof(), originalUpstreamKeptOpen: false },
    { ...syntheticInspectorCancellationProof(), protocolVersion: '2025-11-25' },
    { ...syntheticInspectorCancellationProof(), inspectorVersion: '2.3.0' }]) {
    const checks = passing('inspector'); checks['behavior/cancellation'].value = value;
    const fragment = buildFragment({ identity, results: {
      sdk: { protocolVersion: '2025-06-18', checks: passing('sdk') },
      inspector: { protocolVersion: '2025-06-18', checks },
    } });
    assert.equal(fragment.observations.length, 82);
    assert.equal(fragment.observations.filter((row) => row.canonical_client === 'MCP Inspector' && row.result === 'pass').length, 0);
    assert.equal(fragment.observations.some((row) => row.evidence_receipt), false);
    assert.equal(verifyInspectorCancellationProof(value, identity.sourceSha, CLIENTS.inspector.version, "2025-06-18"), false);
    assert.equal(verifyCancellationProof(passing("sdk")["behavior/cancellation"].value, identity.sourceSha, CLIENTS.sdk.canonicalClient), true);
  }
});

test("authored plan evidence is admitted only with exact source, raw oracle proof and global behavior", async () => {
  const sourceBefore = process.env.HONUA_MCP_SERVER_SOURCE_SHA;
  const resultsBefore = process.env.CERT_RESULTS;
  const retained = mkdtempSync(join(tmpdir(), "mcp-plan-fragment-"));
  process.env.CERT_RESULTS = join(retained, "results.json");
  process.env.HONUA_MCP_SERVER_SOURCE_SHA = identity.sourceSha;
  const checks = passing("sdk");
  try {
    await planScenarios(async (_name, arguments_) => ({ structuredContent: {
      isExecutable: arguments_.plan.steps[0].inputs.wkb !== "not-base64", requiresApproval: false, warnings: [],
      violations: arguments_.plan.steps[0].inputs.wkb === "not-base64" ? [{ code: "INVALID_PARAMETER_VALUE",
        fieldPath: "steps[buffer].inputs.wkb", message: "Invalid base64" }] : [],
    } }), async (name, run) => { checks[name] = { result: "pass", value: await run() }; });
    const row = (sdkChecks) => buildFragment({ identity, results: {
      sdk: { protocolVersion: "2025-06-18", checks: sdkChecks },
      inspector: { protocolVersion: "2025-06-18", checks: passing("inspector") },
    } }).observations.find((item) => item.canonical_client === CLIENTS.sdk.canonicalClient && item.operation === "tools/call:validate_plan");
    assert.equal(verifyPlanProof(checks["tools/call:validate_plan"].value, identity.sourceSha), true);
    assert.equal(row(checks).result, "skip");
    assert.match(row(checks).skip_reason, /caller\/session authority/);
    for (const mutation of ["wrong-source", "wrong-helper", "changed-fixture", "invalid-accepted", "missing-observations", "null-observations", "no-auth", "no-cancellation"]) {
      const broken = structuredClone(checks);
      const proof = broken["tools/call:validate_plan"].value;
      if (mutation === "wrong-source") proof.candidateSourceSha = "d".repeat(40);
      else if (mutation === "wrong-helper") proof.helperSourceSha = "d".repeat(40);
      else if (mutation === "changed-fixture") proof.fixtureSha256 = `sha256:${"0".repeat(64)}`;
      else if (mutation === "invalid-accepted") proof.observations.cases[1].result.structuredContent.isExecutable = true;
      else if (mutation === "missing-observations") delete proof.observations;
      else if (mutation === "null-observations") proof.observations = null;
      else broken[mutation === "no-auth" ? "behavior/auth" : "behavior/cancellation"].result = "skip";
      if (!["no-auth", "no-cancellation"].includes(mutation)) assert.equal(verifyPlanProof(proof, identity.sourceSha), false, mutation);
      assert.equal(row(broken).result, "skip", mutation);
      assert.equal(row(broken).evidence_receipt, null, mutation);
    }
  } finally {
    if (sourceBefore === undefined) delete process.env.HONUA_MCP_SERVER_SOURCE_SHA;
    else process.env.HONUA_MCP_SERVER_SOURCE_SHA = sourceBefore;
    if (resultsBefore === undefined) delete process.env.CERT_RESULTS;
    else process.env.CERT_RESULTS = resultsBefore;
    rmSync(retained, { recursive: true, force: true });
  }
});

test("entity receipts rejudge raw observations and retain candidate and global behavior requirements", () => {
  const semantic = { result: "pass", value: { schema: "honua.mcp-read-semantic-proof/v1", positive: true, negative: true,
    mediaSchema: true, fixtureSourceSha: identity.sourceSha, seedSqlSha256: `sha256:${"d".repeat(64)}`,
    allocatedIdsSha256: `sha256:${"e".repeat(64)}`, entityResolution: entityObservations() } };
  const checks = { ...passing("sdk"), "tools/call:resolve_entity": semantic };
  const row = (value) => buildFragment({ identity, results: {
    sdk: { protocolVersion: "2025-06-18", checks: value }, inspector: { protocolVersion: "2025-06-18", checks: passing("inspector") },
  } }).observations.find((entry) => entry.canonical_client === CLIENTS.sdk.canonicalClient && entry.operation === "tools/call:resolve_entity");
  assert.equal(verifyEntityResolution(semantic.value.entityResolution), true);
  assert.equal(row(checks).result, "skip");
  assert.match(row(checks).skip_reason, /caller\/session authority/);
  for (const mutation of ["missing-raw", "wrong-raw", "wrong-source", "wrong-seed", "no-auth", "no-cancellation"]) {
    const broken = structuredClone(checks);
    const proof = broken["tools/call:resolve_entity"].value;
    if (mutation === "missing-raw") delete proof.entityResolution;
    else if (mutation === "wrong-raw") proof.entityResolution[0].result.structuredContent.matches = [];
    else if (mutation === "wrong-source") proof.fixtureSourceSha = "f".repeat(40);
    else if (mutation === "wrong-seed") proof.seedSqlSha256 = `sha256:${"0".repeat(64)}`;
    else broken[mutation === "no-auth" ? "behavior/auth" : "behavior/cancellation"].result = "skip";
    if (["missing-raw", "wrong-raw"].includes(mutation)) {
      let passed = false;
      try { passed = verifyEntityResolution(proof.entityResolution); } catch {}
      assert.equal(passed, false, mutation);
    }
    assert.equal(row(broken).result, "skip", mutation);
    assert.equal(row(broken).evidence_receipt, null, mutation);
  }
});


test("render claims without retained bound oracle proof never receive receipts", () => {
  for (const proof of [undefined, null, {}, { schema: "honua.mcp-render-proof/v1", positive: true, negative: true, mediaSchema: true },
    { schema: "honua.mcp-render-proof/v1", candidateSourceSha: identity.sourceSha, candidateImage: `ghcr.io/honua-io/honua-server@${identity.imageDigest}`,
      positive: true, negative: true, mediaSchema: true, observations: null }]) {
    const sdk = passing("sdk");
    sdk["tools/call:render_map"] = { result: "pass", value: proof };
    const fragment = buildFragment({ identity, results: {
      sdk: { protocolVersion: "2025-06-18", checks: sdk },
      inspector: { protocolVersion: "2025-06-18", checks: passing("inspector") },
    } });
    const row = fragment.observations.find((item) => item.operation === "tools/call:render_map" && item.canonical_client === CLIENTS.sdk.canonicalClient);
    assert.equal(row.result, "skip");
    assert.equal(row.evidence_receipt, null);
    assert.match(row.skip_reason, /candidate-bound semantic proof did not pass:.*release\/issues\/123/);
    assert.equal(fragment.observations.length, 82);
  }
});

test("render receipts require rejudged raw geometry/media, exact bootstrap/candidate and every global behavior", async () => {
  const keys = ["HONUA_MCP_SERVER_SOURCE_SHA", "HONUA_MCP_SERVER_IMAGE", "HONUA_MCP_RENDER_BOOTSTRAP", "CERT_RESULTS", "PATH"];
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const directory = mkdtempSync(join(tmpdir(), "mcp-render-fragment-"));
  const candidateImage = `ghcr.io/honua-io/honua-server@${identity.imageDigest}`;
  try {
    process.env.HONUA_MCP_SERVER_SOURCE_SHA = identity.sourceSha;
    process.env.HONUA_MCP_SERVER_IMAGE = candidateImage;
    process.env.HONUA_MCP_RENDER_BOOTSTRAP = join(directory, "bootstrap.json");
    process.env.CERT_RESULTS = join(directory, "results.json");
    const pins = JSON.parse(readFileSync(new URL("../render-validation-pins.json", import.meta.url), "utf8"));
    const bootstrap = controlledRenderBootstrap(identity.sourceSha, candidateImage,
      `sha256:${pins.sha256["certification/installed-clients/fixture.v1.json"]}`);
    writeFileSync(process.env.HONUA_MCP_RENDER_BOOTSTRAP, JSON.stringify(bootstrap));
    writeFileSync(join(directory, "docker"), controlledDockerProgram(bootstrap.runtimeBinding), { mode: 0o755 });
    process.env.PATH = directory + delimiter + before.PATH;
    const checks = passing("sdk");
    await renderScenarios(async (_tool, arguments_) => controlledRenderResponse(arguments_),
      async (name, run) => { checks[name] = { result: "pass", value: await run() }; });
    const row = (sdkChecks) => buildFragment({ identity, results: {
      sdk: { protocolVersion: "2025-06-18", checks: sdkChecks }, inspector: { protocolVersion: "2025-06-18", checks: passing("inspector") },
    } }).observations.find((item) => item.operation === "tools/call:render_map" && item.canonical_client === CLIENTS.sdk.canonicalClient);
    assert.equal(verifyRenderProof(checks["tools/call:render_map"].value, identity.sourceSha, identity.imageDigest), true);
    assert.equal(row(checks).result, "skip");
    assert.match(row(checks).skip_reason, /caller\/session authority/);
    for (const mutation of ["source", "image", "oracle", "media", "negative", "runtime-before", "runtime-after", "missing-raw", "null-raw", "no-auth", "no-cancellation"]) {
      const broken = structuredClone(checks), proof = broken["tools/call:render_map"].value;
      if (mutation === "source") proof.candidateSourceSha = "d".repeat(40);
      else if (mutation === "image") proof.candidateImage = candidateImage.replace(identity.imageDigest, `sha256:${"d".repeat(64)}`);
      else if (mutation === "oracle") proof.pngOracleSha256 = `sha256:${"0".repeat(64)}`;
      else if (mutation === "media") proof.observations.cases[0].result.content[1].mimeType = "image/jpeg";
      else if (mutation === "negative") proof.observations.cases[2].result.structuredContent.code = "internal";
      else if (mutation === "runtime-before" || mutation === "runtime-after") proof.observations[mutation === "runtime-before" ? "runtimeBefore" : "runtimeAfter"].startedAt = "changed";
      else if (mutation === "missing-raw") delete proof.observations;
      else if (mutation === "null-raw") proof.observations = null;
      else broken[mutation === "no-auth" ? "behavior/auth" : "behavior/cancellation"].result = "skip";
      if (!["no-auth", "no-cancellation"].includes(mutation)) assert.equal(verifyRenderProof(proof, identity.sourceSha, identity.imageDigest), false, mutation);
      assert.equal(row(broken).result, "skip", mutation);
      assert.equal(row(broken).evidence_receipt, null, mutation);
    }
  } finally {
    for (const key of keys) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; }
    rmSync(directory, { recursive: true, force: true });
  }
});


test("protected canonical style claims cannot bypass pinned policy or rejudging", () => {
  const checks = passing("sdk");
  for (const operation of ["tools/call:get_style", "tools/call:apply_style_preset"]) {
    checks[operation] = { result: "pass", value: { positive: true, negative: true, coloredRender: true } };
  }
  const fragment = buildFragment({ identity, results: {
    sdk: { protocolVersion: "2025-06-18", checks },
    inspector: { protocolVersion: "2025-06-18", checks: passing("inspector") },
  } });
  for (const operation of ["tools/call:get_style", "tools/call:apply_style_preset"]) {
    const row = fragment.observations.find(item => item.operation === operation && item.canonical_client === CLIENTS.sdk.canonicalClient);
    assert.equal(row.result, "skip");
    assert.equal(row.evidence_receipt, null);
    assert.match(row.skip_reason, /candidate-bound semantic proof/);
  }
  assert.equal(fragment.observations.length, 82);
});

test("protected canonical execution claims cannot bypass pinned policy or rejudging", () => {
  const checks = passing("sdk");
  for (const operation of ["tools/call:execute_plan"]) {
    checks[operation] = { result: "pass", value: { positive: true, negative: true, idempotentReplay: true, geometricResult: true } };
  }
  const fragment = buildFragment({ identity, results: {
    sdk: { protocolVersion: "2025-06-18", checks },
    inspector: { protocolVersion: "2025-06-18", checks: passing("inspector") },
  } });
  for (const operation of ["tools/call:execute_plan"]) {
    const row = fragment.observations.find(item => item.operation === operation && item.canonical_client === CLIENTS.sdk.canonicalClient);
    assert.equal(row.result, "skip");
    assert.equal(row.evidence_receipt, null);
    assert.match(row.skip_reason, /candidate-bound semantic proof/);
  }
  assert.equal(fragment.observations.length, 82);
});


test("protected worker-result publication claims cannot bypass policy or immutable rejudging", () => {
  for (const key of Object.keys(CLIENTS)) {
    const checks = passing(key);
    checks["tools/call:publish_result"] = { result: "pass", value: { positive: true, negative: true,
      genuineWorkerResult: true, persistedReadback: true, restartReadback: true } };
    const fragment = buildFragment({ identity, results: Object.fromEntries(Object.keys(CLIENTS).map(client => [client, {
      protocolVersion: "2025-06-18", checks: client === key ? checks : passing(client),
    }])) });
    const row = fragment.observations.find(item => item.operation === "tools/call:publish_result" && item.canonical_client === CLIENTS[key].canonicalClient);
    assert.equal(row.result, "skip");
    assert.equal(row.evidence_receipt, null);
    assert.match(row.skip_reason, /candidate-bound semantic proof/);
    assert.equal(fragment.observations.length, 82);
    checks["tools/call:publish_result"].result = "fail";
    const failed = buildFragment({ identity, results: Object.fromEntries(Object.keys(CLIENTS).map(client => [client, {
      protocolVersion: "2025-06-18", checks: client === key ? checks : passing(client),
    }])) }).observations.find(item => item.operation === "tools/call:publish_result" && item.canonical_client === CLIENTS[key].canonicalClient);
    assert.equal(failed.result, "fail");
    assert.equal(failed.evidence_receipt, null);
  }
});

test("historical real execute oracle joins full authority, global behavior and tier controls", () => {
  const retained = JSON.parse(readFileSync(new URL("./fixtures/historical-execute-plan-39284007212.json", import.meta.url), "utf8"));
  assert.match(retained.meaning, /regression only/);
  assert.equal(retained.originalGlobalResults["behavior/cancellation"], "fail");
  const historical = retained.identity;
  // Composite offline regression only: the execute proof is untouched actual
  // hosted wire evidence; this global vector is explicitly synthetic metadata,
  // never a claim that the historical run's failed cancellation passed.
  const checks = { ...passing("sdk"), "behavior/cancellation": { result:"pass", value:{
    ...syntheticCancellationProof(), fixtureSourceSha:historical.sourceSha}},
    "tools/call:execute_plan":{result:"pass", value:retained.proof}};
  const joined = (sdkChecks, executedTier="release", catalog=requirements) => buildFragment({
    identity:historical, executedTier, requirements:catalog, now:"2026-10-19T16:40:00Z", results:{
      sdk:{protocolVersion:"2025-06-18", checks:sdkChecks},
      inspector:{protocolVersion:"2025-06-18", checks:passing("inspector")}}});
  const selected = (fragment) => fragment.observations.find((row) => row.operation === "tools/call:execute_plan"
    && row.canonical_client === CLIENTS.sdk.canonicalClient);
  const bootstrapBefore = process.env.HONUA_MCP_RENDER_BOOTSTRAP;
  const fixtureDirectory = mkdtempSync(join(tmpdir(), "historical-execute-regression-"));
  const bootstrapBytes = Buffer.from(retained.bootstrapBase64, "base64");
  assert.equal(createHash("sha256").update(bootstrapBytes).digest("hex"), retained.bootstrapBytesSha256);
  process.env.HONUA_MCP_RENDER_BOOTSTRAP = join(fixtureDirectory, "original-bootstrap.json");
  writeFileSync(process.env.HONUA_MCP_RENDER_BOOTSTRAP, bootstrapBytes);
  try {
  const positive = selected(joined(checks));
  assert.equal(positive.result,"pass");
  assert.equal(positive.evidence_receipt.schema,"honua.certification-evidence-receipt/v2");
  assert.equal(positive.auth_policy_revision,"mcp-protected-operation-v1");
  assert.deepEqual(positive.scenario_facets,["positive","negative","media-schema","auth"]);
  assert.equal(positive.evidence_receipt.facets.auth,"pass");
  assert.equal(positive.evidence_receipt.identity.source_sha,historical.sourceSha);
  assert.equal(positive.evidence_receipt.identity.image_digest,historical.imageDigest);
  for (const mutation of ["no-raw","no-anonymous","credential-forwarding","session-reuse","raw-tamper",
    "no-cancellation","failed-cancellation","no-global-auth","wrong-client","wrong-image","under-tier"]) {
    const broken=structuredClone(checks), proof=broken["tools/call:execute_plan"].value;
    if (mutation==="no-raw") delete proof.observations;
    else if (mutation==="no-anonymous") proof.observations.calls=proof.observations.calls.filter((row)=>row.authenticated);
    else if (mutation==="credential-forwarding") proof.observations.calls.find((row)=>!row.authenticated).wire.invocation.request.credentialPresent=true;
    else if (mutation==="session-reuse") proof.observations.calls.find((row)=>!row.authenticated).wire.invocation.request.sessionSha256=
      proof.observations.calls.find((row)=>row.id==="execute").wire.initialize.response.sessionSha256;
    else if (mutation==="raw-tamper") proof.observations.calls[0].wire.invocation.response.bodyBase64=Buffer.from('{}').toString('base64');
    else if (mutation==="wrong-client") proof.canonicalClient="MCP Inspector";
    else if (mutation==="wrong-image") proof.candidateImage=proof.candidateImage.replace(historical.imageDigest,`sha256:${"0".repeat(64)}`);
    else if (mutation==="no-cancellation") delete broken["behavior/cancellation"];
    else if (mutation==="failed-cancellation") broken["behavior/cancellation"].result=retained.originalGlobalResults["behavior/cancellation"];
    else if (mutation==="no-global-auth") delete broken["behavior/auth"];
    const row=selected(joined(broken,mutation==="under-tier"?"pr":"release"));
    assert.notEqual(row.result,"pass",mutation);
    assert.equal(row.evidence_receipt,null,mutation);
    assert.equal(row.facet_results,null,mutation);
  }
  } finally {
    if (bootstrapBefore === undefined) delete process.env.HONUA_MCP_RENDER_BOOTSTRAP;
    else process.env.HONUA_MCP_RENDER_BOOTSTRAP = bootstrapBefore;
    rmSync(fixtureDirectory, {recursive:true, force:true});
  }
});

test("source controls run independently of frozen catalog and candidate qualification", () => {
  const workflow=readFileSync(new URL("../../.github/workflows/mcp-producer-source-controls.yml",import.meta.url),"utf8");
  for (const expected of ["pull_request:","npm ci --ignore-scripts","npm run prepare:plan","npm run prepare:render",
    "module.immutable_files",'digest != pins["sha256"][path]',"HONUA_RELEASE_CHECKER=", "python3 -m unittest discover", "npm test"])
    assert.ok(workflow.includes(expected),expected);
  for (const absent of ["requirements_ref:","--requirements-revision","continue-on-error:","docker run","train_apply"])
    assert.equal(workflow.includes(absent),false,absent);
});

test("complete offline app oracle joins all four primary operations, review authority and unchanged global gates", () => {
  const vector = JSON.parse(readFileSync(new URL("./fixtures/offline-app-oracle-vector.json", import.meta.url)));
  assert.match(vector.meaning, /offline.*no.*candidate/i);
  const proof = vector.proof;
  const selectedIdentity = { ...identity, sourceSha: proof.candidateSourceSha, imageDigest: proof.candidateImage.split("@").at(-1) };
  const operations = ["tools/call:create_app_package", "resources/read:App package", "tools/call:validate_package", "tools/call:preview_package"];
  const checks = { ...passing("sdk"), "behavior/cancellation": { result: "pass", value: {
    ...syntheticCancellationProof(), fixtureSourceSha: selectedIdentity.sourceSha } },
  ...Object.fromEntries(operations.map(operation => [operation, { result: "pass", value: proof }])) };
  const joined = (sdkChecks, executedTier = "release") => buildFragment({ identity: selectedIdentity, executedTier,
    results: { sdk: { protocolVersion: "2025-06-18", checks: sdkChecks },
      inspector: { protocolVersion: "2025-06-18", checks: passing("inspector") } } });
  const selected = fragment => fragment.observations.filter(row => operations.includes(row.operation)
    && row.canonical_client === CLIENTS.sdk.canonicalClient);
  const before = process.env.HONUA_MCP_RENDER_BOOTSTRAP;
  const directory = mkdtempSync(join(tmpdir(), "offline-app-join-"));
  const bytes = Buffer.from(vector.bootstrapBase64, "base64");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), vector.bootstrapBytesSha256);
  process.env.HONUA_MCP_RENDER_BOOTSTRAP = join(directory, "original-bootstrap.json"); writeFileSync(process.env.HONUA_MCP_RENDER_BOOTSTRAP, bytes);
  try {
    const positive = selected(joined(checks));
    assert.equal(positive.length, 4);
    for (const row of positive) {
      assert.equal(row.result, "pass", row.operation);
      assert.equal(row.evidence_receipt.facets.auth, "pass");
      assert.deepEqual(row.scenario_facets, ["positive", "negative", "media-schema", "auth"]);
    }
    for (const mutation of ["no-reviews", "no-review-anonymous", "review-credentials", "review-session", "wrong-review-tool",
      "fake-map", "fake-artifact", "no-raw", "no-cancellation", "failed-cancellation", "no-global-auth", "under-tier"]) {
      const broken = structuredClone(checks), changed = broken[operations[0]].value;
      if (mutation === "no-reviews") delete changed.observations.reviews;
      else if (mutation === "no-review-anonymous") changed.observations.reviews = changed.observations.reviews.filter(item => item.authenticated);
      else if (mutation === "review-credentials") changed.observations.reviews.find(item => !item.authenticated).wire.invocation.request.credentialPresent = true;
      else if (mutation === "review-session") changed.observations.reviews[0].wire.initialize.response.sessionSha256 =
        changed.observations.cases[0].wire.initialize.response.sessionSha256;
      else if (mutation === "wrong-review-tool") changed.observations.reviews[0].wire.expectedParams.name = "honua_preview_package";
      else if (mutation === "fake-map") changed.observations.prerequisites.map.result.structuredContent.package.mapPackageId = "map_uncreated";
      else if (mutation === "fake-artifact") changed.observations.prerequisites.execution.snapshots.completed.results = [];
      else if (mutation === "no-raw") delete changed.observations;
      else if (mutation === "no-cancellation") delete broken["behavior/cancellation"];
      else if (mutation === "failed-cancellation") broken["behavior/cancellation"].result = "fail";
      else if (mutation === "no-global-auth") delete broken["behavior/auth"];
      for (const row of selected(joined(broken, mutation === "under-tier" ? "pr" : "release"))) {
        assert.notEqual(row.result, "pass", `${mutation}: ${row.operation}`);
        assert.equal(row.evidence_receipt, null);
      }
    }
  } finally {
    if (before === undefined) delete process.env.HONUA_MCP_RENDER_BOOTSTRAP; else process.env.HONUA_MCP_RENDER_BOOTSTRAP = before;
    rmSync(directory, { recursive: true, force: true });
  }
});
