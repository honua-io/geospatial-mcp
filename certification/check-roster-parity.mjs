// Roster parity: every `implemented` tool in spec/schemas/index.json must name a
// referenceToolName the reference server actually composes, per the server's
// committed MCP tool roster (honua-server docs/gis/data/mcp-tool-roster.v1.json)
// at the pinned/candidate source SHA. The advertised set is static ∪ projectedAdmin.
//
// Usage: node check-roster-parity.mjs <index.json> <roster.json | -> [--absent]
//   --absent  the roster is not published at the server SHA; report `blocked`.
// Exit codes: 0 pass, 1 parity failure, 3 blocked (roster not published).
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const toolName = (entry) => (typeof entry === "string" ? entry : entry?.name ?? entry?.toolName);

export function rosterNames(roster) {
  for (const key of ["static", "projectedAdmin"]) {
    if (!Array.isArray(roster?.[key])) throw new Error(`roster is missing the '${key}' array`);
  }
  const names = new Set();
  for (const entry of [...roster.static, ...roster.projectedAdmin]) {
    const name = toolName(entry);
    if (typeof name !== "string" || name.length === 0) throw new Error(`roster entry has no tool name: ${JSON.stringify(entry)}`);
    names.add(name);
  }
  return names;
}

export function checkRosterParity(index, roster) {
  if (roster === null || roster === undefined) {
    return { status: "blocked", reason: "blocked: roster not published at pinned sha", missing: [] };
  }
  const advertised = rosterNames(roster);
  const implemented = (index.tools ?? []).filter((tool) => tool.implementationStatus === "implemented");
  const missing = implemented
    .filter((tool) => !advertised.has(tool.referenceToolName))
    .map((tool) => ({ standardName: tool.standardName, referenceToolName: tool.referenceToolName ?? null }));
  return {
    status: missing.length === 0 ? "pass" : "fail",
    reason: missing.length === 0
      ? `all ${implemented.length} implemented referenceToolNames are in static ∪ projectedAdmin`
      : `${missing.length} implemented referenceToolName(s) are not in static ∪ projectedAdmin`,
    serverSha: roster.serverSha ?? null,
    checked: implemented.length,
    missing,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [indexPath, rosterPath, flag] = process.argv.slice(2);
  if (!indexPath || !rosterPath) {
    console.error("usage: node check-roster-parity.mjs <index.json> <roster.json> [--absent]");
    process.exit(2);
  }
  const index = JSON.parse(readFileSync(indexPath, "utf8"));
  const roster = flag === "--absent" ? null : JSON.parse(readFileSync(rosterPath, "utf8"));
  const result = checkRosterParity(index, roster);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === "pass" ? 0 : result.status === "blocked" ? 3 : 1;
}
