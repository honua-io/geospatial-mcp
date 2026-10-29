import assert from "node:assert/strict";
import test from "node:test";
import { copyFileSync, readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { verifiedPlanningSource } from "../planning-validation.mjs";

const vector = JSON.parse(readFileSync(new URL("./fixtures/offline-planning-oracle-vector.json", import.meta.url)));
const pins = JSON.parse(readFileSync(new URL("../planning-validation-pins.json", import.meta.url)));

async function isolated() {
  const source = verifiedPlanningSource(), directory = mkdtempSync(join(tmpdir(), "mcp-planning-bridge-"));
  const bundle = join(directory, ".planning-validation"); mkdirSync(bundle);
  copyFileSync(new URL("../planning-validation.mjs", import.meta.url), join(directory, "planning-validation.mjs"));
  copyFileSync(new URL("../planning-validation-pins.json", import.meta.url), join(directory, "planning-validation-pins.json"));
  for (const path of Object.keys(pins.sha256)) copyFileSync(join(source.directory, path.split("/").at(-1)), join(bundle, path.split("/").at(-1)));
  copyFileSync(join(source.directory, "source-binding.json"), join(bundle, "source-binding.json"));
  const before = process.env.HONUA_MCP_RENDER_BOOTSTRAP;
  process.env.HONUA_MCP_RENDER_BOOTSTRAP = join(directory, "original-bootstrap.json");
  writeFileSync(process.env.HONUA_MCP_RENDER_BOOTSTRAP, Buffer.from(vector.bootstrapBase64, "base64"));
  const bridge = await import(pathToFileURL(join(directory, "planning-validation.mjs")).href);
  const proof = vector.proof;
  const verify = () => bridge.verifyPlanningProof(proof, proof.candidateSourceSha, proof.candidateImage.split("@").at(-1),
    "tools/call:plan_analysis", proof.canonicalClient, proof.clientVersion);
  return { directory, bundle, bridge, verify, close() {
    if (before === undefined) delete process.env.HONUA_MCP_RENDER_BOOTSTRAP; else process.env.HONUA_MCP_RENDER_BOOTSTRAP = before;
    rmSync(directory, { recursive: true, force: true });
  } };
}

for (const path of Object.keys(pins.sha256)) test(`planning bridge rejects altered protected dependency ${path}`, async () => {
  const control = await isolated();
  try {
    assert.equal(control.verify(), true);
    writeFileSync(join(control.bundle, path.split("/").at(-1)), "unreviewed changed bytes");
    assert.equal(control.verify(), false);
    assert.throws(() => control.bridge.verifiedPlanningSource(), /bytes or Git blob differ/);
  } finally { control.close(); }
});

test("planning bridge requires exact source/Git blob/directory binding and preserves legacy identities", async () => {
  assert.equal(Object.keys(pins.sha256).length, 19);
  const legacy = JSON.parse(readFileSync(new URL("../render-validation-pins.json", import.meta.url)));
  const historicalPins = JSON.parse(readFileSync(new URL("../historical-render-validation-pins.json", import.meta.url)));
  const requirements = JSON.parse(readFileSync(new URL("../requirements-pins.json", import.meta.url)));
  const historical = JSON.parse(readFileSync(new URL("./fixtures/historical-execute-plan-39284007212.json", import.meta.url)));
  assert.equal(historical.proof.helperSourceSha, historicalPins.sourceSha);
  assert.equal(legacy.sourceSha, requirements.sourceSha);
  const control = await isolated();
  try {
    assert.equal(control.verify(), true);
    const path = join(control.bundle, "source-binding.json"), binding = JSON.parse(readFileSync(path));
    binding.files[Object.keys(binding.files)[0]].gitBlob = "0".repeat(40); writeFileSync(path, JSON.stringify(binding));
    assert.equal(control.verify(), false);
  } finally { control.close(); }
});
