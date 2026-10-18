import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { loadFixture, readScenarios, verifyQuery } from "./semantic-reads.mjs";
import { authenticationDenial, assertToolRoster, toolOutput } from "./probes.mjs";
import { loadInspectorPaginationHarness, loadInspectorCancellationHarness } from "./server-harness.mjs";
import { verifyInspectorPaginationProof, requireSuccessfulInspectorPaginationResult } from "./pagination-proof.mjs";
import { verifyInspectorCancellationProof } from "./inspector-cancellation-proof.mjs";
import { CLIENTS } from "./requirements.mjs";

const requestUrl = process.env.HONUA_MCP_URL ?? "http://localhost:8080/mcp";
const binary = new URL("./node_modules/.bin/mcp-inspector", import.meta.url).pathname;
const checks = {};

const findProtocolVersion = (value) => {
  if (!value || typeof value !== "object") return undefined;
  if (typeof value.protocolVersion === "string") return value.protocolVersion;
  return Object.values(value).map(findProtocolVersion).find(Boolean);
};

async function invoke(operation, method, extra = [], expectedCode = 0, authenticated = true, endpoint = requestUrl) {
  const startedAt = new Date().toISOString();
  const args = ["--cli", endpoint, "--transport", "http", "--method", method, "--format", "json", ...extra];
  if (authenticated && process.env.HONUA_MCP_API_KEY) args.push("--header", `X-API-Key: ${process.env.HONUA_MCP_API_KEY}`);
  const result = await new Promise((resolve) => {
    const child = spawn(binary, args, { env: { ...process.env, MCP_AUTO_OPEN_ENABLED: "false" } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, 30_000);
    child.on("error", (error) => { clearTimeout(timeout); resolve({ code: null, signal: null, timedOut, stdout, stderr: String(error) }); });
    child.on("close", (code, signal) => { clearTimeout(timeout); resolve({ code, signal, timedOut, stdout, stderr }); });
  });
  checks[operation] = {
    result: (Array.isArray(expectedCode) ? expectedCode.includes(result.code) : result.code === expectedCode) ? "pass" : "fail",
    startedAt,
    completedAt: new Date().toISOString(),
    inspectorExitCode: result.code,
    inspectorExitSignal: result.signal ?? null,
    inspectorTimedOut: result.timedOut === true,
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
await readScenarios(async (name, arguments_) => {
  const extra = ["--tool-name", name];
  if (Object.keys(arguments_).length) extra.push("--tool-arg", ...Object.entries(arguments_).map(([key, value]) => `${key}=${JSON.stringify(value)}`));
  return invoke(`diagnostic/${name}`, "tools/call", extra, [0, 5]);
}, async (name, run) => {
  const startedAt = new Date().toISOString();
  try { checks[name] = { result: "pass", startedAt, value: await run(), completedAt: new Date().toISOString() }; }
  catch (error) { checks[name] = { result: "fail", startedAt, error: String(error), completedAt: new Date().toISOString() }; }
});
const paginationStarted = new Date().toISOString();
let paginationHarness;
try {
  paginationHarness = await loadInspectorPaginationHarness(new URL("./.candidate-server/", import.meta.url).pathname,
    process.env.HONUA_MCP_SERVER_SOURCE_SHA);
} catch {
  checks["behavior/resources-pagination"] = { result: "skip", reason: "verified candidate-source Inspector observer is unavailable" };
}
if (paginationHarness) {
  try {
    const proof = await paginationHarness.observeInspectorPagination({ endpoint: requestUrl,
      inspectorVersion: CLIENTS.inspector.version, sourceSha: process.env.HONUA_MCP_SERVER_SOURCE_SHA,
      invoke: async (endpoint) => {
        const output = await invoke("diagnostic/resources-list", "resources/list", [], 0, true, endpoint);
        return requireSuccessfulInspectorPaginationResult(output, checks["diagnostic/resources-list"]);
      } });
    if (!verifyInspectorPaginationProof(proof, process.env.HONUA_MCP_SERVER_SOURCE_SHA, CLIENTS.inspector.version)) {
      throw new Error("Inspector pagination proof did not bind the installed client and candidate");
    }
    checks["behavior/resources-pagination"] = { result: "pass", value: proof, startedAt: paginationStarted, completedAt: new Date().toISOString() };
  } catch {
    checks["behavior/resources-pagination"] = { result: "fail", error: "Independent Inspector cursor traversal was not proved",
      startedAt: paginationStarted, completedAt: new Date().toISOString() };
  }
}
// The pinned CLI rejects names absent from its local tools/list before sending
// tools/call. Its exit code cannot establish the candidate's unknown-tool error.
checks["behavior/error"] = { result: "skip", reason: "Pinned Inspector rejects unknown tool locally; no server error proof" };
// The authentication control calls a protected tool through an anonymous Inspector
// session and inspects its typed refusal; a successful handshake is insufficient.
const denied = await invoke("behavior/auth", "tools/call", ["--tool-name", "honua_list_layers", "--stored-auth-only"], 5, false);
try { await authenticationDenial({ callTool: async () => denied }); }
catch (error) { checks["behavior/auth"].result = "fail"; checks["behavior/auth"].error = String(error); }
const cancellationStarted = new Date().toISOString();
if (process.env.HONUA_MCP_CANCELLATION_OBSERVER === "postgres-lock-v1") {
  try {
    if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(requestUrl).hostname)) throw new Error("owned loopback target is required");
    const directory = new URL("./.candidate-server/", import.meta.url).pathname;
    const harness = await loadInspectorCancellationHarness(directory, process.env.HONUA_MCP_SERVER_SOURCE_SHA);
    const { chromium } = await import(new URL("./.candidate-server/browser/node_modules/@playwright/test/index.mjs", import.meta.url));
    const fixture = await loadFixture();
    const observer = new harness.PostgresCancellationObserver(harness.observerConfiguration(process.env));
    const tool = tools?.tools?.find((value) => value.name === "honua_query_features");
    if (!tool) throw new Error("query tool was not discovered by the actual Inspector");
    const proof = await harness.inspectorBrowserCancellation({ endpoint: requestUrl, inspectorVersion: CLIENTS.inspector.version,
      sourceSha: fixture.sourceSha, fixture, observer,
      openUi: (endpoint) => harness.openInspectorPublicUi({ endpoint, chromium, toolLabel: tool.title ?? tool.name,
        inspectorEntry: new URL("./node_modules/@modelcontextprotocol/inspector/clients/launcher/build/index.js", import.meta.url).pathname,
        headers: process.env.HONUA_MCP_API_KEY ? { "X-API-Key": process.env.HONUA_MCP_API_KEY } : {} }),
      verifyRecovery: (result) => verifyQuery(toolOutput(result), fixture) });
    if (!verifyInspectorCancellationProof(proof, fixture.sourceSha, CLIENTS.inspector.version)) throw new Error("incomplete Inspector proof");
    checks["behavior/cancellation"] = { result: "pass", value: proof, startedAt: cancellationStarted, completedAt: new Date().toISOString() };
  } catch {
    checks["behavior/cancellation"] = { result: "fail", error: "Public Inspector notification, open upstream and independent PostgreSQL cessation were not proved",
      startedAt: cancellationStarted, completedAt: new Date().toISOString() };
  }
} else checks["behavior/cancellation"] = { result: "skip", reason: "Owned PostgreSQL request-cessation observer is not configured; geospatial-mcp#95" };
await writeFile(process.env.CERT_RESULTS ?? "inspector-results.json", `${JSON.stringify({ performedBy: "MCP Inspector", requestUrl, protocolVersion: checks.protocolVersion ?? null, checks }, null, 2)}\n`);
if (Object.values(checks).some(({ result }) => result === "fail" || result === "skip")) process.exitCode = 1;
