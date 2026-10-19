// Thin protected-source consumer; all scenario/setup/state/oracle code is release-owned.
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifiedFixtureSource } from "./render-validation.mjs";

const names = ["fixture.v1.json", "mcp_candidate_wire.mjs", "mcp_execute_plan_state.py", "mcp_execute_plan_validation.mjs", "mcp_execute_plan_validation.py",
  "mcp_fixed_client_launcher.mjs", "mcp_fixed_client_manifest.v1.json", "mcp_fixed_sdk_runner.mjs", "mcp_ingest_publish_state.py",
  "mcp_ingest_publish_validation.mjs", "mcp_ingest_publish_validation.py", "mcp_map_package_validation.mjs", "mcp_map_package_validation.py",
  "mcp_plan_validation.py", "mcp_render_bootstrap.py", "mcp_render_validation.mjs", "mcp_render_validation.py", "mcp_style_state.py",
  "mcp_style_validation.mjs", "mcp_style_validation.py", "oracles.py", "regression.py", "render_png.py",
  "mcp_publish_result_validation.mjs", "mcp_publish_result_validation.py", "mcp_publish_result_state.py", "mcp_publish_result_setup.py"];
const initial = verifiedFixtureSource();
const owned = await import(pathToFileURL(join(initial.directory, "mcp_publish_result_validation.mjs")).href);
function context() {
  const source = verifiedFixtureSource();
  return { ...source, sha256: Object.fromEntries(names.map(name => [name, source.pins.sha256[`certification/installed-clients/${name}`]])) };
}
export function publishResultScenarios(record, canonicalClient, clientVersion, results) {
  return owned.createPublishResultValidation(context()).publishResultScenarios(record, {
    candidateSourceSha: process.env.HONUA_MCP_SERVER_SOURCE_SHA, candidateImage: process.env.HONUA_MCP_SERVER_IMAGE,
    canonicalClient, clientVersion, installationRoot: fileURLToPath(new URL("./node_modules/", import.meta.url)),
    credential: process.env.HONUA_MCP_API_KEY, ownedDisposableCandidate: process.env.HONUA_MCP_OWNED_DISPOSABLE_CANDIDATE === "1", results,
  });
}
export function verifyPublishResultProof(proof, candidateSourceSha, candidateImageDigest, operation, canonicalClient, clientVersion) {
  try {
    const candidateImage = proof?.candidateImage;
    if (typeof candidateImage !== "string" || candidateImage.split("@").at(-1) !== candidateImageDigest) return false;
    return owned.createPublishResultValidation(context()).verifyPublishResultProof(proof, candidateSourceSha, candidateImage, operation, canonicalClient, clientVersion);
  } catch { return false; }
}
