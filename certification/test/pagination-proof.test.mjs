import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { verifyInspectorPaginationProof, requireSuccessfulInspectorPaginationResult, INSPECTOR_PAGINATION_CHECK, paginationCheck } from "../pagination-proof.mjs";
import { syntheticInspectorPaginationProof } from "./pagination-fixture.mjs";

test("pure pagination consumer requires candidate, installed version and complete multi-page authenticated full tools/list observation", async () => {
  const proof = syntheticInspectorPaginationProof();
  assert.equal(verifyInspectorPaginationProof(proof, "a".repeat(40), "2.10.1"), true);
  assert.equal(/\bimport\b|child_process/.test(await readFile(new URL("../pagination-proof.mjs", import.meta.url), "utf8")), false);
  for (const change of [
    { sourceSha: "b".repeat(40) }, { inspectorVersion: "2.3.0" }, { canonicalClient: "unverified client" },
    { pageCount: 1 }, { pageCount: 101 }, { cursorHandoffCount: 1 }, { toolCount: 2 },
    { complete: false }, { clientResultMatchesWire: false }, { toolNamesSha256: "status-only" },
    { sessionSha256: undefined }, { pageCount: "3" }, { schema: "unknown" },
    { schema: "honua.inspector-pagination-observer/v1" }, { method: "resources/list" }, { method: undefined },
    { workflowView: undefined }, { workflowView: "setup" }, { authenticated: false }, { authenticated: "true" },
    { toolCount: undefined }, { toolNamesSha256: undefined },
  ]) assert.equal(verifyInspectorPaginationProof({ ...proof, ...change }, "a".repeat(40), "2.10.1"), false, JSON.stringify(change));
  assert.equal(verifyInspectorPaginationProof(undefined, "a".repeat(40), "2.10.1"), false);
});

test("v1 resources/list proof shape is refused; Inspector pagination is filed under the tools/list check", () => {
  // The candidate's resources/list is one default page; a v1 proof of it cannot pass.
  const legacy = { schema: "honua.inspector-pagination-observer/v1", canonicalClient: "MCP Inspector",
    inspectorVersion: "2.10.1", sourceSha: "a".repeat(40), pageCount: 3, cursorHandoffCount: 2, resourceCount: 3,
    resourceUrisSha256: "sha256:" + "d".repeat(64), sessionSha256: "sha256:" + "e".repeat(64), complete: true, clientResultMatchesWire: true };
  assert.equal(verifyInspectorPaginationProof(legacy, "a".repeat(40), "2.10.1"), false);
  assert.equal(INSPECTOR_PAGINATION_CHECK, "behavior/tools-pagination");
  assert.equal(paginationCheck("inspector"), INSPECTOR_PAGINATION_CHECK);
  assert.equal(paginationCheck("sdk"), "behavior/resources-pagination");
});

test("full valid pagination JSON cannot bypass nonzero exit, signal, or timeout", () => {
  const full = { tools: [0, 1, 2].map((id) => ({ name: `observed_tool_${id}` })) };
  const successful = { result: "pass", inspectorExitCode: 0, inspectorExitSignal: null, inspectorTimedOut: false };
  assert.equal(requireSuccessfulInspectorPaginationResult(full, successful), full);
  for (const change of [{ inspectorExitCode: 7 }, { inspectorExitSignal: "SIGTERM" }, { inspectorTimedOut: true },
    { result: "fail" }, { inspectorExitCode: null }, { inspectorExitSignal: undefined }]) {
    assert.throws(() => requireSuccessfulInspectorPaginationResult(full, { ...successful, ...change }), /did not complete successfully/);
  }
});
