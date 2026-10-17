import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { buildFragment as build } from "../build-fragment.mjs";
import { CLIENTS, CONTRACT_REVISION, FIXTURE_REVISION, OPERATIONS } from "../requirements.mjs";
const requirements = { schema: "honua.protocol-certification-requirements/v1", receipt_schema_min: "v2", complete: true,
  revision: "test-owned-catalog/v1", requirements: OPERATIONS.flatMap(([capability_key, operation]) => Object.values(CLIENTS).map((client) => ({
    capability_key, surface: "mcp", operation, canonical_client: client.canonicalClient, client_version: client.version,
    deployment_target: "local-docker", maturity: "supported", required_tier: "nightly",
    scenario_facets: ["positive", "negative", "media-schema"], fixture_revision: FIXTURE_REVISION,
    contract_revision: CONTRACT_REVISION, auth_policy_revision: "anonymous-public-v1",
  }))) };
const buildFragment = (input) => build({ requirements, ...input });

const identity = {
  sourceSha: "a".repeat(40), producerSourceSha: "c".repeat(40),
  imageDigest: `sha256:${"b".repeat(64)}`, cutAt: "2026-08-26T20:00:00Z",
  startedAt: "2026-08-26T21:00:00Z", runtimeEnvironment: "Production",
  requestUrl: "http://localhost:8080/mcp",
};
const passing = Object.fromEntries(["initialize", "ping", "tools/list", "resources/templates/list"].map((operation) =>
  [operation, { result: "pass", startedAt: identity.startedAt, completedAt: "2026-08-26T21:01:00Z" }]));
for (const operation of ["behavior/auth", "behavior/error", "behavior/cancellation", "behavior/resources-pagination"]) {
  passing[operation] = { result: "pass", startedAt: identity.startedAt, completedAt: "2026-08-26T21:01:00Z" };
}

test("emits the complete governed denominator and truthful execution identity", () => {
  const fragment = buildFragment({ identity, results: {
    sdk: { performedBy: "Official MCP TypeScript SDK", requestUrl: identity.requestUrl, protocolVersion: "2025-06-18", checks: passing },
    inspector: { performedBy: "MCP Inspector", requestUrl: identity.requestUrl, protocolVersion: "2025-06-18", checks: passing },
  }, now: "2026-08-26T21:02:00Z" });
  assert.equal(fragment.observations.length, 84);
  assert.deepEqual(Object.fromEntries(["Official MCP TypeScript SDK", "MCP Inspector"].map((client) =>
    [client, fragment.observations.filter((row) => row.canonical_client === client).length])), {
    "Official MCP TypeScript SDK": 42, "MCP Inspector": 42,
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
    ...passing,
    initialize: { ...passing.initialize, result: "fail", error: "initialize transport down" },
  };
  const fragment = buildFragment({ identity, results: {
    sdk: { performedBy: "Official MCP TypeScript SDK", requestUrl: identity.requestUrl, protocolVersion: "2025-06-18", checks: failing },
    inspector: { performedBy: "MCP Inspector", requestUrl: identity.requestUrl, protocolVersion: "2025-06-18", checks: passing },
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
    ...passing,
    initialize: { ...passing.initialize, result: "fail", error: "initialize transport down" },
  };
  const fragment = buildFragment({ identity, results: {
    sdk: { performedBy: "Official MCP TypeScript SDK", requestUrl: identity.requestUrl, protocolVersion: null, checks: failing },
    inspector: { performedBy: "MCP Inspector", requestUrl: identity.requestUrl, protocolVersion: "2025-06-18", checks: passing },
  }});
  const initializeRow = fragment.observations.find((row) =>
    row.canonical_client === "Official MCP TypeScript SDK" && row.operation === "initialize",
  );
  assert.equal(initializeRow.result, "fail");
  assert.equal(initializeRow.protocol_version, null);
});


test("receipt v2 owns the exact governed identity", async () => {
  const fragment = buildFragment({ identity, results: Object.fromEntries(Object.keys(CLIENTS).map((key) => [key, {
    protocolVersion: "2025-06-18", checks: passing,
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
  const results = Object.fromEntries(Object.keys(CLIENTS).map((key) => [key, { protocolVersion: "2025-06-18", checks: passing }]));
  for (const catalog of [undefined, { ...requirements, receipt_schema_min: "v1" },
    { ...requirements, complete: false }, { ...requirements, requirements: requirements.requirements.slice(1) },
    { ...requirements, requirements: [...requirements.requirements, requirements.requirements[0]] },
    { ...requirements, requirements: requirements.requirements.map((row) => ({ ...row, client_version: "stale" })) }]) {
    assert.throws(() => build({ identity, results, requirements: catalog }), /governed|requirement/);
  }
});

test("unsupported cancellation and auth never mint negative facets or pass receipts", () => {
  for (const behavior of ["behavior/cancellation", "behavior/auth"]) {
    const checks = { ...passing, [behavior]: { result: "skip", reason: "not implemented" } };
    const fragment = buildFragment({ identity, results: Object.fromEntries(Object.keys(CLIENTS).map((key) => [key, {
      protocolVersion: "2025-06-18", checks,
    }])) });
    assert.equal(fragment.observations.filter((row) => row.result === "pass").length, 0);
    assert.equal(fragment.observations.some((row) => row.evidence_receipt), false);
  }
});


test("real release consumer accepts v2 and rejects stale context and tampered bytes", { skip: !process.env.HONUA_RELEASE_CHECKER }, () => {
  const fragment = buildFragment({ identity, results: Object.fromEntries(Object.keys(CLIENTS).map((key) => [key, {
    protocolVersion: "2025-06-18", checks: passing,
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
