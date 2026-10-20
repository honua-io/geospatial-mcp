import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { prepareOwnedAuthorizationConfiguration, composeOwnedCandidateEnvironment } from "../deployment-workspace-validation.mjs";

const vector = JSON.parse(readFileSync(new URL("./fixtures/offline-deployment-workspace-oracle-vector.json", import.meta.url)));
const pins = JSON.parse(readFileSync(new URL("../deployment-workspace-validation-pins.json", import.meta.url)));

test("initial boot posture derives the exact protected configuration and preserves default-policy limits", () => {
  const declared = prepareOwnedAuthorizationConfiguration();
  assert.deepEqual(declared.environment, vector.proof.identityCohort.configuration.environment);
  assert.equal(declared.protectedSourceSha, pins.sourceSha);
  assert.equal(declared.configurationHelperSha256, "sha256:" + pins.sha256["certification/installed-clients/mcp_deployment_identity_configuration.py"]);
  assert.equal(declared.nonDefaultOwnedFixture, true);
  assert.equal(declared.candidateQualified, false);
  assert.equal(declared.environment.MultiTenancy__MultiTenantAdminRoles__0, "admin");
});

test("safe boot composition retains both namespaces without aliases, lost values or extra grants", () => {
  const control = { ControlPlane__Enabled: "true", ControlPlane__DeclaredVersion: "2026.1=a" };
  const unchanged = structuredClone(control), result = composeOwnedCandidateEnvironment(control);
  const pairs = result.lines.map(line => { const index = line.indexOf("="); return [line.slice(0, index), line.slice(index + 1)]; });
  assert.equal(new Set(pairs.map(([key]) => key)).size, pairs.length);
  assert.deepEqual(Object.fromEntries(pairs), { ...control, ...vector.proof.identityCohort.configuration.environment });
  assert.deepEqual(control, unchanged);
  assert.deepEqual(result.declaration, prepareOwnedAuthorizationConfiguration());
});

test("unsafe or aliased options cannot extend the owned authorization posture", () => {
  for (const value of [null, [], {}, { controlplane__Enabled: "true" }, { MultiTenancy__Enabled: "false" },
    { ControlPlane__Enabled: true }, { ControlPlane__Enabled: "true\nMultiTenancy__Enabled=false" },
    { ControlPlane__Enabled: "true\0" }, { "ControlPlane__Enabled=other": "true" }]) {
    assert.throws(() => composeOwnedCandidateEnvironment(value), /ControlPlane environment/);
  }
});

test("workflow installs the composed declaration before the exact image boots and retains public evidence", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/protocol-certification.yml", import.meta.url), "utf8");
  const prepared = workflow.indexOf("const composed = composeOwnedCandidateEnvironment(declared.environment)");
  const boot = workflow.indexOf("- name: Start exact Honua server image");
  assert.ok(prepared > 0 && boot > prepared);
  const preparation = workflow.slice(prepared, boot);
  assert.match(preparation, /writeFileSync\(process\.env\.HONUA_MCP_OPS_ENV_FILE, composed\.lines/);
  assert.match(preparation, /mode: 0o600, flag: "wx"/);
  assert.match(workflow.slice(boot), /--env-file "\$\{HONUA_MCP_OPS_ENV_FILE\}"/);
  assert.match(workflow, /certification\/artifacts\/owned-authorization-declaration\.json/);
  assert.match(workflow, /certification\/artifacts\/deployment-workspace-results\.json\*/);
});
