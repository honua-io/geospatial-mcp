import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadServerHarness } from "../server-harness.mjs";

const source = "a".repeat(40);
const files = ["request-cancellation.mjs", "postgres-cancellation-observer.mjs"];
const module = { CANCELLATION_HARNESS_CONTRACT: "honua.mcp-request-cancellation-driver/v1",
  requestCancellation() {}, observerConfiguration() {}, PostgresCancellationObserver: class {} };

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "candidate-server-harness-"));
  const binding = { schema: "honua.candidate-server-harness-binding/v1", repository: "honua-io/honua-server",
    sourceSha: source, files: {} };
  for (const file of files) {
    const bytes = Buffer.from("// Synthetic loader-control bytes; never candidate evidence.\n");
    await writeFile(join(directory, file), bytes);
    binding.files[`tests/mcp-certification/${file}`] = {
      sha256: createHash("sha256").update(bytes).digest("hex"),
      gitBlob: createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex"),
    };
  }
  await writeFile(join(directory, "source-binding.json"), JSON.stringify(binding));
  return { directory, binding };
}

test("loads only exact-source helper bytes after verifying both retained runtime blobs", async () => {
  const { directory } = await fixture();
  let imported = 0;
  try {
    assert.equal(await loadServerHarness(directory, source, async (url) => {
      imported++; assert.ok(url.endsWith("/request-cancellation.mjs")); return module;
    }), module);
    assert.equal(imported, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

for (const mode of ["source", "repository", "missing-binding", "missing-file", "tampered-file", "wrong-blob", "symlink"]) {
  test(`missing or mismatched helper ${mode} refuses before importing executable code`, async () => {
    const { directory, binding } = await fixture();
    let imported = false;
    try {
      if (mode === "source") binding.sourceSha = "b".repeat(40);
      if (mode === "repository") binding.repository = "attacker/server";
      if (mode === "wrong-blob") binding.files[`tests/mcp-certification/${files[0]}`].gitBlob = "f".repeat(40);
      await writeFile(join(directory, "source-binding.json"), JSON.stringify(binding));
      if (mode === "missing-binding") await rm(join(directory, "source-binding.json"));
      if (mode === "missing-file") await rm(join(directory, files[1]));
      if (mode === "tampered-file") await writeFile(join(directory, files[1]), "throw new Error('unverified code');");
      if (mode === "symlink") {
        await rm(join(directory, files[1]));
        await symlink(join(directory, files[0]), join(directory, files[1]));
      }
      await assert.rejects(loadServerHarness(directory, source, async () => { imported = true; return module; }));
      assert.equal(imported, false);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
}

test("wrong helper interface cannot be treated as a complete scenario", async () => {
  const { directory } = await fixture();
  try {
    await assert.rejects(loadServerHarness(directory, source, async () => ({ ...module, CANCELLATION_HARNESS_CONTRACT: "unknown" })));
    await assert.rejects(loadServerHarness(directory, source, async () => ({ ...module, requestCancellation: undefined })));
    const validator = await readFile(new URL("../cancellation-proof.mjs", import.meta.url), "utf8");
    assert.equal(/\bimport\b|child_process/.test(validator), false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
