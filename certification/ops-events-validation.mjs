// Thin protected-source bridge; the ops-events scenarios and oracle are release-owned.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";

const names = ["mcp_ops_events_validation.mjs", "mcp_ops_events_validation.py", "mcp_ops_events_data_read.py", "mcp_ops_events_state.py", "mcp_ops_events_config.py", "mcp_ops_events_setup.py", "mcp_managed_identity_fixture.py", "mcp_execute_plan_state.py", "mcp_execute_plan_validation.py", "mcp_plan_validation.py", "mcp_style_validation.py", "mcp_ingest_publish_validation.py", "mcp_map_package_validation.py", "mcp_render_validation.py", "render_png.py", "mcp_style_state.py", "mcp_ingest_publish_state.py", "fixture.v1.json", "mcp_candidate_wire.mjs", "mcp_fixed_client_launcher.mjs", "mcp_fixed_sdk_runner.mjs", "mcp_fixed_client_manifest.v1.json"];
const prefix = "certification/installed-clients/";
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

export function verifiedOpsEventsSource() {
  const pins = JSON.parse(readFileSync(new URL("./ops-events-validation-pins.json", import.meta.url)));
  const directory = fileURLToPath(new URL("./.ops-events-validation/", import.meta.url));
  const binding = JSON.parse(readFileSync(join(directory, "source-binding.json")));
  const paths = names.map(name => prefix + name);
  if (pins.repository !== "honua-io/honua-release" || !/^[a-f0-9]{40}$/.test(pins.sourceSha ?? "")
      || binding.schema !== "honua.mcp-ops-events-source/v1" || binding.repository !== pins.repository || binding.sourceSha !== pins.sourceSha
      || Object.keys(pins.sha256 ?? {}).toSorted().join() !== paths.toSorted().join()
      || Object.keys(binding.files ?? {}).toSorted().join() !== paths.toSorted().join()
      || readdirSync(directory).toSorted().join() !== [...names, "source-binding.json"].toSorted().join()) {
    throw new Error("ops-events source lacks exact protected complete binding");
  }
  for (const path of paths) {
    const bytes = readFileSync(join(directory, path.split("/").at(-1)));
    const blob = createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest("hex");
    if (!/^[a-f0-9]{64}$/.test(pins.sha256[path] ?? "") || digest(bytes) !== pins.sha256[path]
        || binding.files[path]?.sha256 !== pins.sha256[path] || binding.files[path]?.gitBlob !== blob) {
      throw new Error("ops-events source bytes or Git blob differ from reviewed pins");
    }
  }
  return { directory, sourceSha: pins.sourceSha,
    sha256: Object.fromEntries(names.slice(1).map(name => [name, pins.sha256[prefix + name]])),
    bootstrapPath: process.env.HONUA_MCP_RENDER_BOOTSTRAP ?? fileURLToPath(new URL("./artifacts/render-bootstrap.json", import.meta.url)),
    setupPath: process.env.HONUA_MCP_OPS_SETUP ?? fileURLToPath(new URL("./artifacts/ops-events-setup.json", import.meta.url)),
    ...verifiedOpsEventsManifest() };
}

