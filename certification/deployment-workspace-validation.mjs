// Thin protected-source bridge; the deployment-workspace scenarios and oracle are release-owned.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const names = ["mcp_deployment_workspace_cohort.mjs", "mcp_deployment_workspace_validation.py", "mcp_deployment_workspace_store_oracle.py", "mcp_deployment_workspace_state.py", "mcp_deployment_workspace_prerequisites.py", "mcp_execute_plan_state.py", "mcp_execute_plan_validation.py", "mcp_plan_validation.py", "mcp_style_validation.py", "mcp_ingest_publish_validation.py", "mcp_map_package_validation.py", "mcp_render_validation.py", "render_png.py", "mcp_style_state.py", "mcp_ingest_publish_state.py", "fixture.v1.json", "mcp_candidate_wire.mjs", "mcp_fixed_client_launcher.mjs", "mcp_fixed_sdk_runner.mjs", "mcp_fixed_client_manifest.v1.json", "mcp_deployment_workspace_validation.mjs", "mcp_deployment_workspace_authority.py", "mcp_deployment_workspace_cohort.py", "mcp_deployment_identity_fixture.py", "mcp_deployment_identity_validation.py", "mcp_deployment_identity_role.py", "mcp_deployment_identity_configuration.py", "mcp_managed_identity_fixture.py", "mcp_ops_events_data_read.py", "mcp_ops_events_state.py"];
const prefix = "certification/installed-clients/";
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

export function verifiedDeploymentWorkspaceSource() {
  const pins = JSON.parse(readFileSync(new URL("./deployment-workspace-validation-pins.json", import.meta.url)));
  const directory = fileURLToPath(new URL("./.deployment-workspace-validation/", import.meta.url));
  const binding = JSON.parse(readFileSync(join(directory, "source-binding.json")));
  const paths = names.map(name => prefix + name);
  if (pins.repository !== "honua-io/honua-release" || !/^[a-f0-9]{40}$/.test(pins.sourceSha ?? "")
      || binding.schema !== "honua.mcp-deployment-workspace-source/v1" || binding.repository !== pins.repository || binding.sourceSha !== pins.sourceSha
      || Object.keys(pins.sha256 ?? {}).toSorted().join() !== paths.toSorted().join()
      || Object.keys(binding.files ?? {}).toSorted().join() !== paths.toSorted().join()
      || readdirSync(directory).toSorted().join() !== [...names, "source-binding.json"].toSorted().join()) {
    throw new Error("deployment-workspace source lacks exact protected complete binding");
  }
  for (const path of paths) {
    const bytes = readFileSync(join(directory, path.split("/").at(-1)));
    const blob = createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest("hex");
    if (!/^[a-f0-9]{64}$/.test(pins.sha256[path] ?? "") || digest(bytes) !== pins.sha256[path]
        || binding.files[path]?.sha256 !== pins.sha256[path] || binding.files[path]?.gitBlob !== blob) {
      throw new Error("deployment-workspace source bytes or Git blob differ from reviewed pins");
    }
  }
  return { directory, sourceSha: pins.sourceSha,
    sha256: Object.fromEntries(names.slice(1).map(name => [name, pins.sha256[prefix + name]])),
    bootstrapPath: process.env.HONUA_MCP_RENDER_BOOTSTRAP ?? fileURLToPath(new URL("./artifacts/render-bootstrap.json", import.meta.url)) };
}

const initial = verifiedDeploymentWorkspaceSource();
const owned = await import(pathToFileURL(join(initial.directory, "mcp_deployment_workspace_cohort.mjs")).href);

export function deploymentWorkspaceCohortScenarios(records, clients, results) {
  return owned.createDeploymentWorkspaceCohort(verifiedDeploymentWorkspaceSource()).deploymentWorkspaceCohortScenarios(records, {
    candidateSourceSha: process.env.HONUA_MCP_SERVER_SOURCE_SHA, candidateImage: process.env.HONUA_MCP_SERVER_IMAGE,
    adminCredential: process.env.HONUA_MCP_API_KEY, targetId: process.env.HONUA_MCP_TARGET_ID,
    ownedDisposableCandidate: process.env.HONUA_MCP_OWNED_DISPOSABLE_CANDIDATE === "1", clients, results,
  });
}

export function verifyDeploymentWorkspaceProof(proof, sourceSha, imageDigest, operation, canonicalClient, clientVersion) {
  try {
    if (typeof proof?.candidateImage !== "string" || proof.candidateImage.split("@").at(-1) !== imageDigest) return false;
    return owned.createDeploymentWorkspaceCohort(verifiedDeploymentWorkspaceSource()).verifyDeploymentWorkspaceProof(proof, sourceSha,
      proof.candidateImage, operation, canonicalClient, clientVersion);
  } catch { return false; }
}
