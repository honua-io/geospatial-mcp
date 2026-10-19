// Thin protected-source bridge; the location scenarios and oracle are release-owned.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const names = ["mcp_location_validation.mjs", "mcp_location_validation.py", "mcp_map_package_validation.py",
  "mcp_render_validation.py", "render_png.py", "fixture.v1.json", "mcp_candidate_wire.mjs",
  "mcp_fixed_client_launcher.mjs", "mcp_fixed_sdk_runner.mjs", "mcp_fixed_client_manifest.v1.json"];
const prefix = "certification/installed-clients/";
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

export function verifiedLocationSource() {
  const pins = JSON.parse(readFileSync(new URL("./location-validation-pins.json", import.meta.url)));
  const directory = fileURLToPath(new URL("./.location-validation/", import.meta.url));
  const binding = JSON.parse(readFileSync(join(directory, "source-binding.json")));
  const paths = names.map(name => prefix + name);
  if (pins.repository !== "honua-io/honua-release" || !/^[a-f0-9]{40}$/.test(pins.sourceSha ?? "")
      || binding.schema !== "honua.mcp-location-source/v1" || binding.repository !== pins.repository || binding.sourceSha !== pins.sourceSha
      || Object.keys(pins.sha256 ?? {}).toSorted().join() !== paths.toSorted().join()
      || Object.keys(binding.files ?? {}).toSorted().join() !== paths.toSorted().join()
      || readdirSync(directory).toSorted().join() !== [...names, "source-binding.json"].toSorted().join()) {
    throw new Error("location source lacks exact protected complete binding");
  }
  for (const path of paths) {
    const bytes = readFileSync(join(directory, path.split("/").at(-1)));
    const blob = createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest("hex");
    if (!/^[a-f0-9]{64}$/.test(pins.sha256[path] ?? "") || digest(bytes) !== pins.sha256[path]
        || binding.files[path]?.sha256 !== pins.sha256[path] || binding.files[path]?.gitBlob !== blob) {
      throw new Error("location source bytes or Git blob differ from reviewed pins");
    }
  }
  return { directory, sourceSha: pins.sourceSha,
    sha256: Object.fromEntries(names.slice(1).map(name => [name, pins.sha256[prefix + name]])),
    bootstrapPath: process.env.HONUA_MCP_RENDER_BOOTSTRAP ?? fileURLToPath(new URL("./artifacts/render-bootstrap.json", import.meta.url)) };
}

const initial = verifiedLocationSource();
const owned = await import(pathToFileURL(join(initial.directory, "mcp_location_validation.mjs")).href);

export function locationScenarios(record, canonicalClient, clientVersion, results) {
  return owned.createLocationValidation(verifiedLocationSource()).locationScenarios(record, {
    candidateSourceSha: process.env.HONUA_MCP_SERVER_SOURCE_SHA, candidateImage: process.env.HONUA_MCP_SERVER_IMAGE,
    canonicalClient, clientVersion, installationRoot: fileURLToPath(new URL("./node_modules/", import.meta.url)),
    credential: process.env.HONUA_MCP_API_KEY, results,
  });
}

export function verifyLocationProof(proof, sourceSha, imageDigest, operation, canonicalClient, clientVersion) {
  try {
    if (typeof proof?.candidateImage !== "string" || proof.candidateImage.split("@").at(-1) !== imageDigest) return false;
    return owned.createLocationValidation(verifiedLocationSource()).verifyLocationProof(proof, sourceSha,
      proof.candidateImage, operation, canonicalClient, clientVersion);
  } catch { return false; }
}
