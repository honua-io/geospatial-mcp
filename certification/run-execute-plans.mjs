// Run restart-sensitive journeys only after both ordinary canonical client lanes
// have closed their sessions and retained their original bootstrap-bound proof.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { executePlanScenarios } from "./execute-plan-validation.mjs";

const root = fileURLToPath(new URL("./", import.meta.url));
const selections = [["sdk", "Official MCP TypeScript SDK", "@modelcontextprotocol/sdk"], ["inspector", "MCP Inspector", "@modelcontextprotocol/inspector"]];
let failed = false;
for (const [key, canonicalClient, name] of selections) {
  const results = join(root, "artifacts", `${key}-results.json`);
  // A missing original result must not turn into a newly invented complete lane.
  const lane = JSON.parse(await readFile(results, "utf8"));
  if (lane.performedBy !== canonicalClient || lane.requestUrl !== "http://localhost:8080/mcp" || !lane.checks || typeof lane.checks !== "object" || Array.isArray(lane.checks)) throw new Error("canonical baseline lane identity is missing");
  // Read the root package manifest: SDK package.json export resolution maps to
  // dist/cjs/package.json and cannot establish the installed root version.
  const metadata = JSON.parse(await readFile(join(root, "node_modules", ...name.split("/"), "package.json"), "utf8"));
  if (metadata.name !== name || typeof metadata.version !== "string" || !/^\d+\.\d+\.\d+$/.test(metadata.version)) throw new Error("actual installed package root identity is missing");
  const record = async (operation, run) => {
    const startedAt = new Date().toISOString();
    try {
      const value = await run(); lane.checks[operation] = { result: "pass", startedAt, completedAt: new Date().toISOString(), value };
    } catch (error) {
      failed = true; lane.checks[operation] = { result: "fail", startedAt, completedAt: new Date().toISOString(), error: String(error) };
    }
    // Retain each outcome even if a later client or stage refuses.
    await writeFile(results, JSON.stringify(lane, null, 2) + "\n");
  };
  await executePlanScenarios(record, canonicalClient, metadata.version, results);
}
if (failed) process.exitCode = 1;
