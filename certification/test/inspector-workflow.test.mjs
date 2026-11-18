import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { inspectorCancellationRequested } from "../inspector-cancellation-selection.mjs";

const workflow = await readFile(new URL("../../.github/workflows/protocol-certification.yml", import.meta.url), "utf8");
// These workflow step environments are flat string maps. Read their authored
// values without evaluating GitHub expressions or obtaining any secret value.
function environment(name) {
  const step = workflow.split(`- name: ${name}\n`)[1]?.split("\n      - name:")[0];
  assert.ok(step, `canonical ${name} step is missing`);
  return Object.fromEntries([...step.matchAll(/^ {10}([A-Z_]+): (.+)$/gm)].map(([, key, value]) =>
    [key, value.startsWith('"') ? JSON.parse(value) : value]));
}
const sdk = environment("Exercise MCP through the real official SDK");
const inspector = environment("Exercise MCP through the real Inspector");
const sameObserverAndFixture = (value) => {
  assert.equal(inspectorCancellationRequested(value), true, "actual runner must select the owned cessation path");
  for (const key of Object.keys(sdk).filter((key) => key.startsWith("HONUA_MCP_"))) {
    assert.equal(value[key], sdk[key], `${key} must bind the same target, fixture, source and independent database as SDK`);
  }
};

test("actual canonical Inspector step selects cessation with the complete SDK-equivalent target and observer binding", async () => {
  sameObserverAndFixture(inspector);
  assert.equal(inspector.HONUA_MCP_OBSERVER_PGSERVER_APP_NAME,
    "honua-mcp-cert-${{ github.run_id }}-${{ github.run_attempt }}");
  assert.ok(workflow.includes("Application Name=honua-mcp-cert-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"),
    "observer must select the exact server connection application name");
  const runner = await readFile(new URL("../run-inspector.mjs", import.meta.url), "utf8");
  assert.ok(runner.includes("if (inspectorCancellationRequested(process.env))"), "exercise the selection actually used by the runner");
});

test("omitting selection or any observer/fixture setting cannot satisfy the actual workflow invocation contract", () => {
  const missingSelector = { ...inspector }; delete missingSelector.HONUA_MCP_CANCELLATION_OBSERVER;
  assert.equal(inspectorCancellationRequested(missingSelector), false,
    "reproduces the reviewed guard taking its explicit skip branch");
  assert.throws(() => sameObserverAndFixture(missingSelector));
  for (const key of Object.keys(sdk).filter((key) => key.startsWith("HONUA_MCP_"))) {
    const missing = { ...inspector }; delete missing[key];
    assert.throws(() => sameObserverAndFixture(missing), undefined, key);
  }
});

test("Inspector render calls discover the full workflow view so the pinned CLI can find the render tool", async () => {
  const runner = await readFile(new URL("../run-inspector.mjs", import.meta.url), "utf8");
  const render = runner.split("await renderScenarios(")[1]?.split("}, async (name, run)")[0];
  assert.ok(render, "render scenario invocation is missing");
  // The candidate's default view omits honua_render_map; the CLI refuses names
  // absent from its own tools/list before sending tools/call.
  assert.match(render, /"--metadata", 'honua\.io\/workflow-view="full"'/);
});
