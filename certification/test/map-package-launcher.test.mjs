// Real installed clients, explicit offline protocol fixture. No candidate or
// package semantic credit; this checks async/fresh/public consumption only.
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { verifiedFixtureSource } from "../render-validation.mjs";
const source = verifiedFixtureSource();
const { launchCanonicalClient, verifyInstalledClient } = await import(pathToFileURL(join(source.directory, "mcp_fixed_client_launcher.mjs")).href);
const installationRoot = fileURLToPath(new URL("../node_modules/", import.meta.url));
const invokeClient = (selector) => (method, params, { endpoint, authenticated }, credential) => {
  verifiedFixtureSource();
  return launchCanonicalClient({ installationRoot, selector, endpoint, method, params, authenticated, credential });
};
import { CLIENTS } from "../requirements.mjs";

test("fixed launcher verifies actual named root package and every installed package file", () => {
  for (const selector of ["sdk", "inspector"]) {
    const observed = verifyInstalledClient(installationRoot, selector);
    assert.equal(observed.package.version, CLIENTS[selector].version);
    assert.equal(observed.selected.canonicalClient, CLIENTS[selector].canonicalClient);
    assert.equal(observed.package.fileCount, selector === "sdk" ? 701 : 27);
    assert.match(observed.package.filesSha256, /^sha256:[a-f0-9]{64}$/);
  }
  assert.throws(() => verifyInstalledClient(installationRoot, "unrelated-client"), /selection refused/);
});

