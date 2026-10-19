// Client adapters share one authenticated authored scenario and semantic oracle.
import { createHash } from "node:crypto";
import { readFileSync, mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";

const helperPath = "certification/installed-clients/mcp_plan_validation.py";
const fixturePath = "certification/installed-clients/fixture.v1.json";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

function sharedScenario() {
  const pins = JSON.parse(readFileSync(new URL("./plan-validation-pins.json", import.meta.url), "utf8"));
  const directory = resolve(new URL("./.plan-validation/", import.meta.url).pathname);
  const binding = JSON.parse(readFileSync(join(directory, "source-binding.json"), "utf8"));
  if (pins.repository !== "honua-io/honua-release" || !/^[a-f0-9]{40}$/.test(pins.sourceSha)
      || binding.schema !== "honua.mcp-plan-validation-source/v1"
      || binding.repository !== pins.repository || binding.sourceSha !== pins.sourceSha
      || Object.keys(pins.sha256 ?? {}).sort().join() !== [helperPath, fixturePath].sort().join()
      || Object.keys(binding.files ?? {}).sort().join() !== [helperPath, fixturePath].sort().join()) {
    throw new Error("shared plan scenario lacks exact reviewed source binding");
  }
  for (const path of [helperPath, fixturePath]) {
    const bytes = readFileSync(join(directory, path.split("/").at(-1)));
    if (!/^[a-f0-9]{64}$/.test(pins.sha256[path]) || digest(bytes) !== pins.sha256[path]
        || binding.files[path]?.sha256 !== pins.sha256[path]) throw new Error("shared plan scenario bytes differ from reviewed pins");
  }
  const run = (observations) => {
    const work = mkdtempSync(join(tmpdir(), "mcp-plan-oracle-"));
    try {
      const args = ["-I", "-B", join(directory, "mcp_plan_validation.py"), "--fixture", join(directory, "fixture.v1.json")];
      if (observations) {
        const path = join(work, "observations.json");
        writeFileSync(path, JSON.stringify(observations));
        args.push("--observations", path);
      }
      const result = spawnSync("python3", args, { encoding: "utf8", timeout: 10_000, maxBuffer: 4 * 1024 * 1024 });
      if (result.error || result.signal || result.status !== 0) throw new Error("shared authored plan oracle refused the retained observations");
      return JSON.parse(result.stdout);
    } finally { rmSync(work, { recursive: true, force: true }); }
  };
  return { pins, run };
}

export async function planScenarios(call, record) {
  await record("tools/call:validate_plan", async () => {
    const candidateSourceSha = process.env.HONUA_MCP_SERVER_SOURCE_SHA;
    if (!/^[a-f0-9]{40}$/.test(candidateSourceSha ?? "")) throw new Error("plan scenario requires the exact candidate source");
    const { pins, run } = sharedScenario();
    const authored = run();
    const observations = { ...authored, cases: [] };
    const retained = `${resolve(process.env.CERT_RESULTS ?? "results.json")}.plan-validation.raw.json`;
    mkdirSync(dirname(retained), { recursive: true });
    try {
      for (const item of authored.cases) {
        const arguments_ = structuredClone(item.arguments);
        const result = await call(authored.tool, arguments_);
        observations.cases.push({ id: item.id, arguments: item.arguments, result });
      }
    } finally { writeFileSync(retained, `${JSON.stringify(observations, null, 2)}\n`); }
    const judged = run(observations);
    return { ...judged, schema: "honua.mcp-plan-validation-proof/v1", candidateSourceSha,
      helperSourceSha: pins.sourceSha, helperSha256: `sha256:${pins.sha256[helperPath]}`, observations };
  });
}

export function verifyPlanProof(proof, candidateSourceSha) {
  try {
    const { pins, run } = sharedScenario();
    if (proof?.schema !== "honua.mcp-plan-validation-proof/v1" || proof.candidateSourceSha !== candidateSourceSha
        || proof.helperSourceSha !== pins.sourceSha || proof.helperSha256 !== `sha256:${pins.sha256[helperPath]}`
        || proof.fixtureSha256 !== `sha256:${pins.sha256[fixturePath]}`
        || ![proof.positive, proof.negative, proof.mediaSchema].every((value) => value === true)) return false;
    const judged = run(proof.observations);
    return judged.fixtureSha256 === proof.fixtureSha256;
  } catch { return false; }
}
