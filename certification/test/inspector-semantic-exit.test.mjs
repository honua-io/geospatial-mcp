import assert from "node:assert/strict";
import test from "node:test";
import { requireInspectorSemanticResult } from "../inspector-semantic-exit.mjs";

for (const [name, output, code] of [["success", { structuredContent: {} }, 0],
  ["typed refusal", { isError: true, structuredContent: { code: "invalid_argument" } }, 5]]) {
  test(`Inspector ${name} requires its matching public CLI exit`, () => {
    const check = { result: "pass", inspectorExitCode: code, inspectorExitSignal: null, inspectorTimedOut: false };
    assert.equal(requireInspectorSemanticResult(check, output), output);
    for (const changed of [{ inspectorExitCode: code === 0 ? 5 : 0 }, { inspectorExitCode: null },
      { inspectorExitSignal: "SIGTERM" }, { inspectorTimedOut: true }, { result: "fail" }]) {
      assert.throws(() => requireInspectorSemanticResult({ ...check, ...changed }, output));
    }
  });
}
