# MCP certification producer

From a clean checkout, authenticate `gh` (or set `GH_TOKEN` with read access to
the protected honua-release repository), then run from this directory in an
activated Linux CPython 3.12 environment with Node 22.19. These versions mirror
the source-control workflow; the configuration wheel is platform-pinned:

```sh
python3 -m pip install --require-hashes --only-binary=:all: -r ../.github/requirements/mcp-ops.lock
npm ci --ignore-scripts
npm run prepare:plan
npm run prepare:render
npm run prepare:app
npm run prepare:location
npm run prepare:planning
npm run prepare:direct-cancel
npm run prepare:ops-health
npm run prepare:ops-events
npm run prepare:grounding-status
python3 fetch-certification-requirements.py --destination ../.certification
python3 fetch-ops-events-manifest.py --governance-binding ../.certification/source-binding.json --destination artifacts
python3 generate-offline-app-vector.py
python3 generate-offline-location-vector.py
python3 generate-offline-planning-vector.py
python3 generate-offline-direct-cancel-vector.py
python3 generate-offline-ops-health-vector.py
python3 generate-offline-ops-events-vector.py
python3 generate-offline-grounding-status-vector.py
npm test
```

`prepare:location` independently authenticates the complete ten-file location
bundle from protected release source. It preserves the historical render and
execute-plan bundle identities. The release-owned geocode, batch-geocode and
pgRouting scenarios run through both installed clients after each client's
execute-plan journey; every operation is attempted and retained separately.
The receipt builder rejudges coordinates, CRS, country restrictions, ordered
partial batch results, routing edges/cost/directions, actual wire/client/runtime
identity and anonymous refusal. Global behavior, authorization and tier gates
still apply to every row. Missing actual local-provider/network setup remains
non-pass; provisioning is tracked by server #6405/#6407 and country semantics
by server #6409. The vector generator authenticates protected source and creates
explicitly synthetic offline controls only. It never supplies candidate proof.

`prepare:plan` fetches the exact protected-history release module, Python oracle
and authored fixture declared in `plan-validation-pins.json`, and verifies all
Git and SHA256 identities. It must finish before the Node suite or either client
adapter imports the verified module. Missing authentication, unavailable source,
unreviewed ancestry or altered bytes fail closed; no cached or mutable fallback
is accepted. The Python fetch controls use controlled offline API fixtures and
never execute their dummy bytes. The workflow separately exercises this real
protected-source provisioning before the complete installed-client controls.

`prepare:render` applies that same protected-history and byte verification to the
complete 27-file shared scenario, PNG oracle and fixture setup dependency set
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
or incompatible context fails closed. The default catalog at protected commit `7d6a1a0a`, revision
`2026-10-26-complete.26`, pins SDK `1.32.1` and Inspector `2.10.1`, matching
the installed package lock. Its platform manifest names the same server
candidate the workflow pins (`a4bde4b8`), so the ops-events declaration can
bind that image and its managed worker.

Candidate source/image, the original governed manifest, tier and runtime still
require independent agreement; matching client versions does not qualify the
release. Historical receipts for older clients cannot transfer that qualification.
Raw SDK and Inspector result JSON remains retained when context or fragment
construction refuses, so blocked/failing checks stay inspectable.

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
image is the 2026.1 RC re-pin #4 candidate at source
`a4bde4b8c5ee8cc3dec05ad8b3d4f84470c1ea6e`, the attested multi-arch AOT index
`sha256:c8d7aef98761618145725530b6a4e4b25ea4a9ae121da168362f9be4cf5f7d37`, which
contains that runtime change and this server-owned harness. Earlier defaults were
`8cb074f77d01c0a00617ebe426460aa24c7d890b` and
`3ecd214c1ce20e96ad4911b6f8447055dee9089d`, which predated both. Pinning an image changes
no capability baseline or governed qualification state. Request cancellation is a
behavior of the already-required `ai.mcp-discovery` query surface; the server's
authoritative capability catalog declares no separate cancellation capability.

