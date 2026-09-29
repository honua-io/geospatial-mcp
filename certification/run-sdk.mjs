import { writeFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = new URL(process.env.HONUA_MCP_URL ?? "http://localhost:8080/mcp");
const headers = process.env.HONUA_MCP_API_KEY
  ? { Authorization: `Bearer ${process.env.HONUA_MCP_API_KEY}` }
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
    const names = [];
    let cursor;
    do {
      const page = await client.listTools(cursor ? { cursor } : undefined);
      names.push(...page.tools.map(({ name }) => name));
      cursor = page.nextCursor;
    } while (cursor);
    return { names, paginationCompleted: true };
  });
  await record("resources/templates/list", async () => {
    const templates = [];
    let cursor;
    do {
      const page = await client.listResourceTemplates(cursor ? { cursor } : undefined);
      templates.push(...page.resourceTemplates.map(({ name, uriTemplate }) => ({ name, uriTemplate })));
      cursor = page.nextCursor;
    } while (cursor);
    return { templates, paginationCompleted: true };
  });
  await record("behavior/resources-pagination", async () => {
    const resources = [];
    let cursor;
    do {
      const page = await client.listResources(cursor ? { cursor } : undefined);
      resources.push(...page.resources.map(({ name, uri }) => ({ name, uri })));
      cursor = page.nextCursor;
    } while (cursor);
    return { resources, paginationCompleted: true };
  });
  await record("behavior/error", async () => {
    try {
      await client.callTool({ name: "__certification_missing_tool__", arguments: {} });
      throw new Error("missing tool unexpectedly succeeded");
    } catch (error) {
      return { rejected: true, error: String(error) };
    }
  });
  await record("behavior/cancellation", async () => {
    const controller = new AbortController();
    controller.abort(new Error("certification cancellation"));
    try {
      await client.ping({ signal: controller.signal });
      throw new Error("aborted request unexpectedly succeeded");
    } catch (error) {
      return { cancelled: true, error: String(error) };
    }
  });
  await record("behavior/auth", () => client.ping());
  checks.protocolVersion = protocolVersion;
  await client.close();
}
await writeFile(process.env.CERT_RESULTS ?? "sdk-results.json", `${JSON.stringify({ performedBy: "Official MCP TypeScript SDK", requestUrl: url.href, protocolVersion: checks.protocolVersion ?? null, checks }, null, 2)}\n`);
if (Object.values(checks).some(({ result }) => result === "fail")) process.exitCode = 1;
