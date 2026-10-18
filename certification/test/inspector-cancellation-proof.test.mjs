import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { verifyInspectorCancellationProof } from "../inspector-cancellation-proof.mjs";
import { verifyCancellationProof } from "../cancellation-proof.mjs";
import { syntheticInspectorCancellationProof } from "./inspector-cancellation-fixture.mjs";
import { syntheticCancellationProof } from "./cancellation-fixture.mjs";

const verify = (value) => verifyInspectorCancellationProof(value, "a".repeat(40), "2.10.1", "2025-06-18");
test("Inspector UI proof is explicit and cannot weaken official SDK no-AbortSignal proof", async () => {
  const proof = syntheticInspectorCancellationProof();
  assert.equal(verify(proof), true);
  assert.equal(verifyCancellationProof(proof, "a".repeat(40), "Official MCP TypeScript SDK"), false);
  assert.equal(verify(syntheticCancellationProof("MCP Inspector")), false);
  const sdk = syntheticCancellationProof(); sdk.clientAbortUsed = true;
  assert.equal(verifyCancellationProof(sdk, "a".repeat(40), "Official MCP TypeScript SDK"), false);
  assert.equal(/\bimport\b|child_process/.test(await readFile(new URL("../inspector-cancellation-proof.mjs", import.meta.url), "utf8")), false);
});

for (const [name, patch] of Object.entries({ missing: undefined, source: { fixtureSourceSha: "b".repeat(40) },
  version: { inspectorVersion: "2.3.0" }, protocol: { protocolVersion: "2025-11-25" },
  transport: { transport: "stdio" }, era: { protocolEra: "modern" }, notification: { genuineNotificationObserved: false },
  upstreamClosed: { originalUpstreamKeptOpen: false }, localAbortOnly: { publicUiAction: "AbortSignal" },
  inertUi: { localUiCancellationObserved: false },
  wrongTypedId: { notificationRequestId: "7" }, duplicate: { responseCount: 2 }, untyped: { code: "success" },
  result: { hasResult: true }, changedRows: { provider: { afterRowsSha256: `sha256:${"3".repeat(64)}` } },
  localTimeout: { provider: { ceasedBeforeBlockerRelease: false } }, locksRemain: { provider: { relationLocksReleased: false } },
  noRecovery: { recoveryReadMatchesFixture: false }, cleanup: { cleanup: { wireClosed: false } },
})) {
  test(`Inspector proof rejects ${name}`, () => {
    const value = syntheticInspectorCancellationProof();
    assert.equal(verify(patch === undefined ? undefined : { ...value, ...patch,
      provider: { ...value.provider, ...patch.provider }, cleanup: { ...value.cleanup, ...patch.cleanup } }), false);
  });
}
