// Inspector's public CLI uses 0 for successful tool calls and 5 for tool errors.
// A parseable response alone cannot prove that the installed client succeeded.
export function requireInspectorSemanticResult(check, output) {
  const expected = output?.isError === true ? 5 : 0;
  if (check.result !== "pass" || check.inspectorExitCode !== expected
      || check.inspectorExitSignal || check.inspectorTimedOut) {
    throw new Error("Inspector semantic call did not complete with its expected public CLI outcome");
  }
  return output;
}
