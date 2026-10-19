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
older MCP client versions: pin convergence is tracked under honua-release#181
and the honua-release#652 audit rollup.
It is not evidence that the current producer has qualified the release. Raw SDK
and Inspector result JSON is retained even when governed fragment construction
refuses the mismatched catalog, so blocked/failing checks remain inspectable.

The real SDK runner checks the implemented manifest against the live tool roster,
sends a missing-tool call with the authenticated API key, and separately invokes
a protected tool without credentials to require the typed reauthentication
refusal with no data. Negative controls drive the actual official SDK over a
controlled HTTP server, including deliberately broken success responses.

Full-roster parity explicitly selects `honua.io/workflow-view=full` in request
metadata through the official SDK and Inspector's public `--metadata` option.
Both clients must retain that selection through every catalog page. The server's
bounded default discovery view remains unchanged, including the anonymous tool
refusal scenario. Wire controls serve a small default view and a three-page
authenticated catalog, and require a missing manifest tool to fail parity.

The thin SDK adapter consumes the server-owned cancellation scenario and PostGIS
observer from `honua-server/tests/mcp-certification`, not from a copied runtime
harness here. The maintained immutable-source fetcher authenticates canonical
protected trunk ancestry, every Git blob and both content hashes at the exact
attested candidate source. The adapter rechecks the retained runtime bytes before
import. Missing/mismatched helpers and stale cached destinations refuse; no local
or floating fallback can qualify. `cancellation-proof.mjs` is a pure receipt
validator and imports no runtime or subprocess module.

The server-owned SDK scenario uses its public `notification` method while keeping
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
cessation. With the configured observer and complete database bindings above,
authenticated server-owned helpers and installed browser dependencies, the
Inspector adapter drives its public web UI's Execute Tool and Cancel actions.
Its separate proof contract requires the genuine correlated cancellation
notification, the original upstream request remaining open, a typed terminal
response, independent PostGIS cessation before blocker release, unchanged rows,
recovery readback and owned cleanup. The actual initialized protocol and authored
fixture must match the retained proof. Local UI cancellation alone cannot pass;
the SDK's separate proof still forbids AbortSignal cancellation. Missing observer
configuration skips; configured helper, wire or database failures fail the
scenario and cannot emit a passing receipt. Positive execution against the
selected Honua candidate remains unqualified.

The pinned Inspector CLI has no one-shot ping and rejects missing tool names
locally before sending a call, so those operations remain incomplete rather than
counted as successful wire assertions. Its protected-tool authentication probe
uses an anonymous session and validates the actual typed tool refusal.

The producer matches the existing governed catalog: 41 operations per client,
82 rows in total. The retired `propose_operation` is a known gap in the published
vocabulary and is already absent from that catalog; it is not a required runtime
operation. Tests construct their expected catalog independently from the
published vocabulary, so a stale producer entry cannot validate itself.
Most tool/resource workflows still
need executable semantic scenarios and candidate evidence under geospatial-mcp#95
and honua-release#123/#652.
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
read. The builder also requires each client's cessation proof to use the same
authored seed and allocated-ID hashes. Missing candidate cancellation or
pagination evidence cannot pass those floors; Inspector's initial ping and
unknown-tool wire-error scenarios also remain incomplete and prevent a full lane
pass. General tool/resource workflows remain incomplete.

`npm test` runs canonical SDK adapter, immutable-helper binding and pure
proof-consumer controls here. When the exact candidate contains the server-owned
harness, the workflow also runs its retained installed-SDK wire controls and
`test/postgres-observer.integration.mjs` against a disposable owned database.
These prove the observer's real blocking, SQL cancellation, lock release and row
checks, including an unrelated public-table decoy beside the authored `honua`
fixture. Harness controls never emit candidate certification rows and do not
substitute for the SDK-to-Honua scenario. A positive candidate run requires an
immutable attested server image containing honua-server#6325; the existing default
image at source `3ecd214c1ce20e96ad4911b6f8447055dee9089d` predates that runtime
change and this server-owned harness. This implementation changes no image pin,
capability baseline or governed qualification state. Request cancellation is a
behavior of the already-required `ai.mcp-discovery` query surface; the server's
authoritative capability catalog declares no separate cancellation capability.

The Inspector pagination adapter consumes the independently observed public CLI
page chain from the same verified server source (`inspector-pagination.mjs`,
server6338). It requires a multi-page cursor traversal and a final returned
resource list matching the wire, then the pure fragment consumer rechecks the
candidate source, actual installed Inspector version, completion and bounded
counts/hashes. Missing/tampered helpers stay nonpassing; there is no local copy.
The owning server controls run the actual installed 2.10.1 CLI and web UI. They
do not qualify governed 2.3.0 or clear the
remaining Inspector initial-ping and unknown-tool addressability gaps. Browser
cancellation controls establish the public path against an authored peer, not
candidate qualification. A fresh image alone still cannot make the canonical
lane green.

Entity grounding calls `honua_resolve_entity` through each installed canonical
client using the candidate-bound authored service name and ID. Exact identity,
ranking, count and JSON representations must agree. A missing name must return
no matches; an invalid limit must preserve the typed server refusal. All four
raw request/response pairs are retained, including failed or partial attempts.
The fragment builder rejudges those observations and still requires the same
candidate, seed and global behavior evidence before admitting either row.
