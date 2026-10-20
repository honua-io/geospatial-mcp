// Both canonical clients share exactly one owned role/key lifecycle.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { deploymentWorkspaceCohortScenarios } from "./deployment-workspace-validation.mjs";
const root = fileURLToPath(new URL("./", import.meta.url));
const selections = [["sdk", "Official MCP TypeScript SDK", "@modelcontextprotocol/sdk"], ["inspector", "MCP Inspector", "@modelcontextprotocol/inspector"]];
const records = {}, clients = {};
let failed = false;
for (const [key, canonicalClient, name] of selections) {
  const results = join(root, "artifacts", `${key}-results.json`);
  const lane = JSON.parse(await readFile(results, "utf8"));
  if (lane.performedBy !== canonicalClient || lane.requestUrl !== "http://localhost:8080/mcp" || !lane.checks || typeof lane.checks !== "object" || Array.isArray(lane.checks)) throw new Error("canonical baseline lane identity is missing");
  const metadata = JSON.parse(await readFile(join(root, "node_modules", ...name.split("/"), "package.json"), "utf8"));
  if (metadata.name !== name || !/^\d+\.\d+\.\d+$/.test(metadata.version ?? "")) throw new Error("actual installed package root identity is missing");
  clients[key] = { clientVersion: metadata.version, installationRoot: join(root, "node_modules") };
  records[key] = async (operation, run) => {
    const startedAt = new Date().toISOString();
    try { const value = await run(); lane.checks[operation] = { result: "pass", startedAt, completedAt: new Date().toISOString(), value }; }
    catch (error) { failed = true; lane.checks[operation] = { result: "fail", startedAt, completedAt: new Date().toISOString(), error: String(error) }; }
    await writeFile(results, JSON.stringify(lane, null, 2) + "\n");
  };
}
await deploymentWorkspaceCohortScenarios(records, clients, join(root, "artifacts", "deployment-workspace-results.json"));
if (failed) process.exitCode = 1;
