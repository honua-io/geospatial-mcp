// Actual installed-client consumption. No scenario or server oracle lives here.
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";

const require = createRequire(import.meta.url);
export function installedPackageVersion(name, entry) {
  let directory = dirname(require.resolve(entry));
  for (;;) {
    const path = join(directory, "package.json");
    if (existsSync(path)) {
      const metadata = JSON.parse(readFileSync(path, "utf8"));
      if (metadata.name === name) {
        if (typeof metadata.version !== "string" || !/^\d+\.\d+\.\d+$/.test(metadata.version)) throw new Error("installed canonical package version missing");
        return metadata.version;
      }
    }
    const parent = dirname(directory);
    if (parent === directory) throw new Error("installed canonical package identity missing");
    directory = parent;
  }
}
const versions = { sdk: installedPackageVersion("@modelcontextprotocol/sdk", "@modelcontextprotocol/sdk/client/index.js"),
  inspector: installedPackageVersion("@modelcontextprotocol/inspector", "@modelcontextprotocol/inspector/package.json") };
const hash = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const endpointUrl = (endpoint) => {
  const url = new URL(endpoint);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.pathname !== "/mcp"
      || url.username || url.password || url.search || url.hash) throw new Error("actual client requires owned loopback observer");
  return url;
};

export async function sdkMapRequest(method, params, { endpoint, authenticated = true }, credential) {
  const url = endpointUrl(endpoint);
  const client = new Client({ name: "geospatial-mcp-map-package-certification", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(url, { requestInit: {
    headers: authenticated ? { "X-API-Key": credential } : {},
  } });
  try {
    await client.connect(transport);
    let output;
    try {
      if (method === "tools/call") output = await client.callTool(params);
      else if (method === "resources/read") output = await client.readResource(params);
      else throw new Error("unsupported actual map client method");
    } catch (error) {
      if (!(error instanceof McpError)) throw error;
      output = { error: { code: error.code, message: error.message, data: error.data } };
    }
    if (typeof transport.sessionId !== "string" || !transport.sessionId) throw new Error("actual SDK exposed no fresh server session");
    return { kind: "sdk", canonicalClient: "Official MCP TypeScript SDK", version: versions.sdk,
      processId: process.pid, requestUrl: url.href, sessionSha256: hash(transport.sessionId), output };
  } finally { await client.close(); }
}

export async function inspectorMapRequest(method, params, { endpoint, authenticated = true }, credential) {
  const url = endpointUrl(endpoint);
  const directory = await mkdtemp(join(tmpdir(), "mcp-map-package-inspector-"));
  const args = ["--cli", url.href, "--transport", "http", "--method", method, "--format", "json", "--stored-auth-only"];
  if (method === "tools/call") {
    args.push("--tool-name", params.name, "--tool-arg",
      ...Object.entries(params.arguments).map(([key, value]) => `${key}=${JSON.stringify(value)}`));
    if (authenticated) args.push("--metadata", 'honua.io/workflow-view="full"');
  }
  else if (method === "resources/read") args.push("--uri", params.uri);
  else { await rm(directory, { recursive: true, force: true }); throw new Error("unsupported actual map client method"); }
  if (authenticated) args.push("--header", `X-API-Key: ${credential}`);
  try {
    // Async child is essential: the actual client's observer uses this event loop.
    const outcome = await new Promise((resolve, reject) => {
      const child = spawn(fileURLToPath(new URL("./node_modules/.bin/mcp-inspector", import.meta.url)), args, {
        env: { PATH: process.env.PATH, HOME: directory, XDG_CONFIG_HOME: directory, MCP_AUTO_OPEN_ENABLED: "false",
          MCP_STORAGE_DIR: directory, MCP_CATALOG_PATH: join(directory, "catalog.json"),
          MCP_INSPECTOR_SECRET_STORE: "file", MCP_INSPECTOR_SECRET_FILE: join(directory, "secrets.json") },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "", stderr = "", timedOut = false, oversized = false;
      let forceStop;
      const stop = () => { child.kill("SIGTERM"); forceStop ??= setTimeout(() => child.kill("SIGKILL"), 1_000); };
      const timer = setTimeout(() => { timedOut = true; stop(); }, 30_000);
      const append = (selected, chunk) => {
        if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) + Buffer.byteLength(chunk) > 2 * 1024 * 1024) {
          oversized = true; stop(); return;
        }
        if (selected === "stdout") stdout += chunk; else stderr += chunk;
      };
      child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => append("stdout", chunk));
      child.stderr.on("data", (chunk) => append("stderr", chunk));
      child.once("error", (error) => { clearTimeout(timer); clearTimeout(forceStop); reject(error); });
      child.once("close", (exitCode, exitSignal) => {
        clearTimeout(timer);
        clearTimeout(forceStop);
        if (oversized || (credential && (stdout.includes(credential) || stderr.includes(credential)))) {
          reject(new Error("actual Inspector diagnostics unsafe or oversized")); return;
        }
        resolve({ processId: child.pid, exitCode, exitSignal, timedOut, stdout, stderr });
      });
    });
    return { kind: "inspector-cli", canonicalClient: "MCP Inspector", version: versions.inspector, requestUrl: url.href, ...outcome };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
