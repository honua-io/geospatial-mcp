// Thin protected-source consumer; all scenario/setup/state/oracle code is release-owned.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { historicalFixtureSource, verifiedFixtureSource } from "./render-validation.mjs";

const names = ["mcp_execute_plan_validation.py", "mcp_execute_plan_state.py", "mcp_plan_validation.py", "mcp_style_validation.py", "mcp_style_state.py", "mcp_ingest_publish_validation.py", "mcp_map_package_validation.py",
  "mcp_render_validation.py", "render_png.py", "fixture.v1.json", "mcp_candidate_wire.mjs", "mcp_fixed_client_launcher.mjs",
  "mcp_fixed_sdk_runner.mjs", "mcp_fixed_client_manifest.v1.json"];
const prefix = "certification/installed-clients/";
const initial = verifiedFixtureSource();
const owned = await import(pathToFileURL(join(initial.directory, "mcp_execute_plan_validation.mjs")).href);
const historicalInitial = historicalFixtureSource();
const historicalOwned = await import(pathToFileURL(join(historicalInitial.directory, "mcp_execute_plan_validation.mjs")).href);
const retainedExecute = JSON.parse(readFileSync(new URL("./test/fixtures/historical-execute-plan-39284007212.json", import.meta.url)));
if (historicalInitial.sourceSha !== retainedExecute.proof.helperSourceSha) {
  throw new Error("historical render pins drifted from the retained execute proof");
}
function context(source) {
  return { ...source, sha256: Object.fromEntries(names.map(name => [name, source.pins.sha256[`${prefix}${name}`]])) };
}
export function executePlanScenarios(record, canonicalClient, clientVersion, results) {
  return owned.createExecutePlanValidation(context(verifiedFixtureSource())).executePlanScenarios(record, {
    candidateSourceSha: process.env.HONUA_MCP_SERVER_SOURCE_SHA, candidateImage: process.env.HONUA_MCP_SERVER_IMAGE,
    canonicalClient, clientVersion, installationRoot: fileURLToPath(new URL("./node_modules/", import.meta.url)),
    credential: process.env.HONUA_MCP_API_KEY, ownedDisposableCandidate: process.env.HONUA_MCP_OWNED_DISPOSABLE_CANDIDATE === "1", results,
  });
}
export function verifyExecutePlanProof(proof, candidateSourceSha, candidateImageDigest, operation, canonicalClient, clientVersion) {
  try {
    const candidateImage = proof?.candidateImage;
    if (typeof candidateImage !== "string" || candidateImage.split("@").at(-1) !== candidateImageDigest) return false;
    // Retained run 39284007212 is bound to helper 4194df43 and its fixture hash.
    // Only that historical candidate may rejudge on the frozen helper. A current
    // candidate always uses the live pin, whose fixture matches the other journeys.
    const historicalCandidate = candidateSourceSha === retainedExecute.identity.sourceSha
      && proof?.candidateSourceSha === retainedExecute.identity.sourceSha
      && proof?.helperSourceSha === retainedExecute.proof.helperSourceSha;
    const selected = historicalCandidate ? historicalOwned : owned;
    const source = historicalCandidate ? historicalFixtureSource() : verifiedFixtureSource();
    return selected.createExecutePlanValidation(context(source)).verifyExecutePlanProof(proof, candidateSourceSha, candidateImage, operation, canonicalClient, clientVersion);
  } catch { return false; }
}
