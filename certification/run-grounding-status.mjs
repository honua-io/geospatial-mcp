// Extend both completed canonical client lanes with the release-owned proof.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { groundingStatusScenarios } from "./grounding-status-validation.mjs";

const root = fileURLToPath(new URL("./", import.meta.url));
const selections = [["sdk", "Official MCP TypeScript SDK", "@modelcontextprotocol/sdk"],
  ["inspector", "MCP Inspector", "@modelcontextprotocol/inspector"]];
let failed = false;
for (const [key, canonicalClient, name] of selections) {
  const results = join(root, "artifacts", `${key}-results.json`);
  const lane = JSON.parse(await readFile(results, "utf8"));
  if (lane.performedBy !== canonicalClient || lane.requestUrl !== "http://localhost:8080/mcp"
      || !lane.checks || typeof lane.checks !== "object" || Array.isArray(lane.checks))
    throw new Error("canonical grounding/status baseline lane identity is missing");
  const metadata = JSON.parse(await readFile(join(root, "node_modules", ...name.split("/"), "package.json"), "utf8"));
  if (metadata.name !== name || typeof metadata.version !== "string" || !/^\d+\.\d+\.\d+$/.test(metadata.version))
    throw new Error("installed canonical client package identity is missing");
  const record = async (operation, run) => {
    const startedAt = new Date().toISOString();
    try {
      const value = await run();
      lane.checks[operation] = { result: "pass", startedAt, completedAt: new Date().toISOString(), value };
    } catch (error) {
      failed = true;
      lane.checks[operation] = { result: "fail", startedAt, completedAt: new Date().toISOString(), error: String(error) };
    }
    await writeFile(results, JSON.stringify(lane, null, 2) + "\n");
  };
  await groundingStatusScenarios(record, canonicalClient, metadata.version, results);
}
if (failed) process.exitCode = 1;
