// Assertions shared by real certification drivers and deliberately broken-client controls.
export const MISSING_TOOL = "__certification_missing_tool__";

export function toolOutput(result) {
  if (!result || typeof result !== "object" || (result.isError !== undefined && typeof result.isError !== "boolean")) {
    throw new Error("malformed MCP tool result");
  }
  if (result.structuredContent && typeof result.structuredContent === "object") return result.structuredContent;
  const text = result.content?.filter((item) => item.type === "text");
  if (text?.length !== 1) throw new Error("missing unique structured tool output");
  return JSON.parse(text[0].text);
}

export async function missingTool(client) {
  let failure;
  let result;
  try { result = await client.callTool({ name: MISSING_TOOL, arguments: {} }); }
  catch (error) { failure = error; }
  if (failure) {
    if (failure.code !== -32602 || failure.data?.code !== "invalid_argument"
        || !String(failure.message).includes(MISSING_TOOL)) throw new Error("missing tool did not produce typed unknown-tool error");
    return { rejected: true, protocolCode: failure.code, code: failure.data.code };
  }
  const output = toolOutput(result);
  if (result.isError !== true || output.code !== "not_found" || output.status !== "error") {
    throw new Error("missing tool unexpectedly succeeded or returned an unrelated error");
  }
  return { rejected: true, code: output.code };
}

export async function authenticationDenial(client) {
  const result = await client.callTool({ name: "honua_list_layers", arguments: {} });
  const output = toolOutput(result);
  if (result.isError !== true || output.status !== "error" || output.code !== "unauthenticated"
      || output.requiresReauthentication !== true || output.features || output.layers || output.resourceUri) {
    throw new Error("anonymous tool call did not return the typed reauthentication refusal without data");
  }
  return { rejected: true, code: output.code, requiresReauthentication: true };
}

export async function collectPages(call, field, project, limit = 100) {
  const values = [];
  const cursors = new Set();
  let cursor;
  do {
    if (cursors.size >= limit) throw new Error("MCP pagination exceeded its bounded page budget");
    const page = await call(cursor ? { cursor } : undefined);
    if (!Array.isArray(page[field])) throw new Error(`MCP page is missing ${field}`);
    values.push(...page[field].map(project));
    cursor = page.nextCursor;
    if (cursor !== undefined) {
      if (typeof cursor !== "string" || !cursor || cursors.has(cursor)) throw new Error("MCP repeated or malformed cursor");
      cursors.add(cursor);
    }
  } while (cursor);
  return values;
}

export function assertToolRoster(names, expectedNames) {
  if (!names.length || new Set(names).size !== names.length || names.some((name) => typeof name !== "string" || !name)) {
    throw new Error("empty, duplicate or malformed live tool roster");
  }
  const missing = expectedNames.filter((name) => !names.includes(name));
  if (missing.length) throw new Error(`live tools/list is missing implemented manifest tools: ${missing.join(", ")}`);
  return { names, paginationCompleted: true, manifestParity: true };
}
