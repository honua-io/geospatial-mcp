import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../../.github/workflows/protocol-certification.yml", import.meta.url), "utf8");

test("certify provisions the candidate's own pgRouting and local geocoder fixture", () => {
  assert.match(workflow, /image: pgrouting\/pgrouting:17-3\.5-3\.7\.3@sha256:5e6767abbd1fd9ead84c9988aa31bac71ca292ef8a1fc2e4a5ee2b613ac6a7bb/);
  assert.doesNotMatch(workflow, /image: postgis\/postgis:/);
  for (const path of ["scripts/certification/seed-sdk-protocol-fixture.py", "scripts/certification/verify-sdk-protocol-fixture.py",
    "tests/seed/sdk-protocol-v1/manifest.json", "tests/seed/sdk-protocol-v1/geocoder.csv", "docker/routing/init-routing.sql"])
    assert.ok(workflow.includes(path), path);
  assert.match(workflow, /verify-sdk-protocol-fixture\.py" --server-env/);
  assert.match(workflow, /--env-file "\$\{HONUA_MCP_LOCATION_ENV_FILE\}" "\$\{SERVER_IMAGE\}"/);
  assert.match(workflow, /seed-sdk-protocol-fixture\.py --apply/);
  assert.match(workflow, /HONUA_PROTOCOL_FIXTURE_TARGET: ephemeral/);
  // Seeding precedes the first location proof (run-sdk.mjs), so no restart is needed.
  assert.ok(workflow.indexOf("seed-sdk-protocol-fixture.py --apply") < workflow.indexOf("node run-sdk.mjs"));
  // A missing or drifted fixture never counts as success.
  assert.match(workflow, /steps\.location-fixture\.outcome \}\}" != "success"/);
  assert.match(workflow, /steps\.location-seed\.outcome \}\}" != "success"/);
});

test("certify can never reach a public geocoder", () => {
  assert.ok(workflow.includes("'Geocoding__Providers__Nominatim__Enabled=false'"));
  const block = workflow.slice(workflow.indexOf("- name: Block public geocoder egress before candidate boot"));
  assert.match(block.slice(0, 1400), /sudo iptables -I OUTPUT -d "\$\{ip\}" -j REJECT/);
  assert.match(block.slice(0, 1400), /sudo ip6tables -I OUTPUT -d "\$\{ip\}" -j REJECT/);
  assert.match(block.slice(0, 1400), /is still reachable after the egress block/);
  assert.ok(workflow.indexOf("- name: Block public geocoder egress before candidate boot") < workflow.indexOf("- name: Start exact Honua server image"));
  for (const required of ["Geocoding__DefaultProvider=local", "Geocoding__Providers__Local__Enabled=true", "Routing__Provider=pgrouting"])
    assert.ok(workflow.includes(`grep -qx '${required}'`), required);
  const guard = workflow.slice(workflow.indexOf("- name: Refuse any public geocoder egress"));
  assert.match(guard.slice(0, 700), /if: always\(\)/);
  assert.match(guard.slice(0, 700), /openstreetmap/);
  assert.ok(workflow.indexOf("- name: Refuse any public geocoder egress") < workflow.indexOf("- name: Emit normalized digest-bound fragment"));
});
