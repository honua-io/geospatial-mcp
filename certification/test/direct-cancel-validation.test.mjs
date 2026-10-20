import assert from "node:assert/strict";
import test from "node:test";
import { copyFileSync, readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { verifiedDirectCancelSource } from "../direct-cancel-validation.mjs";

const vector = JSON.parse(readFileSync(new URL("./fixtures/offline-direct-cancel-oracle-vector.json", import.meta.url)));
const pins = JSON.parse(readFileSync(new URL("../direct-cancel-validation-pins.json", import.meta.url)));

async function isolated() {
  const source = verifiedDirectCancelSource(), directory = mkdtempSync(join(tmpdir(), "mcp-direct-cancel-bridge-"));
  const bundle = join(directory, ".direct-cancel-validation"); mkdirSync(bundle);
  copyFileSync(new URL("../direct-cancel-validation.mjs", import.meta.url), join(directory, "direct-cancel-validation.mjs"));
  copyFileSync(new URL("../direct-cancel-validation-pins.json", import.meta.url), join(directory, "direct-cancel-validation-pins.json"));
  for (const path of Object.keys(pins.sha256)) copyFileSync(join(source.directory, path.split("/").at(-1)), join(bundle, path.split("/").at(-1)));
  copyFileSync(join(source.directory, "source-binding.json"), join(bundle, "source-binding.json"));
  const before = process.env.HONUA_MCP_RENDER_BOOTSTRAP;
  process.env.HONUA_MCP_RENDER_BOOTSTRAP = join(directory, "original-bootstrap.json");
  writeFileSync(process.env.HONUA_MCP_RENDER_BOOTSTRAP, Buffer.from(vector.bootstrapBase64, "base64"));
  const bridge = await import(pathToFileURL(join(directory, "direct-cancel-validation.mjs")).href);
  const proof = vector.proof;
  const verify = () => bridge.verifyDirectCancelProof(proof, proof.candidateSourceSha, proof.candidateImage.split("@").at(-1),
    "tools/call:cancel_job", proof.canonicalClient, proof.clientVersion);
  return { directory, bundle, bridge, verify, close() {
    if (before === undefined) delete process.env.HONUA_MCP_RENDER_BOOTSTRAP; else process.env.HONUA_MCP_RENDER_BOOTSTRAP = before;
    rmSync(directory, { recursive: true, force: true });
  } };
}

for (const path of Object.keys(pins.sha256)) test(`direct-cancel bridge rejects altered protected dependency ${path}`, async () => {
  const control = await isolated();
  try {
    assert.equal(control.verify(), true);
    writeFileSync(join(control.bundle, path.split("/").at(-1)), "unreviewed changed bytes");
    assert.equal(control.verify(), false);
    assert.throws(() => control.bridge.verifiedDirectCancelSource(), /bytes or Git blob differ/);
  } finally { control.close(); }
});

test("direct-cancel bridge requires exact source/Git blob/directory binding and preserves legacy identities", async () => {
  assert.equal(Object.keys(pins.sha256).length, 21);
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


test("direct cancellation stays before restarts and retains failures and original raw evidence", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/protocol-certification.yml", import.meta.url), "utf8");
  const sourceControls = readFileSync(new URL("../../.github/workflows/mcp-producer-source-controls.yml", import.meta.url), "utf8");
  const runner = readFileSync(new URL("../run-direct-cancel.mjs", import.meta.url), "utf8");
  assert.ok(workflow.indexOf("run: node run-direct-cancel.mjs") < workflow.indexOf("run: node run-ingest-publish.mjs"));
  for (const body of [workflow, sourceControls]) {
    assert.ok(body.includes("npm run prepare:direct-cancel"));
    assert.ok(body.includes("python3 generate-offline-direct-cancel-vector.py"));
    assert.ok(body.includes("certification/.direct-cancel-validation/source-binding.json"));
    assert.ok(body.includes("certification/direct-cancel-validation-pins.json"));
  }
  assert.ok(workflow.includes('steps.direct-cancel.outcome }}" == "failure"'));
  assert.ok(workflow.includes("certification/artifacts/*.direct-cancel.raw.json"));
  for (const expected of ['["sdk", "Official MCP TypeScript SDK"', '["inspector", "MCP Inspector"',
    'await readFile(results, "utf8")', 'name.split("/")', 'result: "fail"', 'await writeFile(results', 'if (failed) process.exitCode = 1'])
    assert.ok(runner.includes(expected), expected);
});
