// Thin protected-source bridge; the direct-cancel scenarios and oracle are release-owned.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const names = ["mcp_direct_cancel_validation.mjs", "mcp_direct_cancel_validation.py", "mcp_direct_cancel_state.py", "mcp_direct_cancel_config.py", "mcp_deployment_identity_configuration.py", "mcp_managed_identity_fixture.py", "mcp_execute_plan_state.py", "mcp_execute_plan_validation.py", "mcp_plan_validation.py", "mcp_style_validation.py", "mcp_style_state.py", "mcp_ingest_publish_validation.py", "mcp_ingest_publish_state.py", "mcp_map_package_validation.py", "mcp_render_validation.py", "render_png.py", "fixture.v1.json", "mcp_candidate_wire.mjs", "mcp_fixed_client_launcher.mjs", "mcp_fixed_sdk_runner.mjs", "mcp_fixed_client_manifest.v1.json"];
const prefix = "certification/installed-clients/";
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

export function verifiedDirectCancelSource() {
  const pins = JSON.parse(readFileSync(new URL("./direct-cancel-validation-pins.json", import.meta.url)));
  const directory = fileURLToPath(new URL("./.direct-cancel-validation/", import.meta.url));
  const binding = JSON.parse(readFileSync(join(directory, "source-binding.json")));
  const paths = names.map(name => prefix + name);
  if (pins.repository !== "honua-io/honua-release" || !/^[a-f0-9]{40}$/.test(pins.sourceSha ?? "")
      || binding.schema !== "honua.mcp-direct-cancel-source/v1" || binding.repository !== pins.repository || binding.sourceSha !== pins.sourceSha
      || Object.keys(pins.sha256 ?? {}).toSorted().join() !== paths.toSorted().join()
      || Object.keys(binding.files ?? {}).toSorted().join() !== paths.toSorted().join()
      || readdirSync(directory).toSorted().join() !== [...names, "source-binding.json"].toSorted().join()) {
    throw new Error("direct-cancel source lacks exact protected complete binding");
  }
  for (const path of paths) {
    const bytes = readFileSync(join(directory, path.split("/").at(-1)));
    const blob = createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest("hex");
    if (!/^[a-f0-9]{64}$/.test(pins.sha256[path] ?? "") || digest(bytes) !== pins.sha256[path]
        || binding.files[path]?.sha256 !== pins.sha256[path] || binding.files[path]?.gitBlob !== blob) {
      throw new Error("direct-cancel source bytes or Git blob differ from reviewed pins");
    }
  }
  return { directory, sourceSha: pins.sourceSha,
    sha256: Object.fromEntries(names.slice(1).map(name => [name, pins.sha256[prefix + name]])),
    bootstrapPath: process.env.HONUA_MCP_RENDER_BOOTSTRAP ?? fileURLToPath(new URL("./artifacts/render-bootstrap.json", import.meta.url)) };
}

const initial = verifiedDirectCancelSource();
const owned = await import(pathToFileURL(join(initial.directory, "mcp_direct_cancel_validation.mjs")).href);

export function directCancelScenarios(record, canonicalClient, clientVersion, results) {
  return owned.createDirectCancelValidation(verifiedDirectCancelSource()).directCancelScenarios(record, {
    candidateSourceSha: process.env.HONUA_MCP_SERVER_SOURCE_SHA, candidateImage: process.env.HONUA_MCP_SERVER_IMAGE,
    canonicalClient, clientVersion, installationRoot: fileURLToPath(new URL("./node_modules/", import.meta.url)),
    credential: process.env.HONUA_MCP_API_KEY,
    ownedDisposableCandidate: process.env.HONUA_MCP_OWNED_DISPOSABLE_CANDIDATE === "1", results,
  });
}

export function verifyDirectCancelProof(proof, sourceSha, imageDigest, operation, canonicalClient, clientVersion) {
  try {
    if (typeof proof?.candidateImage !== "string" || proof.candidateImage.split("@").at(-1) !== imageDigest) return false;
    return owned.createDirectCancelValidation(verifiedDirectCancelSource()).verifyDirectCancelProof(proof, sourceSha,
      proof.candidateImage, operation, canonicalClient, clientVersion);
  } catch { return false; }
}
