import { planScenarios } from "../plan-validation.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    scenario_facets: ["positive", "negative", "media-schema"], fixture_revision: FIXTURE_REVISION,
    contract_revision: CONTRACT_REVISION, auth_policy_revision: "anonymous-public-v1",
  }))) };
const buildFragment = (input) => build({ requirements, executedTier: "nightly", ...input });

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


test("receipt v2 owns the exact governed identity", async () => {
  const fragment = buildFragment({ identity, results: Object.fromEntries(Object.keys(CLIENTS).map((key) => [key, {
    protocolVersion: "2025-06-18", checks: passing(key),
  }])) });
  const row = fragment.observations.find((row) => row.result === "pass");
  assert.equal(row.evidence_receipt.schema, "honua.certification-evidence-receipt/v2");
  assert.equal(row.evidence_receipt.identity.requirements_revision, requirements.revision);
  assert.equal(row.evidence_receipt.identity.maturity, "supported");
  assert.equal(row.evidence_receipt.identity.required_tier, "nightly");
  assert.equal("runtime_environment" in row.evidence_receipt.identity, false);
  assert.equal("protocol_version" in row.evidence_receipt.identity, false);
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


test("real release consumer accepts v2 and rejects stale context and tampered bytes", { skip: !process.env.HONUA_RELEASE_CHECKER }, () => {
  const fragment = buildFragment({ identity, results: Object.fromEntries(Object.keys(CLIENTS).map((key) => [key, {
    protocolVersion: "2025-06-18", checks: passing(key),
  }])) });
  const row = fragment.observations.find((row) => row.result === "pass");
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


test("semantic read pass requires candidate-bound authored fixture proof", () => {
  const semantic = { result: "pass", value: { schema: "honua.mcp-read-semantic-proof/v1", positive: true, negative: true,
    mediaSchema: true, fixtureSourceSha: identity.sourceSha, seedSqlSha256: `sha256:${"d".repeat(64)}`, allocatedIdsSha256: `sha256:${"e".repeat(64)}` } };
  for (const [value, expected] of [[semantic, "pass"], [{ ...semantic, value: {} }, "skip"],
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

test("only execution at or above the governed tier can mint pass receipts", () => {
  const tiers = ["pr", "nightly", "release"];
  const results = Object.fromEntries(Object.keys(CLIENTS).map((key) => [key, { protocolVersion: "2025-06-18", checks: passing(key) }]));
  for (const executedTier of tiers) {
    for (const requiredTier of tiers) {
      const catalog = { ...requirements, requirements: requirements.requirements.map((row) => ({ ...row, required_tier: requiredTier })) };
      const fragment = buildFragment({ identity, results, requirements: catalog, executedTier });
      const row = fragment.observations.find((value) => value.operation === "ping");
      if (tiers.indexOf(executedTier) >= tiers.indexOf(requiredTier)) {
        assert.equal(row.result, "pass");
        assert.equal(row.evidence_receipt.identity.required_tier, requiredTier);
        assert.ok(row.evidence_digest);
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
    assert.ok(result.observations.some((row) => row.canonical_client === "Official MCP TypeScript SDK" && row.result === "pass"));
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
    assert.ok(fragment.observations.some((row) => row.canonical_client === 'Official MCP TypeScript SDK' && row.result === 'pass'));
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
    assert.equal(row(checks).result, "pass");
    for (const mutation of ["wrong-source", "wrong-helper", "changed-fixture", "invalid-accepted", "no-auth", "no-cancellation"]) {
      const broken = structuredClone(checks);
      const proof = broken["tools/call:validate_plan"].value;
      if (mutation === "wrong-source") proof.candidateSourceSha = "d".repeat(40);
      else if (mutation === "wrong-helper") proof.helperSourceSha = "d".repeat(40);
      else if (mutation === "changed-fixture") proof.fixtureSha256 = `sha256:${"0".repeat(64)}`;
      else if (mutation === "invalid-accepted") proof.observations.cases[1].result.structuredContent.isExecutable = true;
      else broken[mutation === "no-auth" ? "behavior/auth" : "behavior/cancellation"].result = "skip";
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