export function verifiedOpsEventsManifest() {
  const platformManifestPath = process.env.HONUA_MCP_OPS_MANIFEST
    ?? fileURLToPath(new URL("./artifacts/ops-events-platform-manifest.yaml", import.meta.url));
  const bindingPath = process.env.HONUA_MCP_OPS_MANIFEST_BINDING
    ?? fileURLToPath(new URL("./artifacts/ops-events-manifest-binding.json", import.meta.url));
  const governanceBindingPath = process.env.HONUA_MCP_OPS_GOVERNANCE_BINDING
    ?? fileURLToPath(new URL("../.certification/source-binding.json", import.meta.url));
  const governanceBytes = readFileSync(governanceBindingPath);
  const governance = JSON.parse(governanceBytes);
  const binding = JSON.parse(readFileSync(bindingPath));
  const bytes = readFileSync(platformManifestPath);
  const blob = createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest("hex");
  if (Object.keys(binding).toSorted().join() !== ["schema", "repository", "sourceSha", "path", "sha256", "gitBlob"].toSorted().join()
      || binding.schema !== "honua.mcp-ops-events-manifest/v1" || binding.repository !== "honua-io/honua-release"
      || !/^[a-f0-9]{40}$/.test(binding.sourceSha ?? "") || binding.path !== "platform-manifest.yaml"
      || governance.repository !== binding.repository || governance.sourceSha !== binding.sourceSha
      || binding.gitBlob !== blob || !/^[a-f0-9]{64}$/.test(binding.sha256 ?? "") || binding.sha256 !== digest(bytes)) {
    throw new Error("findings/events original protected manifest bytes or binding differ");
  }
  return { platformManifestPath, platformManifestSha256: binding.sha256, manifestSourceSha: binding.sourceSha,
    governanceBindingSha256: digest(governanceBytes) };
}

const initial = verifiedOpsEventsSource();
const owned = await import(pathToFileURL(join(initial.directory, "mcp_ops_events_validation.mjs")).href);

function launchObserver(name, args) {
  const before = verifiedOpsEventsSource();
  const result = spawnSync("python3", ["-I", "-B", join(before.directory, name), ...args],
    { encoding: "utf8", timeout: 120_000, maxBuffer: 1024 * 1024 });
  const after = verifiedOpsEventsSource();
  if (!isDeepStrictEqual(before, after) || result.error || result.signal || result.status !== 0) {
    throw new Error("protected findings/events declaration or setup refused");
  }
  return result.stdout;
}

export function prepareOpsEventsConfiguration() {
  const context = verifiedOpsEventsSource();
  return JSON.parse(launchObserver("mcp_ops_events_config.py", ["--manifest", context.platformManifestPath,
    "--release-source-sha", context.manifestSourceSha,
    "--candidate-source-sha", process.env.HONUA_MCP_SERVER_SOURCE_SHA,
    "--candidate-image", process.env.HONUA_MCP_SERVER_IMAGE]));
}

export function provisionOpsEvents() {
  if (process.env.HONUA_MCP_OWNED_DISPOSABLE_CANDIDATE !== "1") throw new Error("owned candidate boundary missing");
  const context = verifiedOpsEventsSource();
  launchObserver("mcp_ops_events_setup.py", ["--candidate-source-sha", process.env.HONUA_MCP_SERVER_SOURCE_SHA,
    "--candidate-image", process.env.HONUA_MCP_SERVER_IMAGE,
    "--receipt", context.setupPath, "--owned-disposable-candidate"]);
  return context.setupPath;
}

export function opsEventsScenarios(record, canonicalClient, clientVersion, results) {
  return owned.createOpsEventsValidation(verifiedOpsEventsSource()).opsEventsScenarios(record, {
    candidateSourceSha: process.env.HONUA_MCP_SERVER_SOURCE_SHA, candidateImage: process.env.HONUA_MCP_SERVER_IMAGE,
    canonicalClient, clientVersion, installationRoot: fileURLToPath(new URL("./node_modules/", import.meta.url)),
    credential: process.env.HONUA_MCP_API_KEY,
    ownedDisposableCandidate: process.env.HONUA_MCP_OWNED_DISPOSABLE_CANDIDATE === "1", results,
  });
}

export function verifyOpsEventsProof(proof, sourceSha, imageDigest, operation, canonicalClient, clientVersion) {
  try {
    if (typeof proof?.candidateImage !== "string" || proof.candidateImage.split("@").at(-1) !== imageDigest) return false;
    return owned.createOpsEventsValidation(verifiedOpsEventsSource()).verifyOpsEventsProof(proof, sourceSha,
      proof.candidateImage, operation, canonicalClient, clientVersion);
  } catch { return false; }
}
