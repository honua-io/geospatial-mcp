import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { copyFileSync, readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { verifiedOpsEventsSource } from "../ops-events-validation.mjs";

const vector = JSON.parse(readFileSync(new URL("./fixtures/offline-ops-events-oracle-vector.json", import.meta.url)));
const pins = JSON.parse(readFileSync(new URL("../ops-events-validation-pins.json", import.meta.url)));

async function isolated() {
  const source = verifiedOpsEventsSource(), directory = mkdtempSync(join(tmpdir(), "mcp-ops-events-bridge-"));
  const bundle = join(directory, ".ops-events-validation"); mkdirSync(bundle);
  copyFileSync(new URL("../ops-events-validation.mjs", import.meta.url), join(directory, "ops-events-validation.mjs"));
  copyFileSync(new URL("../ops-events-validation-pins.json", import.meta.url), join(directory, "ops-events-validation-pins.json"));
  for (const path of Object.keys(pins.sha256)) copyFileSync(join(source.directory, path.split("/").at(-1)), join(bundle, path.split("/").at(-1)));
  copyFileSync(join(source.directory, "source-binding.json"), join(bundle, "source-binding.json"));
  const values = {
    HONUA_MCP_RENDER_BOOTSTRAP: ["original-bootstrap.json", Buffer.from(vector.bootstrapBase64, "base64")],
    HONUA_MCP_OPS_SETUP: ["original-setup.json", Buffer.from(vector.setupBase64, "base64")],
    HONUA_MCP_OPS_MANIFEST: ["original-manifest.yaml", Buffer.from(vector.manifestBase64, "base64")],
    HONUA_MCP_OPS_MANIFEST_BINDING: ["original-manifest-binding.json", JSON.stringify(vector.manifestBinding)],
    HONUA_MCP_OPS_GOVERNANCE_BINDING: ["original-governance-binding.json", JSON.stringify({ repository: vector.manifestBinding.repository, sourceSha: vector.manifestBinding.sourceSha })],
  };
  const before = Object.fromEntries(Object.keys(values).map(name => [name, process.env[name]]));
  for (const [name, [file, bytes]] of Object.entries(values)) {
    process.env[name] = join(directory, file); writeFileSync(process.env[name], bytes);
  }
  const bridge = await import(pathToFileURL(join(directory, "ops-events-validation.mjs")).href);
  const proof = vector.proof;
  const verify = () => bridge.verifyOpsEventsProof(proof, proof.candidateSourceSha, proof.candidateImage.split("@").at(-1),
    "tools/call:ops_findings", proof.canonicalClient, proof.clientVersion);
  return { directory, bundle, bridge, verify, close() {
    for (const [name, value] of Object.entries(before)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    rmSync(directory, { recursive: true, force: true });
  } };
}

for (const path of Object.keys(pins.sha256)) test(`ops-events bridge rejects altered protected dependency ${path}`, async () => {
  const control = await isolated();
  try {
    assert.equal(control.verify(), true);
    writeFileSync(join(control.bundle, path.split("/").at(-1)), "unreviewed changed bytes");
    assert.equal(control.verify(), false);
    assert.throws(() => control.bridge.verifiedOpsEventsSource(), /bytes or Git blob differ/);
  } finally { control.close(); }
});

test("ops-events bridge requires exact source/Git blob/directory binding and preserves legacy identities", async () => {
  assert.equal(Object.keys(pins.sha256).length, 22);
  const legacy = JSON.parse(readFileSync(new URL("../render-validation-pins.json", import.meta.url)));
  const historical = JSON.parse(readFileSync(new URL("./fixtures/historical-execute-plan-39284007212.json", import.meta.url)));
  assert.equal(legacy.sourceSha, historical.proof.helperSourceSha);
  const control = await isolated();
  try {
    assert.equal(control.verify(), true);
    const path = join(control.bundle, "source-binding.json"), binding = JSON.parse(readFileSync(path));
    binding.files[Object.keys(binding.files)[0]].gitBlob = "0".repeat(40); writeFileSync(path, JSON.stringify(binding));
    assert.equal(control.verify(), false);
  } finally { control.close(); }
});


test("manifest source must match original governance even when its adjacent binding is coherent", async () => {
  const control = await isolated();
  try {
    assert.equal(control.verify(), true);
    const path = process.env.HONUA_MCP_OPS_MANIFEST_BINDING;
    const binding = JSON.parse(readFileSync(path));
    const manifestPath = process.env.HONUA_MCP_OPS_MANIFEST;
    const bytes = Buffer.concat([readFileSync(manifestPath), Buffer.from("\n# changed explicit offline control\n")]);
    binding.sourceSha = "f".repeat(40);
    binding.sha256 = createHash("sha256").update(bytes).digest("hex");
    binding.gitBlob = createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest("hex");
    writeFileSync(manifestPath, bytes);
    writeFileSync(path, JSON.stringify(binding));
    assert.throws(() => control.bridge.verifiedOpsEventsManifest(), /protected manifest bytes or binding differ/);
    assert.equal(control.verify(), false);
  } finally { control.close(); }
});
