import assert from "node:assert/strict";
import test from "node:test";
import { authenticationDenial, assertToolRoster, collectPages, missingTool, MISSING_TOOL } from "../probes.mjs";

const call = (result) => ({ callTool: async () => result });
const errorResult = (code, extra = {}) => ({ isError: true, structuredContent: { status: "error", code, ...extra } });

test("unknown tool requires the typed protocol failure and never catches its own success sentinel", async () => {
  for (const result of [{ content: [] }, { isError: false, structuredContent: {} }, errorResult("unauthenticated"), errorResult("internal")]) {
    await assert.rejects(missingTool(call(result)));
  }
  for (const error of [new Error("network down"), { code: -32602, data: { code: "invalid_argument" }, message: "other argument" }]) {
    await assert.rejects(missingTool({ callTool: async () => { throw error; } }));
  }
  const client = { callTool: async () => { throw { code: -32602, data: { code: "invalid_argument" }, message: `Unknown MCP tool '${MISSING_TOOL}'` }; } };
  assert.deepEqual(await missingTool(client), { rejected: true, protocolCode: -32602, code: "invalid_argument" });
});

test("auth probe invokes a protected tool and requires typed denial with no data", async () => {
  let request;
  const denied = errorResult("unauthenticated", { requiresReauthentication: true });
  assert.equal((await authenticationDenial({ callTool: async (value) => { request = value; return denied; } })).rejected, true);
  assert.equal(request.name, "honua_list_layers");
  for (const result of [{ isError: false, structuredContent: { layers: [] } }, errorResult("permission_denied"),
    errorResult("unauthenticated", { requiresReauthentication: true, layers: [{ id: 1 }] }),
    { ...denied, isError: "true" }, errorResult("unauthenticated", { requiresReauthentication: false })]) {
    await assert.rejects(authenticationDenial(call(result)));
  }
});

test("auth refusal cannot conceal data in nested, secondary or metadata channels", async () => {
  const output = { status: "error", code: "unauthenticated", message: "Authentication required", requiresReauthentication: true,
    resourceUri: null, error: { kind: "unauthenticated", message: "Authentication required", stepId: null, violations: null } };
  const valid = { isError: true, structuredContent: output, content: [{ type: "text", text: JSON.stringify(output) }] };
  assert.equal((await authenticationDenial(call(valid))).rejected, true);
  for (const mutate of [(x) => { x.structuredContent.data = { layers: [{ id: 1 }] }; },
    (x) => { x.structuredContent.error.data = { features: [1] }; }, (x) => { x._meta = { privateData: [1] }; },
    (x) => { x.privateData = [1]; }, (x) => { x.content.push({ type: "text", text: "private data" }); },
    (x) => { x.content[0] = { type: "text", text: JSON.stringify({ ...output, layers: [1] }) }; },
    (x) => { x.content[0] = { type: "image", data: "private", mimeType: "image/png" }; },
    (x) => { x.structuredContent.proposalId = "private-proposal"; }]) {
    const leaked = structuredClone(valid); mutate(leaked);
    await assert.rejects(authenticationDenial(call(leaked)));
  }
});

test("tools/list must match the implemented manifest rather than pass an empty catalog", () => {
  assert.throws(() => assertToolRoster([], ["a"]));
  assert.throws(() => assertToolRoster(["a", "a"], ["a"]));
  assert.throws(() => assertToolRoster(["other"], ["a"]));
  assert.equal(assertToolRoster(["a", "b"], ["a"]).manifestParity, true);
});

test("pagination detects repeated cursors and preserves all actual pages", async () => {
  await assert.rejects(collectPages(async () => ({ tools: [], nextCursor: "again" }), "tools", (x) => x), /repeated/);
  const pages = [{ tools: [1], nextCursor: "second" }, { tools: [2] }];
  assert.deepEqual(await collectPages(async () => pages.shift(), "tools", (x) => x), [1, 2]);
});
