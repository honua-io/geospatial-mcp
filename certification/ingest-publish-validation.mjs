// Thin protected-source consumption only; execution and judgment are release-owned.
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifiedFixtureSource } from "./render-validation.mjs";

const names = ["mcp_ingest_publish_validation.py", "mcp_ingest_publish_state.py", "mcp_map_package_validation.py",
  "mcp_render_validation.py", "render_png.py", "fixture.v1.json", "mcp_candidate_wire.mjs", "mcp_fixed_client_launcher.mjs",
  "mcp_fixed_sdk_runner.mjs", "mcp_fixed_client_manifest.v1.json"];
const initial = verifiedFixtureSource();
const owned = await import(pathToFileURL(join(initial.directory, "mcp_ingest_publish_validation.mjs")).href);
function context() {
  const source = verifiedFixtureSource();
  return { ...source, sha256: Object.fromEntries(names.map(name => [name, source.pins.sha256[`certification/installed-clients/${name}`]])) };
}
export function ingestPublishScenarios(record, canonicalClient, clientVersion, results) {
  return owned.createIngestPublishValidation(context()).ingestPublishScenarios(record, {
    candidateSourceSha: process.env.HONUA_MCP_SERVER_SOURCE_SHA, candidateImage: process.env.HONUA_MCP_SERVER_IMAGE,
    canonicalClient, clientVersion, installationRoot: fileURLToPath(new URL("./node_modules/", import.meta.url)),
    credential: process.env.HONUA_MCP_API_KEY, ownedDisposableCandidate: process.env.HONUA_MCP_OWNED_DISPOSABLE_CANDIDATE === "1", results,
  });
}
export function verifyIngestPublishProof(proof, candidateSourceSha, candidateImageDigest, operation, canonicalClient, clientVersion) {
  try {
    const candidateImage = proof?.candidateImage;
    if (typeof candidateImage !== "string" || candidateImage.split("@").at(-1) !== candidateImageDigest) return false;
    return owned.createIngestPublishValidation(context()).verifyIngestPublishProof(proof, candidateSourceSha, candidateImage, operation, canonicalClient, clientVersion);
  } catch { return false; }
}
