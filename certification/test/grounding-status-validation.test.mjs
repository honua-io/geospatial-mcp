import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { copyFileSync, readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { verifiedGroundingStatusSource } from "../grounding-status-validation.mjs";

const vector = JSON.parse(readFileSync(new URL("./fixtures/offline-grounding-status-oracle-vector.json", import.meta.url)));
const pins = JSON.parse(readFileSync(new URL("../grounding-status-validation-pins.json", import.meta.url)));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const blob = bytes => createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest("hex");
const operations = ["tools/call:ground_candidates", "tools/call:clarify_intent", "tools/call:platform_release_status"];

async function isolated(selector = "sdk") {
  const source = verifiedGroundingStatusSource();
  const directory = mkdtempSync(join(tmpdir(), "mcp-grounding-bridge-"));
  const bundle = join(directory, ".grounding-status-validation"); mkdirSync(bundle);
  copyFileSync(new URL("../grounding-status-validation.mjs", import.meta.url), join(directory, "grounding-status-validation.mjs"));
  copyFileSync(new URL("../grounding-status-validation-pins.json", import.meta.url), join(directory, "grounding-status-validation-pins.json"));
  for (const path of Object.keys(pins.sha256)) copyFileSync(join(source.directory, path.split("/").at(-1)), join(bundle, path.split("/").at(-1)));
  copyFileSync(join(source.directory, "source-binding.json"), join(bundle, "source-binding.json"));
  const original = vector[selector], manifest = Buffer.from(original.manifestBase64, "base64");
  const bindings = {
    HONUA_MCP_RENDER_BOOTSTRAP: ["original-bootstrap.json", Buffer.from(original.bootstrapBase64, "base64")],
    HONUA_MCP_OPS_MANIFEST: ["original-manifest.yaml", manifest],
    HONUA_MCP_OPS_MANIFEST_BINDING: ["original-manifest-binding.json", JSON.stringify({
      schema: "honua.mcp-ops-events-manifest/v1", repository: "honua-io/honua-release",
      sourceSha: original.manifestSourceSha, path: "platform-manifest.yaml",
      sha256: hash(manifest), gitBlob: blob(manifest),
    })],
    HONUA_MCP_OPS_GOVERNANCE_BINDING: ["original-governance-binding.json", JSON.stringify({
      repository: "honua-io/honua-release", sourceSha: original.manifestSourceSha,
    })],
  };
  const before = Object.fromEntries(Object.keys(bindings).map(name => [name, process.env[name]]));
  for (const [name, [file, bytes]] of Object.entries(bindings)) {
    process.env[name] = join(directory, file); writeFileSync(process.env[name], bytes);
  }
  const bridge = await import(pathToFileURL(join(directory, "grounding-status-validation.mjs")).href);
  const proof = structuredClone(original.proof);
  const verify = operation => bridge.verifyGroundingStatusProof(proof, proof.candidateSourceSha,
    proof.candidateImage.split("@").at(-1), operation, proof.canonicalClient, proof.clientVersion);
  return { directory, bundle, bridge, proof, verify, close() {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    rmSync(directory, { recursive: true, force: true });
  } };
}

test("both complete synthetic client vectors rejudge each of three protected operations", async () => {
  for (const selector of ["sdk", "inspector"]) {
    const control = await isolated(selector);
    try {
      for (const operation of operations) assert.equal(control.verify(operation), true, `${selector} ${operation}`);
      assert.equal(control.verify("tools/call:plan_analysis"), false);
      assert.equal(control.proof.declaredStatusOnly, true);
      assert.equal(Object.hasOwn(control.proof, "modelProven"), false);
      assert.equal(Object.hasOwn(control.proof, "deployedHealthProven"), false);
    } finally { control.close(); }
  }
});

for (const path of Object.keys(pins.sha256)) test(`grounding bridge refuses altered protected dependency ${path}`, async () => {
  const control = await isolated();
  try {
    assert.equal(control.verify(operations[0]), true);
    writeFileSync(join(control.bundle, path.split("/").at(-1)), "unreviewed changed bytes");
    assert.equal(control.verify(operations[0]), false);
    assert.throws(() => control.bridge.verifiedGroundingStatusSource(), /bytes or Git blob differ/);
  } finally { control.close(); }
});

test("grounding bridge requires protected source, original manifest and coherent caller proof", async () => {
  assert.equal(Object.keys(pins.sha256).length, 20);
  const control = await isolated();
  try {
    assert.equal(control.verify(operations[0]), true);
    control.proof.observations.calls[3].wire.expectedCredentialFingerprint = "scrypt:" + "a".repeat(32) + ":" + "f".repeat(64);
    assert.equal(control.verify(operations[0]), false);
  } finally { control.close(); }
  const manifestControl = await isolated();
  try {
    assert.equal(manifestControl.verify(operations[0]), true);
    writeFileSync(process.env.HONUA_MCP_OPS_MANIFEST, "unreviewed manifest bytes");
    assert.equal(manifestControl.verify(operations[0]), false);
  } finally { manifestControl.close(); }
  const bindingControl = await isolated();
  try {
    const path = join(bindingControl.bundle, "source-binding.json");
    const binding = JSON.parse(readFileSync(path));
    binding.files[Object.keys(binding.files)[0]].gitBlob = "0".repeat(40);
    writeFileSync(path, JSON.stringify(binding));
    assert.equal(bindingControl.verify(operations[0]), false);
  } finally { bindingControl.close(); }
  const governanceControl = await isolated();
  try {
    writeFileSync(process.env.HONUA_MCP_OPS_GOVERNANCE_BINDING, JSON.stringify({
      repository: "honua-io/honua-release", sourceSha: "f".repeat(40),
    }));
    assert.equal(governanceControl.verify(operations[0]), false);
  } finally { governanceControl.close(); }
});
