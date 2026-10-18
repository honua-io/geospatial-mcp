import { readFile, writeFile } from "node:fs/promises";
import { loadFixture, readScenarios, verifyQuery } from "./semantic-reads.mjs";
import { authenticationDenial, assertToolRoster, collectPages, missingTool, toolOutput } from "./probes.mjs";
import { verifyCancellationProof } from "./cancellation-proof.mjs";
import { loadServerHarness } from "./server-harness.mjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = new URL(process.env.HONUA_MCP_URL ?? "http://localhost:8080/mcp");
const headers = process.env.HONUA_MCP_API_KEY
  ? { "X-API-Key": process.env.HONUA_MCP_API_KEY }
  : undefined;
const client = new Client({ name: "geospatial-mcp-certification", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers } });
const checks = {};

const negotiatedProtocolVersion = () => transport.protocolVersion;

async function record(name, call) {
  const startedAt = new Date().toISOString();
  try {
    const value = await call();
    checks[name] = { result: "pass", startedAt, completedAt: new Date().toISOString(), value };
  } catch (error) {
    checks[name] = { result: "fail", startedAt, completedAt: new Date().toISOString(), error: String(error) };
  }
}

await record("initialize", () => client.connect(transport));
if (checks.initialize.result === "pass") {
  const protocolVersion = negotiatedProtocolVersion();
  if (!protocolVersion) throw new Error("SDK did not expose the negotiated MCP protocol version");
  await record("ping", () => client.ping());
  await record("tools/list", async () => {
    const names = await collectPages((params) => client.listTools(params), "tools", ({ name }) => name);
    const manifest = JSON.parse(await readFile(new URL("../conformance/manifests/honua.manifest.json", import.meta.url), "utf8"));
    return assertToolRoster(names, manifest.tools.map(({ advertisedName }) => advertisedName));
  });
  await record("resources/templates/list", async () => {
    const templates = await collectPages((params) => client.listResourceTemplates(params), "resourceTemplates", ({ name, uriTemplate }) => ({ name, uriTemplate }));
    return { templates, paginationCompleted: true };
  });
  await record("behavior/resources-pagination", async () => {
    const resources = await collectPages((params) => client.listResources(params), "resources", ({ name, uri }) => ({ name, uri }));
    return { resources, paginationCompleted: true };
  });
  await readScenarios((name, arguments_) => client.callTool({ name, arguments: arguments_ }), record);
  await record("behavior/error", () => missingTool(client));
  if (process.env.HONUA_MCP_CANCELLATION_OBSERVER === "postgres-lock-v1") {
    await record("behavior/cancellation", async () => {
      if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("cancellation requires the owned local-docker target");
      const fixture = await loadFixture();
      const harness = await loadServerHarness(process.env.HONUA_MCP_SERVER_HARNESS ?? ".candidate-server",
        process.env.HONUA_MCP_SERVER_SOURCE_SHA);
      const observer = new harness.PostgresCancellationObserver(harness.observerConfiguration(process.env));
      const otherClient = new Client({ name: "geospatial-mcp-cancellation-authority-control", version: "1.0.0" });
      const otherTransport = new StreamableHTTPClientTransport(url, { requestInit: { headers } });
      try { await otherClient.connect(otherTransport); }
      catch { await otherClient.close(); throw new Error("independent SDK cancellation-control session could not initialize"); }
      const proof = await harness.requestCancellation({ client, transport, otherClient, otherTransport, observer, fixture,
        verifyRecovery: (result) => verifyQuery(toolOutput(result), fixture) });
      if (!verifyCancellationProof(proof, fixture.sourceSha, "Official MCP TypeScript SDK")) {
        throw new Error("server cancellation scenario returned an incomplete proof");
      }
      return proof;
    });
  } else {
    // A local AbortSignal rejection or client process kill cannot replace the
    // independent database observation; unconfigured controls remain nonpass.
    checks["behavior/cancellation"] = { result: "skip", reason: "Owned Postgres request-cessation observer is not configured; geospatial-mcp#95" };
  }
  await record("behavior/auth", async () => {
    const anonymous = new Client({ name: "geospatial-mcp-anonymous-certification", version: "1.0.0" });
    try {
      await anonymous.connect(new StreamableHTTPClientTransport(url));
      return await authenticationDenial(anonymous);
    } finally { await anonymous.close(); }
  });
  checks.protocolVersion = protocolVersion;
  await client.close();
}
await writeFile(process.env.CERT_RESULTS ?? "sdk-results.json", `${JSON.stringify({ performedBy: "Official MCP TypeScript SDK", requestUrl: url.href, protocolVersion: checks.protocolVersion ?? null, checks }, null, 2)}\n`);
if (Object.values(checks).some(({ result }) => result === "fail" || result === "skip")) process.exitCode = 1;
