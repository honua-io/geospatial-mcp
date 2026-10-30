// Assertions shared by real certification drivers and deliberately broken-client controls.
import { isDeepStrictEqual } from "node:util";

export const MISSING_TOOL = "__certification_missing_tool__";
// Inspector 2.10.1 resolves --tool-name against tools/list and never sends
// tools/call for an unlisted name. The server error proof uses a listed tool.
export const INSPECTOR_SERVER_ERROR_TOOL = "honua_query_features";

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

export function inspectorServerToolError({ exitCode, stdout, stderr }) {
  const diagnostic = String(stderr ?? "").trim();
  const body = String(stdout ?? "").trim();
  let envelope;
  try { envelope = JSON.parse(diagnostic); }
  catch { throw new Error("Inspector error diagnostic is not a JSON envelope"); }
  const code = envelope?.error?.code;
  const message = envelope?.error?.message;
  // Exit 5 is shared with the CLI's local name check. Empty stdout or
  // tool_not_found means the candidate never saw tools/call.
  if (code === "tool_not_found" || !body) throw new Error("Inspector rejected the tool locally; no server error proof");
  if (exitCode !== 5 || code !== "tool_is_error"
      || message !== `Tool '${INSPECTOR_SERVER_ERROR_TOOL}' returned isError:true.`) {
    throw new Error("Inspector did not report the server tool error");
  }
  let parsed;
  try { parsed = JSON.parse(body); }
  catch { throw new Error("Inspector tool error body is not JSON"); }
  // Inspector 2.10.1 --format json writes {"result": CallToolResult}. A bare
  // CallToolResult is accepted so the probe tests can supply the server body.
  const result = parsed?.isError === undefined && parsed?.result && typeof parsed.result === "object" && !Array.isArray(parsed.result)
    ? parsed.result : parsed;
  if (result?.isError !== true) throw new Error("server tool result was not an error");
  const output = toolOutput(result);
  if (output.status !== "error" || output.code !== "invalid_argument"
      || output.message !== "'serviceId' is required."
      || output.error?.kind !== "ValidationFailed" || output.error?.message !== output.message
      || output.features || output.layers || output.resourceUri) {
    throw new Error("server did not reject the incomplete feature query");
  }
  const text = result.content?.filter((item) => item.type === "text");
  if (text?.length !== 1 || !isDeepStrictEqual(JSON.parse(text[0].text), output)) {
    throw new Error("server tool error text did not match structured content");
  }
  return { rejected: true, code: "invalid_argument", tool: INSPECTOR_SERVER_ERROR_TOOL, serverOrigin: true };
}

export async function authenticationDenial(client) {
  const result = await client.callTool({ name: "honua_list_layers", arguments: {} });
  const output = toolOutput(result);
  if (result.isError !== true || output.status !== "error" || output.code !== "unauthenticated"
      || output.requiresReauthentication !== true || output.features || output.layers || output.resourceUri) {
    throw new Error("anonymous tool call did not return the typed reauthentication refusal without data");
  }
  // Certify the refusal envelope, including the secondary content channel. A
  // correct status must not hide returned records in an unexamined field.
  const publicFields = new Set(["status", "code", "message", "requiresReauthentication", "error"]);
  const optionalNullFields = new Set(["approvalRequired", "policyRef", "studioAuthorizationCode", "proposalId", "resourceUri",
    "conflictingJobId", "currentGeneration", "retryable", "missingDependency", "missingEntitlement", "capability",
    "remediation", "remediationRef", "violations"]);
  if (Object.entries(output).some(([key, value]) => !publicFields.has(key) && !(optionalNullFields.has(key) && value === null))
      || (output.message !== undefined && typeof output.message !== "string")) {
    throw new Error("anonymous refusal returned unexpected fields or data");
  }
  if (output.error != null && (typeof output.error !== "object" || Array.isArray(output.error)
      || Object.entries(output.error).some(([key, value]) =>
        ["kind", "message"].includes(key) ? typeof value !== "string" : !["stepId", "violations"].includes(key) || value !== null))) {
    throw new Error("anonymous refusal returned unexpected nested error data");
  }
  if (Object.keys(result).some((key) => !["isError", "structuredContent", "content", "_meta"].includes(key))
      || (result._meta != null && (typeof result._meta !== "object" || Object.keys(result._meta).length !== 0))
      || (result.content !== undefined && (!Array.isArray(result.content) || result.content.length > 1
        || result.content.some((item) => item.type !== "text" || Object.keys(item).some((key) => !["type", "text"].includes(key))
          || !isDeepStrictEqual(JSON.parse(item.text), output))))) {
    throw new Error("anonymous refusal returned secondary content or metadata");
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