The Inspector pagination adapter consumes the independently observed public CLI
page chain from the same verified server source (`inspector-pagination.mjs`,
contract `honua.inspector-pagination-observer/v2`, honua-server#6641). The proof
is on authenticated full-view `tools/list`, recorded as
`behavior/tools-pagination`, not on `resources/list`: the candidate's 8 static
resources never exceed one default 12-item page, while the `full` catalog export
(`--metadata 'honua.io/workflow-view="full"'` plus the API key) spans about 11
real default pages. Server page sizes are not changed. It requires a multi-page
cursor traversal with the full view and a credential on every page, and a final
returned tool list matching the wire. The pure fragment consumer then rechecks the
candidate source, actual installed Inspector version, method, view,
authentication, completion and bounded counts/hashes. A v1 `resources/list` proof
is refused, so this passes only for a pinned candidate containing the v2 observer,
and certify must supply `HONUA_MCP_API_KEY`. Missing/tampered helpers stay nonpassing; there is no local copy.
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
path, extended to twenty-three files from one protected immutable release revision
(the eight render/setup dependencies plus map-package Python/JavaScript, the
transparent wire observer, fixed launcher/SDK runner, package-file manifest and
three ingest/publication execution/state/oracle files and three canonical-style
execution/state/oracle files plus three canonical plan-execution files). Hashes bind the complete set before import/setup
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
the historical frozen anonymous catalog conflicts with authenticated package reads and
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

The owned workflow provisions append-only Redis with an isolated persistent volume,
`everysec` fsync and `noeviction`, and verifies CONFIG/INFO before startup. It uses
the documented 2026.1 `Licensing__Mode=Disabled` deployment setting and a private
operator certificate for the encrypted durable key ring. Startup requires an
attested durable store; observed license mode and durable-job/proposal availability
are checked before the journey. No product licensing policy or guardrail is changed.

The `execute_plan` consumer invokes the protected release-owned authored buffer
journey through the actual SDK and public Inspector. It retains invalid and fresh
anonymous invocation refusals, independently censuses durable job/results, replays
the original idempotency key and reads exact returned resources after a real owned
server restart. Geometry, mutation, persistence and restart mechanics remain in
honua-release; this repository only wires verified invocation, results and proof
rejudging. Full partial raw wire and original client diagnostics are uploaded on
failure. No fixture planner, cancellation or worker-cessation credit is implied.
All 82 rows and current auth/cohort/global prerequisites remain required; a failed
historical-image diagnostic never qualifies the intended release candidate.

The thin `publish-result-validation.mjs` consumer invokes the protected
release-owned genuine worker result publication producer. All Console workflow
setup, worker/spec/committed receipt correlation, independent SQL/Redis and
geometry oracles, and restart mechanics remain in honua-release. Both actual
installed clients consume the real result/artifact, publish it, and retain fresh
public-resource/query and restart readback evidence. Partial setup and raw wire
receipts are uploaded on failure. No locally copied oracle or fabricated result
is accepted; all27 source bytes are verified before import/setup/calls/rejudging.
The protected source pin is adopted only after normal release producer landing.

This source adapter does not qualify the historical selected image, current
client-cohort mismatch, unresolved authenticated requirement adoption, or all82
rows. Actual two-client execution remains required; pending/denied/failed
publication and Inspector local discovery refusal retain nonpass outcomes.

## Governed per-operation authority adoption

The producer authenticates the existing release-owned
`mcp-operation-auth-policy.v1.json` from the **same exact protected source** as
its requirements catalog and retains both immutable Git blob identities. It
requires every operation decision, the `auth` scenario facet and all reviewed
observations. An old selected source without that policy fails closed; this
change does not update requirements pins or select a new cohort.

Normalization uses each operation's governed authority revision. For the
implemented protected map, ingest/publication, style, execution and worker-result
journeys, authority credit requires the complete protected release-owned oracle
to rejudge retained actual canonical-client launches and raw wire bytes. Those
oracles verify successful authenticated invocation, typed fresh anonymous
refusal, credential fingerprints on initialization and invocation, distinct new
sessions and unchanged client/server results. Boolean success labels and local
Inspector discovery refusals cannot satisfy these controls.

Public transport has no authority adapter in this slice. Other protected
operations without a complete retained authority journey remain nonpassing;
semantic evidence and global behavior checks alone cannot mint an `auth` facet.
The fourth facet, governed policy revision and original observations bind any
future receipt. Test-only synthetic schema/observation fixtures are not runtime
qualification evidence.

Refs [release695](https://github.com/honua-io/honua-release/issues/695) and
[issue120](https://github.com/honua-io/geospatial-mcp/issues/120): matching cohort
preparation, actual selected-candidate authority execution and missing primary
journeys remain. All 82 candidate rows remain unqualified; the currently authored
35 primary paths and at least 47 missing primary flows receive no new execution
credit from this source change. The historical style/worker failures and old
selected image/cohort rejection remain retained.

`MCP Producer Source Controls` runs the complete offline source suite independently
of selected-catalog or candidate startup. It authenticates the unchanged pinned
oracle dependencies and existing reviewed receipt checker; it cannot satisfy or
replace the required actual `certify` verdict. The full admission regression uses
the untouched execute-plan proof and bootstrap from run 39284007212, preserving
historical source `3ecd214c1ce20e96ad4911b6f8447055dee9089d` and image digest
`sha256:62e312a8210ddf632ec5b903a2759327321966f72cbb9f75c0b2a3d2c1243458`.
That run's actual global cancellation failed. A separately labeled synthetic
global control vector exercises the offline positive join; restoring the actual
cancellation failure prevents a receipt. This is regression evidence only.

### App package source consumer

The app consumer fetches a separate complete 14-file protected release bundle
with `npm run prepare:app`. Its source and byte bindings preserve the existing
historical helper bundle unchanged. The release-owned journey composes an actual
map package and execution artifact into an app draft, then checks draft resource
reads and generic declared-requirements validation and preview. Authority checks
include the actual review calls and anonymous refusals.

Fresh-session draft reads do not prove restart durability. Generic review does
not resolve or execute opaque package payloads; preview proves the returned plan,
not an independent database mutation census. Offline oracle vectors and source
controls grant no installed-client or candidate qualification. All original
qualification requirements remain in force.

Source controls generate their explicitly offline vector with
`python3 generate-offline-app-vector.py`, fetching the complete protected
production and control dependencies at the same reviewed source. The retained
vector records every source blob and preserves the original bootstrap bytes.

The Ops health consumer uses a separate complete 18-file protected bundle through
`npm run prepare:ops-health`. Both original operations run through the installed
SDK and Inspector, retaining independent owned Postgres/Redis observations,
fresh authenticated and anonymous sessions, typed refusals, and same-container
restart followed by live recomputation. The snapshot is computed on demand;
this does not establish persisted health history or deployment success.

`python3 generate-offline-ops-health-vector.py` authenticates the production
bundle and its complete control dependencies from one protected source. Its
explicitly offline SDK and Inspector vectors retain every source blob and the
original bootstrap bytes. These controls grant no installed-client or candidate
qualification and preserve all 82 original rows and existing admission gates.

## Findings and durable event reads

The separate findings/event consumer uses a complete 22-file protected release
bundle, including its configuration, single-use SQL setup, managed-caller
fixture and independent observer/oracle dependencies. Its four primary keys are
`tools/call:ops_findings`, `tools/call:alert_events`, `tools/call:operate_events`
and `resources/read:Ops findings`. Both installed canonical clients must exercise
them; the original 82-row denominator, authority policy, global behavior and tier
requirements are preserved.

The workflow retains `platform-manifest.yaml` from the same authenticated release
revision as the governed requirements context. Before boot, the release-owned
configuration helper must bind that manifest to the selected immutable image and
source. It declares eight nonsecret options for an explicit L1 configuration-skew
test target. A different manifest/candidate combination fails; no manifest or
image is relabeled. This declaration does not observe deployed target health or
request deployment actuation.

One bounded fixture setup runs after the authenticated publication bootstrap.
Both clients reuse its original durable alert/lifecycle rows and SQL receipt,
including across their real container restarts. The normal limited managed key
must first read the owned nonempty layer successfully before its Ops permission
denials can count. The protected release oracle rechecks original bytes, semantic
results, filters, actual cursor paging, source posture, fresh sessions, runtime,
managed caller identities and successful normal cleanup. Missing setup or cleanup
stays nonpassing and its original partial observations are retained.

The SQL records are explicit read fixtures, with inactive rules and no delivery
channels. They do not qualify alert evaluation, notification delivery, lifecycle
mutation, OAuth scope or tenant isolation. The offline generator uses synthetic
manifest, client, caller and candidate vectors solely to test this consumer and
its complete fragment builder. Source controls and a merged consumer do not
qualify a candidate. Refs #128 and honua-io/honua-release#727.

## Grounding, clarification and declared status

The grounding/status consumer fetches all 20 producer dependencies from one
protected release commit and verifies both SHA-256 and Git blob identities.
It reuses the original governed platform manifest and the authenticated render
bootstrap. The release-owned producer, not this thin adapter, performs the
graph, process-catalog, managed-caller, admin-preflight and actual-wire checks
for `ground_candidates`, `clarify_intent` and `platform_release_status` in both
installed clients. The protected fragment builder requires its independent
judgment for each of the six original operation/client rows.

Declared release status is a configuration projection. These checks do not
establish deployed health, a live model, or an exact candidate pass from an
offline vector or source-only workflow. Actual candidate execution and the
original 82-row gates remain separate. Refs #127 and honua-io/honua-release#728.

## Planning disclosure and validation handoff

Planning disclosure is executed for both installed canonical clients after the
baseline sessions and before any restart journey, using `node run-planning.mjs`.
The separate protected planning bundle retains the original publication bootstrap,
normal managed full/read caller grants and revocations, seven fresh wire sessions,
and two independent durable job/result censuses. The canned planner must disclose
fixture/demo mode and direct an unmatched intent to the client model and supported
catalog/validation workflow. A separate hand-authored buffer plan is validated.
This proves neither real-model intent compilation nor plan execution. Direct job
cancellation and native AWS cessation remain open in #133 and release#745/#679.
The offline builder tests exercise both original rows, coherent output mutations,
auth, global behavior, exact clients and tier; they qualify no actual candidate.

`prepare:direct-cancel` authenticates the complete protected release-owned
cancellation bundle. The runner extends both original canonical client lanes
before restart-sensitive journeys. It requires a genuinely Running owned job,
normal anonymous/read-only/other-tenant refusals, the owner's cancellation,
durable Cancelled readback, an empty result package and a bounded late read
without outputs. An acknowledgement alone cannot qualify either row. Missing
runtime configuration, early completion, source/cohort mismatch or ambiguous
managed-key cleanup remains nonpass. The fixture's admin tenant refusal does
not establish nonadmin owner isolation or native process cessation; those
original release obligations remain separate. Private managed keys stay in
local temporary files; public raw and partial outcomes remain in artifacts.
The offline generator supplies synthetic regression controls only. Receipt
creation still requires the protected oracle plus the unchanged authorization,
client, source, image, global behavior, required tier and complete82-row gates.

## Deployment and workspace proof

The deployment/workspace bridge pins the complete protected release-owned v2
cohort. One invocation runs both canonical installed clients with a shared role
and four managed keys; cleanup follows both original journeys. All four original
operations require full semantic and caller/session authority rejudging. A
semantic component, offline vector, partial cohort or second credential alone
grants no row credit.

The optional dispatch `deployment_target_id` identifies a real owned target with
independently observed succeeded workflow history. Missing target/history,
protected canonical publication writer, declared owned tenant configuration,
normal identity binding or original client evidence remains NONPASS. A rollback
proposal proves neither approval nor actuation or deployment health. Offline
source controls preserve the 82-row denominator and grant no candidate credit.

The owned certification boot explicitly composes the protected tenant and Studio
end-user authorization options with the existing declared ControlPlane options
before starting the image. The separate public declaration identifies this
nondefault test posture and grants no qualification. Each complete journey still
requires the original safe Docker configuration observation and independent
normal caller, tenant, owner and role joins. Normal admin bypass remains part of
the tested policy.
