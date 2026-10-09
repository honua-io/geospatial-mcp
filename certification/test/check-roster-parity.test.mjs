import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkRosterParity, rosterNames } from "../check-roster-parity.mjs";

const index = {
  tools: [
    { standardName: "list_capabilities", referenceToolName: "honua_list_capabilities", implementationStatus: "implemented" },
    { standardName: "ops_health", referenceToolName: "honua_ops_health", implementationStatus: "implemented" },
    { standardName: "propose_operation", referenceToolName: null, implementationStatus: "known-gap" },
  ],
};

test("passes when every implemented referenceToolName is in static ∪ projectedAdmin", () => {
  const roster = { serverSha: "a".repeat(40), static: ["honua_list_capabilities"], projectedAdmin: [{ name: "honua_ops_health" }] };
  const result = checkRosterParity(index, roster);
  assert.equal(result.status, "pass");
  assert.equal(result.checked, 2);
});

test("fails and names the implemented tool the roster does not advertise", () => {
  const roster = { static: ["honua_list_capabilities"], projectedAdmin: [], retired: ["honua_ops_health"] };
  const result = checkRosterParity(index, roster);
  assert.equal(result.status, "fail");
  assert.deepEqual(result.missing, [{ standardName: "ops_health", referenceToolName: "honua_ops_health" }]);
});

test("known-gap entries are not checked against the roster", () => {
  const roster = { static: ["honua_list_capabilities", "honua_ops_health"], projectedAdmin: [] };
  assert.equal(checkRosterParity(index, roster).status, "pass");
});

test("an absent roster is reported as blocked, never as a pass", () => {
  const result = checkRosterParity(index, null);
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "blocked: roster not published at pinned sha");
});

test("a malformed roster is an error, not a silent pass", () => {
  assert.throws(() => rosterNames({ static: [] }), /projectedAdmin/);
  assert.throws(() => rosterNames({ static: [{}], projectedAdmin: [] }), /no tool name/);
});

test("the published index no longer marks the retired propose_operation as implemented", () => {
  const published = JSON.parse(readFileSync(new URL("../../spec/schemas/index.json", import.meta.url), "utf8"));
  const entry = published.tools.find((tool) => tool.standardName === "propose_operation");
  assert.equal(entry.implementationStatus, "known-gap");
  assert.equal(entry.referenceToolName, null);
  assert.ok(!published.tools.some((tool) => tool.referenceToolName === "honua_propose_operation"));
});
