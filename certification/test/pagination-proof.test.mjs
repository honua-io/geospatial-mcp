import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { verifyInspectorPaginationProof } from "../pagination-proof.mjs";
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
