// Verified consumption only: execution/observation/oracles remain release-owned.
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { verifiedFixtureSource } from "./render-validation.mjs";

const names = ["mcp_map_package_validation.py", "mcp_render_validation.py", "render_png.py", "fixture.v1.json", "mcp_candidate_wire.mjs"];
const initial = verifiedFixtureSource();
const owned = await import(pathToFileURL(join(initial.directory, "mcp_map_package_validation.mjs")).href);
const context = () => {
  const source = verifiedFixtureSource();
  return { ...source, sha256: Object.fromEntries(names.map((name) => [name, source.pins.sha256[`certification/installed-clients/${name}`]])) };
};

export function mapPackageScenarios(call, readFresh, record, canonicalClient, clientVersion) {
  return owned.createMapPackageValidation(context()).mapPackageScenarios(call, readFresh, record, {
    candidateSourceSha: process.env.HONUA_MCP_SERVER_SOURCE_SHA, candidateImage: process.env.HONUA_MCP_SERVER_IMAGE,
    canonicalClient, clientVersion, credential: process.env.HONUA_MCP_API_KEY,
    results: process.env.CERT_RESULTS ?? "results.json",
  });
}

export function verifyMapPackageProof(proof, candidateSourceSha, candidateImageDigest, operation, canonicalClient, clientVersion) {
  try {
    const candidateImage = proof?.candidateImage;
    if (typeof candidateImage !== "string" || candidateImage.split("@").at(-1) !== candidateImageDigest) return false;
    return owned.createMapPackageValidation(context()).verifyMapPackageProof(proof, candidateSourceSha, candidateImage,
      operation, canonicalClient, clientVersion);
  } catch { return false; }
}
