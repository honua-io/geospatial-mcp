# MCP certification producer

Run `npm ci --ignore-scripts` and `npm test` from this directory. Set
`HONUA_RELEASE_CHECKER` to the unchanged `tools/check_protocol_certification.py`
from the selected immutable honua-release revision to also run the real
producer-to-consumer receipt controls.

The workflow fetches and retains that revision's governed requirements catalog.
Release dispatches require its exact `requirements_revision`; `requirements_ref`
is a full commit, never a branch. `build-fragment.mjs INPUT OUTPUT REQUIREMENTS`
requires one matching governed row for every declared operation/client/version,
including its maturity, tier, facets, and fixture/contract/auth policy revisions.
Receipt v2 records that producer-owned context. Missing, duplicate, stale-version,
or incompatible context fails closed. The current default catalog still pins
older MCP client versions: pin convergence is tracked under honua-release#652.
It is not evidence that the current producer has qualified the release. Raw SDK
and Inspector result JSON is retained even when governed fragment construction
refuses the mismatched catalog, so blocked/failing checks remain inspectable.

The real SDK runner checks the implemented manifest against the live tool roster,
sends a missing-tool call with the authenticated API key, and separately invokes
a protected tool without credentials to require the typed reauthentication
refusal with no data. Negative controls drive the actual official SDK over a
controlled HTTP server, including deliberately broken success responses.

Cancellation remains incomplete: neither aborting before dispatch nor killing
Inspector proves the candidate stopped in-flight work. Those checks explicitly
skip and make the runner exit nonzero; the builder emits no passing receipt.
The pinned Inspector CLI also has no one-shot ping and rejects missing tool names
locally before sending a call, so those operations are incomplete rather than
counted as successful wire assertions. Its protected-tool authentication probe
uses an anonymous session and validates the actual typed tool refusal.

The 84-row operation denominator is preserved. Most tool/resource workflows still
need executable semantic scenarios, including server-observed cancellation and
independent mutation/readback, under geospatial-mcp#95 and honua-release#123/#652.
A green synthetic/unit check is never candidate certification. The workflow's
retained fragment, source/image binding, required facets, and final release gate
must all pass against the selected candidate.
