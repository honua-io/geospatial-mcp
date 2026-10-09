import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const repoRoot = new URL("../../", import.meta.url);
const workflow = readFileSync(new URL(".github/workflows/protocol-certification.yml", repoRoot), "utf8");

const pinned = (name) => {
  const line = workflow.split(/\r?\n/).map((text) => text.trim()).find((text) => text.startsWith(`${name}:`));
  const value = line?.slice(name.length + 1).trim().replace(/^"|"$/g, "");
  assert.match(value ?? "", /^[0-9a-f]{40}$/, `${name} is not pinned to a git tree hash in protocol-certification.yml`);
  return value;
};

const tree = (path) =>
  execFileSync("git", ["rev-parse", `HEAD:${path}`], { cwd: repoRoot, encoding: "utf8" }).trim();

test("CONFORMANCE_CORPUS_TREE matches the committed conformance/ tree", () => {
  assert.equal(pinned("CONFORMANCE_CORPUS_TREE"), tree("conformance"),
    "conformance/ changed: set CONFORMANCE_CORPUS_TREE in protocol-certification.yml to `git rev-parse HEAD:conformance`");
});

test("SPEC_TREE matches the committed spec/ tree", () => {
  assert.equal(pinned("SPEC_TREE"), tree("spec"),
    "spec/ changed: set SPEC_TREE in protocol-certification.yml to `git rev-parse HEAD:spec`");
});
