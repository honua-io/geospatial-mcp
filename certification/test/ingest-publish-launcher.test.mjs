// Actual installed Inspector against an explicit offline discovery/auth peer.
// This control is not a candidate operation or authorization receipt.
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifiedFixtureSource } from "../render-validation.mjs";

const source = verifiedFixtureSource();
const { launchCanonicalClient } = await import(pathToFileURL(join(source.directory, "mcp_fixed_client_launcher.mjs")).href);
const installationRoot = fileURLToPath(new URL("../node_modules/", import.meta.url));
const hash = value => `sha256:${createHash("sha256").update(value).digest("hex")}`;

for (const authenticated of [false, true]) for (const supported of [true, false]) test(`actual ${authenticated ? "authenticated full" : "anonymous setup"} Inspector discovery ${supported ? "advertises and invokes" : "unsupported view remains refusal"}`, async () => {
  const credential = "controlled-ingest-private-key", sessions = new Set(), initializations = [], invocations = [], discovery = [];
  const names = ["honua_ingest_dataset", "honua_publish_service", "honua_get_style", "honua_apply_style_preset", "honua_execute_plan"];
  const authority = request => ({ apiKeyPresent: request.headers["x-api-key"] !== undefined,
    authorizationPresent: request.headers.authorization !== undefined, cookiePresent: request.headers.cookie !== undefined });
  const server = createServer(async (request, response) => {
    if (request.method === "GET") { response.writeHead(405).end(); return; }
    if (request.method === "DELETE") { response.writeHead(200).end(); return; }
    try {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const message = JSON.parse(Buffer.concat(chunks));
      if (message.id === undefined) { response.writeHead(202).end(); return; }
      let result;
      if (message.method === "initialize") {
        assert.equal(request.headers["mcp-session-id"], undefined);
        const session = randomUUID(); sessions.add(session); response.setHeader("mcp-session-id", session);
        assert.equal(request.headers["x-api-key"], authenticated ? credential : undefined);
        initializations.push({ sessionSha256: hash(session), ...authority(request) });
        result = { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "explicit-offline-setup-control", version: "0.0.0" } };
      } else {
        const session = request.headers["mcp-session-id"]; assert.equal(sessions.has(session), true);
        if (message.method === "tools/list") {
          const view = message.params?._meta?.["honua.io/workflow-view"];
          discovery.push({ view, ...authority(request) });
          if (!supported) {
            response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id: message.id,
              error: { code: -32602, message: "Controlled unsupported workflow view", data: { code: "invalid_argument" } } }));
            return;
          }
          result = { tools: view === (authenticated ? "full" : "setup") ? names.map(name => ({ name, inputSchema: { type: "object", additionalProperties: true } })) : [] };
        } else if (message.method === "tools/call") {
          assert.equal(names.includes(message.params.name), true);
          assert.equal(request.headers["x-api-key"], authenticated ? credential : undefined);
          invocations.push({ name: message.params.name, arguments: message.params.arguments, sessionSha256: hash(session), ...authority(request) });
          const message_ = authenticated ? "Controlled authenticated arguments refused" : "Controlled anonymous invocation refused";
          const denied = { status: "error", code: authenticated ? "invalid_argument" : "unauthenticated", message: message_,
            ...(!authenticated ? { requiresReauthentication: true } : {}),
            error: { kind: authenticated ? "InvalidArgument" : "AuthorizationDenied", message: message_ } };
          result = { isError: true, structuredContent: denied, content: [{ type: "text", text: JSON.stringify(denied) }] };
        } else throw new Error("unexpected controlled method");
      }
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
    } catch { response.writeHead(400).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}/mcp`, clients = [];
  try {
    for (const name of names) {
      verifiedFixtureSource();
      const client = await launchCanonicalClient({ installationRoot, selector: "inspector", endpoint, method: "tools/call",
        params: { name, arguments: name === "honua_get_style" ? {} : { controlled: "no candidate mutation" } }, authenticated, credential });
      clients.push({ name, exitCode: client.exitCode, version: client.version, stdoutSha256: hash(client.stdout), stderrSha256: hash(client.stderr) });
      if (supported) assert.equal(client.exitCode, 5);
      else assert.notEqual(client.exitCode, 0);
      assert.equal(client.exitSignal, null);
      assert.equal(client.timedOut, false);
      if (supported) {
        const output = JSON.parse(client.stdout); const result = output.result ?? output;
        assert.equal(result.isError, true);
        assert.equal(result.structuredContent.code, authenticated ? "invalid_argument" : "unauthenticated");
      }
    }
    assert.deepEqual(invocations.map(item => item.name), supported ? names : []);
    if (supported) {
      assert.deepEqual(invocations.find(item => item.name === "honua_get_style").arguments, {});
      for (const item of invocations.filter(item => item.name !== "honua_get_style")) assert.deepEqual(item.arguments, { controlled: "no candidate mutation" });
    }
    assert.equal(initializations.length, names.length);
    assert.equal(new Set(initializations.map(item => item.sessionSha256)).size, names.length);
    assert.equal(new Set(invocations.map(item => item.sessionSha256)).size, supported ? names.length : 0);
    assert.ok(discovery.length >= names.length && discovery.every(item => item.view === (authenticated ? "full" : "setup")));
    for (const item of [...initializations, ...invocations, ...discovery]) {
      assert.equal(item.apiKeyPresent, authenticated); assert.equal(item.authorizationPresent, false); assert.equal(item.cookiePresent, false);
    }
    const directory = fileURLToPath(new URL("../artifacts/", import.meta.url)); mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, `inspector.ingest-publish-${authenticated ? "authenticated" : "anonymous"}-${supported ? "supported" : "unsupported"}.installed-client-control.json`), JSON.stringify({
      schema: "honua.mcp-installed-client-control/v1", controlPeer: "explicit-offline-setup-control", candidateQualified: false,
      sourceSha: source.sourceSha, authenticated, initializations, invocations, discovery, clients,
    }, null, 2) + "\n");
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
