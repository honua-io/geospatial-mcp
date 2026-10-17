import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema, McpError } from "@modelcontextprotocol/sdk/types.js";

const manifest = JSON.parse(await readFile(new URL("../../conformance/manifests/honua.manifest.json", import.meta.url), "utf8"));

async function execute(mode, runner = "sdk") {
  const directory = await mkdtemp(join(tmpdir(), "mcp-wire-controls-"));
  const calls = [];
  const listener = createServer(async (request, response) => {
    if (request.method !== "POST") { response.writeHead(405).end(); return; }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    calls.push({ method: body.method, name: body.params?.name, authenticated: request.headers["x-api-key"] === "control-key" });
    const server = new Server({ name: "deliberately-controlled-test-server", version: "1.0.0" }, {
      capabilities: { tools: {}, resources: {} },
    });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: manifest.tools.map((tool) => ({ name: tool.advertisedName, inputSchema: { type: "object" } })) }));
    server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [] }));
    server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: [] }));
    server.setRequestHandler(CallToolRequestSchema, async (value) => {
      if (request.headers["x-api-key"] !== "control-key") {
        return mode === "auth-success" ? { structuredContent: { layers: [{ name: "leaked" }] }, content: [] }
          : { isError: true, structuredContent: { status: "error", code: "unauthenticated", requiresReauthentication: true }, content: [] };
      }
      if (mode === "unknown-success") return { structuredContent: { accepted: true }, content: [] };
      throw new McpError(ErrorCode.InvalidParams, `Unknown MCP tool '${value.params.name}'.`, { code: "invalid_argument" });
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    response.on("close", () => { void transport.close(); void server.close(); });
    await server.connect(transport);
    await transport.handleRequest(request, response, body);
  });
  try {
    await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
    const destination = join(directory, "results.json");
    const child = spawn(process.execPath, [new URL(`../run-${runner}.mjs`, import.meta.url).pathname], {
      env: { PATH: process.env.PATH, MCP_AUTO_OPEN_ENABLED: "false", MCP_STORAGE_DIR: directory,
        MCP_CATALOG_PATH: join(directory, "catalog.json"), MCP_INSPECTOR_SECRET_STORE: "file",
        MCP_INSPECTOR_SECRET_FILE: join(directory, "secrets.json"), HONUA_MCP_URL: `http://127.0.0.1:${listener.address().port}/mcp`, HONUA_MCP_API_KEY: "control-key", CERT_RESULTS: destination },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let errors = "";
    child.stderr.on("data", (data) => { errors += data; });
    const timeout = setTimeout(() => child.kill("SIGKILL"), 40_000);
    const code = await new Promise((resolve) => child.on("close", resolve));
    clearTimeout(timeout);
    assert.equal(code, 1, errors); // Cancellation remains explicitly incomplete in every case.
    return { result: JSON.parse(await readFile(destination, "utf8")), calls };
  } finally {
    await new Promise((resolve) => listener.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
}

test("real official SDK runner does not certify successful unknown tools or anonymous data", async () => {
  for (const [mode, expectedError, expectedAuth] of [["typed-refusal", "pass", "pass"],
    ["unknown-success", "fail", "pass"], ["auth-success", "pass", "fail"]]) {
    const { result, calls } = await execute(mode);
    assert.equal(result.checks.initialize.result, "pass");
    assert.equal(result.checks["behavior/error"].result, expectedError);
    assert.equal(result.checks["behavior/auth"].result, expectedAuth);
    assert.equal(result.checks["behavior/cancellation"].result, "skip");
    assert.ok(calls.some((call) => call.name === "__certification_missing_tool__" && call.authenticated));
    assert.ok(calls.some((call) => call.name === "honua_list_layers" && !call.authenticated));
    assert.equal(JSON.stringify(result).includes("control-key"), false);
  }
});


test("real Inspector anonymous tool invocation distinguishes denial from leaked data", async () => {
  for (const mode of ["typed-refusal", "auth-success"]) {
    const { result, calls } = await execute(mode, "inspector");
    assert.equal(result.checks.initialize.result, "pass");
    assert.equal(result.checks["behavior/auth"].result, mode === "typed-refusal" ? "pass" : "fail");
    for (const name of ["ping", "behavior/error", "behavior/cancellation"]) assert.equal(result.checks[name].result, "skip");
    assert.ok(calls.some((call) => call.name === "honua_list_layers" && !call.authenticated));
    assert.equal(calls.some((call) => call.name === "__certification_missing_tool__"), false);
    assert.equal(JSON.stringify(result).includes("control-key"), false);
  }
});
