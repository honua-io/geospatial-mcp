import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

const requestUrl = process.env.HONUA_MCP_URL ?? "http://localhost:8080/mcp";
const binary = new URL("./node_modules/.bin/mcp-inspector", import.meta.url).pathname;
const checks = {};

async function invoke(operation, method, extra = [], expectedCode = 0) {
  const startedAt = new Date().toISOString();
  const args = ["--cli", requestUrl, "--transport", "http", "--method", method, "--format", "json", ...extra];
  if (process.env.HONUA_MCP_API_KEY) args.push("--header", `Authorization: Bearer ${process.env.HONUA_MCP_API_KEY}`);
  const result = await new Promise((resolve) => {
    const child = spawn(binary, args, { env: { ...process.env, MCP_AUTO_OPEN_ENABLED: "false" } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
  checks[operation] = {
    result: result.code === expectedCode ? "pass" : "fail",
    startedAt,
    completedAt: new Date().toISOString(),
    inspectorExitCode: result.code,
    output: result.stdout.trim(),
    error: result.stderr.trim(),
  };
}

await invoke("initialize", "initialize");
await invoke("ping", "initialize"); // connect-only Inspector probe exercises transport liveness.
await invoke("tools/list", "tools/list");
await invoke("resources/templates/list", "resources/templates/list");
await invoke("behavior/resources-pagination", "resources/list");
await invoke("behavior/error", "tools/call", ["--tool-name", "__certification_missing_tool__"], 5);
await invoke("behavior/auth", "initialize", ["--stored-auth-only"]);
{
  const startedAt = new Date().toISOString();
  const child = spawn(binary, ["--cli", requestUrl, "--transport", "http", "--method", "tools/list", "--format", "json"], {
    env: { ...process.env, MCP_AUTO_OPEN_ENABLED: "false" },
  });
  setTimeout(() => child.kill("SIGTERM"), 25);
  const outcome = await new Promise((resolve) => child.on("close", (code, signal) => resolve({ code, signal })));
  checks["behavior/cancellation"] = {
    result: outcome.signal === "SIGTERM" ? "pass" : "fail",
    startedAt,
    completedAt: new Date().toISOString(),
    inspectorExitCode: outcome.code,
    signal: outcome.signal,
  };
}
await writeFile(process.env.CERT_RESULTS ?? "inspector-results.json", `${JSON.stringify({ performedBy: "MCP Inspector", requestUrl, checks }, null, 2)}\n`);
if (Object.values(checks).some(({ result }) => result === "fail")) process.exitCode = 1;