for (const [runner, invoke] of [["sdk", invokeClient("sdk")], ["inspector", invokeClient("inspector")]]) {
  test(`actual ${runner} fixed process launches are asynchronous fresh sessions with isolated anonymous authority`, async () => {
    const credential = "controlled-map-client-key", sessions = new Map(), invocations = [], initializations = [];
    const authority = (incoming) => ({ authenticated: incoming.headers["x-api-key"] === credential,
      apiKeyPresent: incoming.headers["x-api-key"] !== undefined,
      authorizationPresent: incoming.headers.authorization !== undefined, cookiePresent: incoming.headers.cookie !== undefined });
    const authored = { templateId: "controlled-template", styleId: "controlled-style", themeId: "controlled-theme",
      sourceBindings: [{ bindingId: "controlled-area", protocol: "geoservices_feature_service", filter: "name = 'block'",
        metadata: { purpose: "actual-client-argument-control" } }], initialView: { bbox: [-90, 0, -45, 60], crs: 4326 } };
    const server = createServer(async (incoming, outgoing) => {
      if (incoming.method === "GET") { outgoing.writeHead(405).end(); return; }
      if (incoming.method === "DELETE") { outgoing.writeHead(200).end(); return; }
      try {
        const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
        const message = JSON.parse(Buffer.concat(chunks));
        if (message.id === undefined) { outgoing.writeHead(202).end(); return; }
        let result, error;
        if (message.method === "initialize") {
          assert.equal(incoming.headers["mcp-session-id"], undefined);
          const session = randomUUID(); sessions.set(session, true);
          initializations.push({ session, ...authority(incoming) });
          outgoing.setHeader("mcp-session-id", session);
          result = { protocolVersion: "2025-06-18", capabilities: { tools: {}, resources: {} },
            serverInfo: { name: "explicit-offline-client-control", version: "0.0.0" } };
        } else {
          const session = incoming.headers["mcp-session-id"];
          assert.equal(sessions.has(session), true);
          if (message.method === "tools/list") result = { tools: [{ name: "honua_create_map_package",
            inputSchema: { type: "object", additionalProperties: true } }] };
          else if (message.method === "tools/call") {
            assert.deepEqual(message.params.arguments, authored, "all five nested JSON arguments must reach the actual peer unchanged");
            invocations.push({ session, method: message.method, ...authority(incoming) });
            if (incoming.headers["x-api-key"] === credential) result = { content: [{ type: "text", text: "controlled callback transport only" }] };
            else error = { code: -32000, message: "Controlled creation requires authentication", data: {
              code: "unauthenticated", requiresReauthentication: true } };
          } else if (message.method === "resources/read") {
            invocations.push({ session, method: message.method, ...authority(incoming) });
            error = incoming.headers["x-api-key"] === credential
              ? { code: -32002, message: "Controlled package missing", data: { code: "not_found" } }
              : { code: -32000, message: "Controlled package requires authentication", data: { code: "unauthenticated", requiresReauthentication: true } };
          } else result = {};
        }
        outgoing.writeHead(200, { "content-type": "application/json" });
        outgoing.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, ...(error ? { error } : { result }) }));
      } catch {
        outgoing.writeHead(500).end();
      }
    });
    try {
      await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
      const endpoint = `http://127.0.0.1:${server.address().port}/mcp`;
      const created = await invoke("tools/call", { name: "honua_create_map_package", arguments: authored },
        { endpoint, authenticated: true }, credential);
      const anonymousTool = await invoke("tools/call", { name: "honua_create_map_package", arguments: authored },
        { endpoint, authenticated: false }, credential);
      const unknown = await invoke("resources/read", { uri: "honua://map-packages/map_missing" }, { endpoint, authenticated: true }, credential);
      const anonymous = await invoke("resources/read", { uri: "honua://map-packages/map_missing" }, { endpoint, authenticated: false }, credential);
      assert.equal(initializations.length, 4);
      assert.equal(new Set(initializations.map((item) => item.session)).size, 4);
      assert.deepEqual(initializations.map((item) => item.authenticated), [true, false, true, false]);
      assert.deepEqual(invocations.map((item) => item.authenticated), [true, false, true, false]);
      for (const index of [1, 3]) {
        for (const observation of [initializations[index], invocations[index]]) {
          assert.equal(observation.apiKeyPresent, false);
          assert.equal(observation.authorizationPresent, false); assert.equal(observation.cookiePresent, false);
        }
      }
      const outcomes = [created, anonymousTool, unknown, anonymous];
      const publicSession = ({ session, ...rest }) => ({ ...rest,
        sessionSha256: `sha256:${createHash("sha256").update(session).digest("hex")}` });
      const receipt = { qualification: "Explicit offline installed-client control; no candidate or operation-semantic qualification",
        runner, outcomes, initializations: initializations.map(publicSession), invocations: invocations.map(publicSession) };
      assert.equal(JSON.stringify(receipt).includes(credential), false);
      const artifacts = fileURLToPath(new URL("../artifacts/", import.meta.url));
      mkdirSync(artifacts, { recursive: true });
      writeFileSync(join(artifacts, `${runner}.installed-client-control.json`), JSON.stringify(receipt, null, 2) + "\n");
      for (const value of outcomes) {
        assert.equal(value.canonicalClient, CLIENTS[runner].canonicalClient);
        assert.equal(value.version, CLIENTS[runner].version);
        assert.equal(value.requestUrl, endpoint);
        assert.equal(JSON.stringify(value).includes(credential), false);
        assert.equal(value.launch.processId, value.processId);
        assert.equal(value.launch.request.endpoint, endpoint);
        assert.equal(value.launch.package.version, CLIENTS[runner].version);
        assert.equal(value.launch.selector, runner);
      }
      assert.equal(new Set(outcomes.map((item) => item.processId)).size, 4);
      if (runner === "sdk") {
        assert.equal(unknown.output.error.code, -32002);
        assert.equal(anonymousTool.output.error.data.requiresReauthentication, true);
        assert.equal(anonymous.output.error.data.requiresReauthentication, true);
        assert.equal(new Set(outcomes.map((item) => item.sessionSha256)).size, 4);
      } else {
        assert.equal(created.exitCode, 0);
        assert.equal(unknown.exitCode, 1, unknown.stderr);
        assert.ok([1, 3].includes(anonymous.exitCode));
        assert.ok([1, 3].includes(anonymousTool.exitCode));
        assert.equal(anonymousTool.stdout, "");
        assert.match(anonymousTool.stderr, /Controlled creation requires authentication/);
        assert.equal(unknown.stdout, "");
        assert.match(unknown.stderr, /Controlled package missing/);
        assert.match(anonymous.stderr, /Controlled package requires authentication/);
        assert.equal(new Set(outcomes.map((item) => item.processId)).size, 4);
        assert.ok(outcomes.every((item) => item.exitSignal === null && item.timedOut === false));
      }
    } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  });
}
