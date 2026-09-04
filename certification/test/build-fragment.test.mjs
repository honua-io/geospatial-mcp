import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { buildFragment } from "../build-fragment.mjs";

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
