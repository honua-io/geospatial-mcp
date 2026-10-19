// Verified bridge; executable render scenario/bootstrap/oracles are release-owned.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const names = ["mcp_render_bootstrap.py", "regression.py", "oracles.py", "mcp_plan_validation.py", "render_png.py",
  "fixture.v1.json", "mcp_render_validation.py", "mcp_render_validation.mjs",
  "mcp_map_package_validation.py", "mcp_map_package_validation.mjs", "mcp_candidate_wire.mjs",
  "mcp_fixed_client_launcher.mjs", "mcp_fixed_sdk_runner.mjs", "mcp_fixed_client_manifest.v1.json",
    "mcp_ingest_publish_validation.py", "mcp_ingest_publish_state.py", "mcp_ingest_publish_validation.mjs"];
const setupNames = names.slice(0, 7);
const runtimeNames = ["mcp_render_validation.py", "render_png.py", "fixture.v1.json"];
const prefix = "certification/installed-clients/";
const paths = names.map((name) => prefix + name);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function verifiedFixtureSource() {
  const pins = JSON.parse(readFileSync(new URL("./render-validation-pins.json", import.meta.url), "utf8"));
  const directory = fileURLToPath(new URL("./.render-validation/", import.meta.url));
  let binding;
  try { binding = JSON.parse(readFileSync(join(directory, "source-binding.json"), "utf8")); }
  catch (cause) { throw new Error("shared render source missing; run npm run prepare:render before npm test (authenticated gh required)", { cause }); }
  if (pins.repository !== "honua-io/honua-release" || typeof pins.sourceSha !== "string" || !/^[a-f0-9]{40}$/.test(pins.sourceSha)
      || binding.schema !== "honua.mcp-render-source/v1" || binding.repository !== pins.repository || binding.sourceSha !== pins.sourceSha
      || Object.keys(pins.sha256 ?? {}).toSorted().join() !== paths.toSorted().join()
      || Object.keys(binding.files ?? {}).toSorted().join() !== paths.toSorted().join()
      || readdirSync(directory).toSorted().join() !== [...names, "source-binding.json"].toSorted().join()) throw new Error("shared render source lacks exact reviewed binding");
  for (const path of paths) {
    const expected = pins.sha256[path];
    if (typeof expected !== "string" || !/^[a-f0-9]{64}$/.test(expected)
        || digest(readFileSync(join(directory, path.split("/").at(-1)))) !== expected
        || binding.files[path]?.sha256 !== expected) throw new Error("shared render dependency bytes differ from reviewed pins");
  }
  return { directory, sourceSha: pins.sourceSha, pins,
    bootstrapPath: process.env.HONUA_MCP_RENDER_BOOTSTRAP ?? fileURLToPath(new URL("./artifacts/render-bootstrap.json", import.meta.url)) };
}

const verified = verifiedFixtureSource();
const owned = await import(pathToFileURL(join(verified.directory, "mcp_render_validation.mjs")).href);
const select = (context, selected) => ({ ...context, sha256: Object.fromEntries(selected.map((name) => [name, context.pins.sha256[prefix + name]])) });

export function bootstrapRender() {
  const context = verifiedFixtureSource();
  return owned.createRenderBootstrap(select(context, setupNames))({
    candidateSourceSha: process.env.HONUA_MCP_SERVER_SOURCE_SHA, candidateImage: process.env.HONUA_MCP_SERVER_IMAGE,
    receipt: context.bootstrapPath,
  });
}

export async function renderScenarios(call, record) {
  const verifiedCall = (...args) => { verifiedFixtureSource(); return call(...args); };
  return owned.createRenderValidation(select(verifiedFixtureSource(), runtimeNames)).renderScenarios(verifiedCall, record, {
    candidateSourceSha: process.env.HONUA_MCP_SERVER_SOURCE_SHA, candidateImage: process.env.HONUA_MCP_SERVER_IMAGE,
    results: process.env.CERT_RESULTS ?? "results.json",
  });
}

export function verifyRenderProof(proof, candidateSourceSha, candidateImageDigest) {
  try {
    const candidateImage = proof?.candidateImage;
    if (typeof candidateImage !== "string" || candidateImage.split("@").at(-1) !== candidateImageDigest) return false;
    return owned.createRenderValidation(select(verifiedFixtureSource(), runtimeNames)).verifyRenderProof(proof, candidateSourceSha, candidateImage);
  } catch { return false; }
}
