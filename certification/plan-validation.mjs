// Verified bridge to the release-owned executable scenario and oracle.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const helperPath = "certification/installed-clients/mcp_plan_validation.py";
const fixturePath = "certification/installed-clients/fixture.v1.json";
const modulePath = "certification/installed-clients/mcp_plan_validation.mjs";
const paths = [helperPath, fixturePath, modulePath];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

function sharedSource() {
  const pins = JSON.parse(readFileSync(new URL("./plan-validation-pins.json", import.meta.url), "utf8"));
  const directory = fileURLToPath(new URL("./.plan-validation/", import.meta.url));
  let binding;
  try { binding = JSON.parse(readFileSync(join(directory, "source-binding.json"), "utf8")); }
  catch (error) {
    throw new Error("shared plan source missing; run npm run prepare:plan before npm test (authenticated gh required)", { cause: error });
  }
  if (pins.repository !== "honua-io/honua-release" || !/^[a-f0-9]{40}$/.test(pins.sourceSha)
      || binding.schema !== "honua.mcp-plan-validation-source/v1"
      || binding.repository !== pins.repository || binding.sourceSha !== pins.sourceSha
      || Object.keys(pins.sha256 ?? {}).sort().join() !== paths.toSorted().join()
      || Object.keys(binding.files ?? {}).sort().join() !== paths.toSorted().join()) {
    throw new Error("shared plan scenario lacks exact reviewed source binding");
  }
  for (const path of paths) {
    const bytes = readFileSync(join(directory, path.split("/").at(-1)));
    if (!/^[a-f0-9]{64}$/.test(pins.sha256[path]) || digest(bytes) !== pins.sha256[path]
        || binding.files[path]?.sha256 !== pins.sha256[path]) throw new Error("shared plan scenario bytes differ from reviewed pins");
  }
  return { directory, sourceSha: pins.sourceSha,
    helperSha256: pins.sha256[helperPath], fixtureSha256: pins.sha256[fixturePath] };
}

const verified = sharedSource();
const owned = await import(pathToFileURL(join(verified.directory, "mcp_plan_validation.mjs")).href);
const scenario = () => owned.createPlanValidation(sharedSource());

export async function planScenarios(call, record) {
  return scenario().planScenarios(call, record, {
    candidateSourceSha: process.env.HONUA_MCP_SERVER_SOURCE_SHA,
    results: process.env.CERT_RESULTS ?? "results.json",
  });
}

export function verifyPlanProof(proof, candidateSourceSha) {
  try { return scenario().verifyPlanProof(proof, candidateSourceSha); }
  catch { return false; }
}
