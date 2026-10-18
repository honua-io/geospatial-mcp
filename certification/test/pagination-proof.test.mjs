import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { verifyInspectorPaginationProof, requireSuccessfulInspectorPaginationResult } from "../pagination-proof.mjs";
import { syntheticInspectorPaginationProof } from "./pagination-fixture.mjs";

test("pure pagination consumer requires candidate, installed version and complete multi-page observation", async () => {
  const proof = syntheticInspectorPaginationProof();
  assert.equal(verifyInspectorPaginationProof(proof, "a".repeat(40), "2.10.1"), true);
  assert.equal(/\bimport\b|child_process/.test(await readFile(new URL("../pagination-proof.mjs", import.meta.url), "utf8")), false);
  for (const change of [
    { sourceSha: "b".repeat(40) }, { inspectorVersion: "2.3.0" }, { canonicalClient: "unverified client" },
    { pageCount: 1 }, { pageCount: 101 }, { cursorHandoffCount: 1 }, { resourceCount: 2 },
    { complete: false }, { clientResultMatchesWire: false }, { resourceUrisSha256: "status-only" },
    { sessionSha256: undefined }, { pageCount: "3" }, { schema: "unknown" },
  ]) assert.equal(verifyInspectorPaginationProof({ ...proof, ...change }, "a".repeat(40), "2.10.1"), false, JSON.stringify(change));
  assert.equal(verifyInspectorPaginationProof(undefined, "a".repeat(40), "2.10.1"), false);
});

test("full valid pagination JSON cannot bypass nonzero exit, signal, or timeout", () => {
  const full = { resources: [0, 1, 2].map((id) => ({ uri: `honua://observed/${id}` })) };
  const successful = { result: "pass", inspectorExitCode: 0, inspectorExitSignal: null, inspectorTimedOut: false };
  assert.equal(requireSuccessfulInspectorPaginationResult(full, successful), full);
  for (const change of [{ inspectorExitCode: 7 }, { inspectorExitSignal: "SIGTERM" }, { inspectorTimedOut: true },
    { result: "fail" }, { inspectorExitCode: null }, { inspectorExitSignal: undefined }]) {
    assert.throws(() => requireSuccessfulInspectorPaginationResult(full, { ...successful, ...change }), /did not complete successfully/);
  }
});
