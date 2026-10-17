import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { authenticationDenial, assertToolRoster } from "./probes.mjs";

const requestUrl = process.env.HONUA_MCP_URL ?? "http://localhost:8080/mcp";
const binary = new URL("./node_modules/.bin/mcp-inspector", import.meta.url).pathname;
const checks = {};

const findProtocolVersion = (value) => {
  if (!value || typeof value !== "object") return undefined;
  if (typeof value.protocolVersion === "string") return value.protocolVersion;
  return Object.values(value).map(findProtocolVersion).find(Boolean);
};

async function invoke(operation, method, extra = [], expectedCode = 0, authenticated = true) {
  const startedAt = new Date().toISOString();
  const args = ["--cli", requestUrl, "--transport", "http", "--method", method, "--format", "json", ...extra];
  if (authenticated && process.env.HONUA_MCP_API_KEY) args.push("--header", `X-API-Key: ${process.env.HONUA_MCP_API_KEY}`);
  const result = await new Promise((resolve) => {
    const child = spawn(binary, args, { env: { ...process.env, MCP_AUTO_OPEN_ENABLED: "false" } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timeout = setTimeout(() => child.kill("SIGTERM"), 30_000);
    child.on("error", (error) => { clearTimeout(timeout); resolve({ code: null, stdout, stderr: String(error) }); });
    child.on("close", (code) => { clearTimeout(timeout); resolve({ code, stdout, stderr }); });
  });
  checks[operation] = {
    result: result.code === expectedCode ? "pass" : "fail",
    startedAt,
    completedAt: new Date().toISOString(),
    inspectorExitCode: result.code,
    output: result.stdout.trim(),
    error: result.stderr.trim(),
  };
  const parsed = (() => { try { return JSON.parse(result.stdout); } catch { return undefined; } })();
  if (operation === "initialize") checks.protocolVersion = findProtocolVersion(parsed);
  return parsed?.result ?? parsed;
}

await invoke("initialize", "initialize");
checks.ping = { result: "skip", reason: "Pinned Inspector one-shot CLI has no ping method; initialize is not ping proof" };
const tools = await invoke("tools/list", "tools/list");
try {
  const manifest = JSON.parse(await readFile(new URL("../conformance/manifests/honua.manifest.json", import.meta.url), "utf8"));
  assertToolRoster(tools?.tools?.map(({ name }) => name) ?? [], manifest.tools.map(({ advertisedName }) => advertisedName));
} catch (error) { checks["tools/list"].result = "fail"; checks["tools/list"].error = String(error); }
await invoke("resources/templates/list", "resources/templates/list");
await invoke("behavior/resources-pagination", "resources/list");
// The pinned CLI rejects names absent from its local tools/list before sending
// tools/call. Its exit code cannot establish the candidate's unknown-tool error.
checks["behavior/error"] = { result: "skip", reason: "Pinned Inspector rejects unknown tool locally; no server error proof" };
// The authentication control calls a protected tool through an anonymous Inspector
// session and inspects its typed refusal; a successful handshake is insufficient.
const denied = await invoke("behavior/auth", "tools/call", ["--tool-name", "honua_list_layers", "--stored-auth-only"], 5, false);
try { await authenticationDenial({ callTool: async () => denied }); }
catch (error) { checks["behavior/auth"].result = "fail"; checks["behavior/auth"].error = String(error); }
checks["behavior/cancellation"] = { result: "skip", reason: "Inspector has no supported in-flight cancellation proof; honua-release#123" };
await writeFile(process.env.CERT_RESULTS ?? "inspector-results.json", `${JSON.stringify({ performedBy: "MCP Inspector", requestUrl, protocolVersion: checks.protocolVersion ?? null, checks }, null, 2)}\n`);
if (Object.values(checks).some(({ result }) => result === "fail" || result === "skip")) process.exitCode = 1;
