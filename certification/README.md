# MCP certification producer

Run `npm ci --ignore-scripts` and `npm test` from this directory. Set
`HONUA_RELEASE_CHECKER` to the unchanged `tools/check_protocol_certification.py`
from the selected immutable honua-release revision to also run the real
producer-to-consumer receipt controls.

The workflow fetches and retains that revision's governed requirements catalog.
Release dispatches require its exact `requirements_revision`; `requirements_ref`
is a full commit, never a branch. Before fetching executable checker bytes, the
maintained fetcher verifies the canonical repository, protected default trunk,
source ancestry, full source tree, unique Git blobs, byte lengths and Git/SHA256
hashes. Default bytes also match reviewed file pins; overrides require an exact
source/revision pair and the same protected-history floor. This matches the
SDK receipt producer's reviewed governance-fetch contract. `build-fragment.mjs INPUT OUTPUT REQUIREMENTS`
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

The SDK cancellation scenario uses its public `notification` method while keeping
the original `callTool` request open. It observes the SDK's actual integer wire ID
and stateful session, blocks the authored feature query using an independently
owned PostGIS relation lock, and requires a correlated typed `-32800` cancellation
response. Separate database connections must observe the blocked backend stop and
release its relation locks **before** the blocker transaction is rolled back.
Wrong-session and string-versus-integer ID notifications must leave that original
request and database work blocked through at least 600 ms each; the server's
cross-replica cancellation polling interval is 200 ms. Unchanged authored rows,
successful recovery readback, and independent owned cleanup are mandatory.

This observer is enabled only for the workflow's owned loopback database using
`HONUA_MCP_CANCELLATION_OBSERVER=postgres-lock-v1` and explicit
`HONUA_MCP_OBSERVER_PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, and
`PGSERVER_APP_NAME` suffixes under `HONUA_MCP_OBSERVER_`. The server connection's
application name must equal that observer binding. Independent service/layer
metadata must bind the authored layer to `honua.features` or `public.features`
with its exact maintained key/geometry columns; the blocker, row snapshot and
lock oracle all use that same qualified relation. An unrelated public table or
another fixture schema cannot substitute for it. The database password is the
workflow's masked per-run service password; it is never emitted in proof JSON.
The blocker expires after 30 seconds, individual observer commands have a
3-second process budget, provider discovery has an 8-second budget, and response
and cessation observations each have a 5-second budget. Failure continues owned
cleanup and emits no passing proof. Unconfigured observers explicitly skip.

Neither a local AbortSignal rejection nor killing Inspector proves server
cessation. Inspector cancellation remains incomplete and explicitly skips,
making its runner exit nonzero; the builder emits no passing receipt for it.
The pinned Inspector CLI also has no one-shot ping and rejects missing tool names
locally before sending a call, so those operations are incomplete rather than
counted as successful wire assertions. Its protected-tool authentication probe
uses an anonymous session and validates the actual typed tool refusal.

The 84-row operation denominator is preserved. Most tool/resource workflows still
need executable semantic scenarios, including Inspector cancellation and
independent mutation/readback, under geospatial-mcp#95 and honua-release#123/#652.
A green synthetic/unit check is never candidate certification. The workflow's
retained fragment, source/image binding, required facets, and final release gate
must all pass against the selected candidate.

The bounded read scenarios now invoke `honua_list_capabilities`,
`honua_list_layers`, and `honua_query_features` through each real canonical client.
They inspect typed discovery metadata, the authored service/layer, and the exact
alpha/beta feature IDs, integer attributes and point coordinates. Positive and
typed-negative calls remain mandatory. The oracle binds the exact candidate seed
SQL and separately captured allocated database IDs; arbitrary layer discovery,
cross-adapter agreement, or empty/partial feature responses do not establish proof.
The builder requires this candidate/source/hash binding before admitting a semantic
read. The builder also requires the SDK cessation proof to use the same authored
seed and allocated-ID hashes. Inspector cancellation and pagination floors still
prevent a full lane pass. General tool/resource workflows remain incomplete.

`npm test` runs controlled-peer installed-SDK wire and proof-consumer negatives;
they are harness controls and never candidate evidence. The workflow separately
runs `node --test test/postgres-observer.integration.mjs` against a disposable
owned database to prove actual blocking, SQL cancellation, lock release and row
checks by the observer, including an unrelated public-table decoy beside the
authored `honua` fixture. That test is not included in certification rows and does
not substitute for the SDK-to-Honua scenario. A positive candidate run requires an
immutable attested server image containing honua-server#6325; the existing default
image at source `3ecd214c1ce20e96ad4911b6f8447055dee9089d` predates that runtime
change. This implementation changes no image pin or governed qualification state.
