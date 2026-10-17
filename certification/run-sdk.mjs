import { readFile, writeFile } from "node:fs/promises";
import { authenticationDenial, assertToolRoster, collectPages, missingTool } from "./probes.mjs";
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
  await record("behavior/error", () => missingTool(client));
  // Neither a pre-aborted local promise nor killing the client establishes that
  // the candidate stopped in-flight work. No cancellation receipt is minted.
  checks["behavior/cancellation"] = {
    result: "skip", reason: "No independently observed server-side in-flight cancellation scenario is implemented; honua-release#123",
  };
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
