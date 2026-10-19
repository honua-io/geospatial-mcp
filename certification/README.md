# MCP certification producer

From a clean checkout, authenticate `gh` (or set `GH_TOKEN` with read access to
the protected honua-release repository), then run from this directory:

```sh
npm ci --ignore-scripts
npm run prepare:plan
npm run prepare:render
npm test
```

`prepare:plan` fetches the exact protected-history release module, Python oracle
and authored fixture declared in `plan-validation-pins.json`, and verifies all
Git and SHA256 identities. It must finish before the Node suite or either client
adapter imports the verified module. Missing authentication, unavailable source,
unreviewed ancestry or altered bytes fail closed; no cached or mutable fallback
is accepted. The Python fetch controls use controlled offline API fixtures and
never execute their dummy bytes. The workflow separately exercises this real
protected-source provisioning before the complete installed-client controls.

`prepare:render` applies that same protected-history and byte verification to the
complete eight-file render scenario, PNG oracle and fixture setup dependency set
declared in `render-validation-pins.json`. Every dependency is checked again
before setup or client execution. The release-owned setup independently reads
the actual running container's image digest and OCI source revision, seeds and
publishes the authored polygon on the owned disposable candidate, reads its
PostGIS envelope/SRID/type, and binds the canonical service/publication IDs to
the allocated storage layer, connection and table. The retained
`artifacts/render-bootstrap.json` contains identities and safe failure phases,
never setup credentials. Failed setup prevents render calls and remains nonpass.
The release-owned scenario rechecks the actual container before and after each
client's calls and retains both observations; changed container/image/start
identity cannot inherit the bootstrap's source attribution.

Both actual clients call the release-owned authored inline PNG render plus
reversed-bbox and unknown-owned-layer cases. Raw full/partial tool envelopes are
retained beside each result as `.render-validation.raw.json`. The producer
rejudges the original observations with the same pinned oracle and bootstrap;
matching image media, schema and authored-coordinate pixels are required.
The default resource-link response and subsequent artifact fetch remain an
explicit coverage gap. These controls add no governed rows or candidate credit
when catalog, requirements or global behavior gates fail.

Set `HONUA_RELEASE_CHECKER` to the unchanged `tools/check_protocol_certification.py`
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

The `validate_plan` semantic pair uses the release-owned pure helper and authored
metric buffer fixture, retained through `fetch-plan-validation.py` at the exact
reviewed `plan-validation-pins.json` source. Protected-trunk ancestry and all
three Git blobs are verified before execution; the default requirement-catalog
pins remain independent. The release-owned `mcp_plan_validation.mjs` executes
through the existing installed-client callbacks; this repository retains only
the verified bridge and evidence consumer. The actual installed SDK and
Inspector each submit the valid plan
and a copy with only WKB corrupted. Both raw outputs survive oracle failure in
`*.plan-validation.raw.json`. The shared helper requires the complete published
validation output schema, executable/no-approval success and actionable typed
invalid-WKB rejection. `build-fragment.mjs` reruns that same oracle and checks its
source, fixture and candidate binding before admitting this one operation. All
82 governed rows and existing authentication/error/cancellation/pagination gates
remain required; this producer does not submit a GP job or qualify missing rows.
Entity grounding calls `honua_resolve_entity` through each installed canonical
client using the candidate-bound authored service name and ID. Exact identity,
ranking, count and JSON representations must agree. A missing name must return
no matches; an invalid limit must preserve the typed server refusal. All four
raw request/response pairs are retained, including failed or partial attempts.
The fragment builder rejudges those observations and still requires the same
candidate, seed and global behavior evidence before admitting either row.

The map-package journey consumes the same authenticated `npm run prepare:render`
path, extended to twenty files from one protected immutable release revision
(the eight render/setup dependencies plus map-package Python/JavaScript, the
transparent wire observer, fixed launcher/SDK runner, package-file manifest and
three ingest/publication execution/state/oracle files and three canonical-style
execution/state/oracle files). Hashes bind the complete set before import/setup
and each call; no copied or mutable oracle fallback exists. The execution and
judgment remain release-owned. The fixed launcher creates actual SDK and public
Inspector processes and new sessions at the owned observer for every call/read.
Inspector uses asynchronous `spawn` while the observer serves the same event
loop, and a new empty auth/catalog/storage directory prevents inherited
anonymous credentials. Original CLI diagnostics remain separate from original
server wire bytes; numeric errors discarded by Inspector are observer evidence.
Only credential fingerprints (salted scrypt) and session hashes are retained.

This journey checks explicit source selectors/filter/metadata and independently
authored extent, two typed invalid selectors, fresh identifier/lifecycle readback,
unknown URI and fresh anonymous creation/resource refusals. A local Inspector
catalog refusal without the actual tool wire request remains nonpass. The current draft store is bounded per-replica
scratch; restart/another replica may lose it. This does not prove durable save,
full saved-body readback, deployment, catalog/style resolution or live-model
composition. Its raw adapter proof cannot mint an anonymous-public-v1 receipt:
the current governed policy conflicts with authenticated package reads and
remains explicitly nonpassing. All 82 governed rows, installed-versus-selected
client-version mismatch and existing global behavior/cancellation gates remain
required. A historical image run adds adapter evidence only.

Map-package calls and fresh reads use the protected release-owned fixed launcher,
SDK child runner and authenticated npm package-file manifest. This producer
supplies only its installed `node_modules` root and private expected credential;
no raw callback implementation or client-reported identity is selectable. The
launcher records actual child PID/exit and verifies every package file before
and after launch; rejudgment binds its request/output/source identities to wire
observations. These are trusted producer records, not JSON/process attestation.
The installed-package controls run actual SDK/Inspector processes against an
explicit offline protocol fixture and earn no candidate qualification credit.
The public Inspector's anonymous create discovery limitation remains a failure
unless an actual anonymous tools/call server observation exists; local
`tool_not_found` is never typed server refusal evidence. Release issue #695
continues to own policy/cohort/adoption obligations.

The ingest/publication journey runs after both ordinary SDK and Inspector lanes
have closed their sessions, so restarting the disposable candidate cannot break
an earlier bootstrap-bound operation mid-flight. It merges only the three new
operation outcomes into each retained lane, using the actually installed root
package version and the same fixed release-owned launcher. Partial raw evidence
is uploaded even when publication, readback or anonymous invocation fails.

Inline GeoJSON rows/attributes/geometry come from the authored sites fixture.
The exact returned ingest tuple selects publication; missing connection hints
never select the known bootstrap connection instead. Publication physical layer
IDs remain distinct from public indexes returned by a fresh Published service
resource. Queries use that actual resource-returned public index, independently
checked against persisted PostGIS mapping. One committed statement observes data,
mapping and revision; fresh resource/query sessions repeat after an exact owned
container/image/source restart. This first path requires Completed; queued or
approval-pending outcomes remain nonpass and async publication stays open under
release699. This adds no large-cloud-import or hidden-side-effect-exclusion claim.
The protected per-operation auth/cohort policy remains an explicit unmet global
prerequisite; all82 rows and previous behavior requirements remain mandatory.

Canonical style consumption is tracked in #114 and release705. The thin consumer
invokes release-owned authenticated `get_style` / `apply_style_preset` scenarios,
original installed-client wire evidence, independent committed-state census,
authored PNG color/geometry and exact owned-container restart. All executable
setup/scenario/oracle/state code belongs to honua-release. The unchanged82-row
catalog still requires per-operation auth/cohort/global/current-candidate proof;
protected styles cannot satisfy the frozen anonymous-public-v1 policy. Offline
controls and historical source paths never qualify that boundary.
