# MCP Session and Streaming Transport

**Status:** Draft
**Date:** 2026-06-29
**Scope:** Session, transport, protocol-revision, and streaming contract for the
geospatial MCP standard

This document defines the **transport contract** the geospatial MCP standard
expects: the supported MCP protocol revision, the session model, the streamable
transports, and the streaming notifications that let long-running geospatial
jobs push progress instead of forcing the client to poll. It extends
[Taxonomy, Capability Matrix, and Non-Goals](taxonomy.md) and does not redefine
vocabulary, the capability matrix, resource URIs, or the planning/handoff
contract; it specifies *how* the four MCP primitives
([taxonomy.md §MCP Primitives](taxonomy.md#mcp-primitives)) are carried over the
wire so server and client implementers share one authoritative contract.

Upstream references (authoritative for object field shapes):

- [AI Operator Contract](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md)
- [AI-First Operator Architecture](https://github.com/honua-io/honua-server/blob/main/docs/contributor/AI_OPERATOR_ARCHITECTURE.md)

Protocol references (authoritative for transport framing and message shapes):

- [Model Context Protocol specification, revision 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18)
- [MCP Basic Transports](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)

This repository owns the geospatial transport contract (which revision, which
transports, which notifications a conformant geospatial MCP surface MUST honor).
The base MCP protocol semantics — JSON-RPC framing, the `initialize` handshake,
and message shapes — are owned by the MCP specification and referenced here, not
restated.

## 1. Scope and Relationship to Existing Documents

The other spec documents fix *what* the surface offers; this document fixes
*how a client connects to and streams from it*:

- `spec/taxonomy.md` fixes the primitives, the capability matrix, and the tool
  vocabulary (including the [grounding-as-tools](taxonomy.md#grounding-as-tools)
  set and [tool safety annotations](taxonomy.md#tool-safety-annotations)). This
  document carries those primitives; it does not add to the vocabulary.
- `spec/planning.md` fixes the clarification, elicitation, and handoff
  semantics. This document maps the clarification envelope onto MCP-native
  elicitation (§6) and the long-running-job status model onto progress
  notifications (§5.1); it does not redefine reason codes, question kinds, or
  the post-handoff ownership model.
- `spec/resources.md` fixes the `honua://` URI grammar and the metadata cache /
  freshness-token model. This document defers polling-cadence and freshness
  semantics to that document and adds the push (notification) complement.

A conformant geospatial MCP surface MUST satisfy this contract on every
transport it exposes. The contract is transport-symmetric: the same tool and
resource catalog is presented over every supported transport (§3).

## 2. Supported Protocol Revision

- A conformant server MUST support MCP protocol revision **`2025-06-18`** and
  MUST negotiate it through the standard `initialize` handshake: the client
  sends its `protocolVersion`; the server responds with the revision it will
  use for the connection.
- Revision `2025-06-18` is REQUIRED because the geospatial standard depends on
  capabilities it introduces or stabilizes — native **elicitation** (§6),
  tool **`outputSchema`** / `structuredContent` (used by `resolve_entity` and
  `list_capabilities`; see
  [taxonomy.md §Grounding-as-Tools](taxonomy.md#grounding-as-tools)), and tool
  **annotations**
  ([taxonomy.md §Tool Safety Annotations](taxonomy.md#tool-safety-annotations)).
- A server MAY additionally accept an older revision (for example `2025-03-26`)
  for backward compatibility. When it negotiates an older revision it MUST
  degrade gracefully: features that require `2025-06-18` (native elicitation,
  output schemas) are unavailable, and the server MUST fall back to the
  equivalent in-band shapes — the clarification envelope is carried as a tool
  result rather than an `elicitation/create` request, and structured tool
  output is carried as content rather than `structuredContent`. A server MUST
  NOT silently behave as if a feature is present on a revision that does not
  support it.
- On HTTP transports, after initialization the client MUST send the negotiated
  revision on each request via the `MCP-Protocol-Version` header, per the base
  protocol.
- The negotiated revision is observable: `list_capabilities` echoes it in its
  `protocolVersion` output field
  ([taxonomy.md §Grounding-as-Tools](taxonomy.md#grounding-as-tools)).

## 3. Transports

The geospatial standard recognizes two transports. A server MAY expose either
or both, but the tool/resource catalog it advertises MUST be identical across
them (transport symmetry): a client MUST NOT see a different surface depending
on how it connected.

### 3.1 Streamable HTTP and SSE

- The primary networked transport is **streamable HTTP** with Server-Sent
  Events (SSE), per the base MCP transport specification: a single HTTP
  endpoint accepts JSON-RPC `POST` requests and MAY return either a single JSON
  response or an SSE stream, and supports an SSE `GET` channel for
  server-initiated messages (notifications and elicitation).
- Streaming is REQUIRED for long-running tools (geoprocessing, publishing): the
  server streams `notifications/progress` (§5.1) on the response stream rather
  than blocking until completion.
- The server MUST be able to deliver server-initiated messages
  (`notifications/*`, `elicitation/create`) to a connected client over this
  transport.

### 3.2 stdio

- A server MAY expose the same surface over the **stdio** transport (newline-
  delimited JSON-RPC over stdin/stdout), for local hosts and SDK-embedded use.
- The stdio surface MUST present the same catalog as the HTTP surface
  (transport symmetry). Notifications and elicitation are delivered as
  JSON-RPC messages on the stdout stream.

## 4. Sessions (`Mcp-Session-Id`)

Sessions let a server correlate a sequence of requests (and the server-initiated
messages it pushes back) with one logical client connection.

- On the HTTP transport, a server that maintains session state MUST assign a
  session identifier and return it in the **`Mcp-Session-Id`** response header
  on the `initialize` response.
- Once assigned, the client MUST include `Mcp-Session-Id` on every subsequent
  request (including the SSE `GET` channel) for the life of the session.
- If a server receives a request that requires a session and the
  `Mcp-Session-Id` is missing or no longer valid, it MUST reject the request —
  HTTP `400` for a missing required id, HTTP `404` for an expired/unknown
  session. On `404` the client MUST treat the session as gone and re-run
  `initialize` to obtain a new session.
- A client MAY end a session explicitly by issuing an HTTP `DELETE` with the
  `Mcp-Session-Id`; the server SHOULD release session-scoped state.
- The session identifier is opaque, MUST be unguessable, and MUST NOT encode
  privileged data. It is a correlation handle, not an authorization token;
  authorization is out of scope (§8).
- A server MAY operate **statelessly** (no `Mcp-Session-Id`) when it keeps no
  per-connection state. A stateless server still satisfies §5 by streaming
  progress on the originating request's response stream, but it cannot deliver
  unsolicited server-initiated notifications between requests; clients fall back
  to the conditional-read polling contract in
  [planning.md §5.3](planning.md#53-post-handoff-execution--orchestration-plane).

## 5. Streaming and Notifications

### 5.1 Progress (`notifications/progress`)

Long-running geospatial jobs (geoprocessing via `execute_plan`, publishing,
large renders) MUST stream progress rather than require fixed-interval polling.

- A client opts in by attaching a `progressToken` to a request's `_meta` per
  the base protocol. The server then emits `notifications/progress` referencing
  that token, carrying `progress`, optional `total`, and an optional human-
  readable `message`.
- Progress notifications are advisory UI/telemetry signals; they are **not** a
  parallel job-state model. The authoritative post-handoff state model is
  unchanged: Analyze jobs remain `ExecutionJob` owned by `ProcessService`, and
  Publish Data execution state remains `PipelineService`-owned, per
  [planning.md §5.3](planning.md#53-post-handoff-execution--orchestration-plane).
  A progress `message` MAY mirror an `ExecutionJob.status` transition but MUST
  NOT redefine the status vocabulary.
- Progress streaming is the standard replacement for tight polling of a job
  resource. Polling remains a valid fallback (e.g. for stateless servers or
  reconnecting clients) under the conditional-read + capped-backoff contract in
  [planning.md §5.3](planning.md#53-post-handoff-execution--orchestration-plane)
  and the freshness-token model in
  [resources.md §Metadata Cache State](resources.md#metadata-cache-state); a
  client MUST NOT present stale progress as current.
- Errors that end a streamed job use the canonical
  [`GeoprocessingError`](resources.md#error-model) envelope; the transport does
  not define a local error vocabulary.

### 5.2 List-Changed Notifications

When the advertised surface changes during a session, the server MUST notify
subscribed clients so a client LLM re-reads the surface instead of planning
against a stale catalog. The capability flags for these notifications MUST be
honest: a server advertises a `listChanged` capability only if it actually
emits the corresponding notification.

| Notification | Fires when |
|---|---|
| `notifications/tools/list_changed` | The tool catalog changes — for example a governed workflow is registered or retired as a first-class tool, or a tool becomes available after authentication or tier change |
| `notifications/resources/list_changed` | The resource-family/template catalog changes |
| `notifications/prompts/list_changed` | The prompt catalog changes |

A client that receives a `list_changed` notification SHOULD re-list the affected
primitive (and MAY re-call [`list_capabilities`](taxonomy.md#grounding-as-tools)
to refresh its composable view).

### 5.3 Resource Subscriptions (Optional)

A server MAY support per-resource subscriptions (`resources/subscribe` /
`notifications/resources/updated`) for read-only `honua://` resources. When
offered it MUST advertise the `resources.subscribe` capability. Subscriptions
are read-only change signals over the projections defined in
[resources.md](resources.md); they MUST NOT expose mutation paths or server
internals.

## 6. Elicitation Transport

Clarification is a planning-plane concept (`ClarificationRequest` /
`ClarificationResponse`, [planning.md §2](planning.md#2-clarification-and-elicitation-semantics));
this section fixes only how it is carried.

- On `2025-06-18`, a server SHOULD carry clarification over MCP-native
  **elicitation**: it issues an `elicitation/create` request to the client and
  receives the client's structured response. This is the transport realization
  of the mapping in
  [planning.md §2.6](planning.md#26-mcp-elicitation-mapping).
- The mapping is shape-only. The transport MUST NOT own reason codes, question
  kinds, or assumption policy (those remain planning-plane semantics), and it
  MUST preserve `questionId` identity end-to-end so answers rebind correctly,
  per [planning.md §2.6](planning.md#26-mcp-elicitation-mapping). Only the typed
  question/answer fields cross; conversational phrasing does not.
- A `ClarificationRequest` whose questions do not fit MCP-native elicitation's
  flat structured-field model (for example multi-question batches that exceed
  what the elicitation primitive expresses) is carried as a tool result using
  the `emit_clarification` expected-behavior shape
  ([conformance.md §2.3](conformance.md#23-expected-behavior-shapes)) instead;
  the choice of carrier MUST NOT change the typed payload.
- On a negotiated older revision without native elicitation, the server MUST
  carry every clarification as the `emit_clarification` tool-result shape (§2).

## 7. Capability Negotiation

At `initialize`, server and client advertise capabilities; the geospatial
contract pins the meaning of the ones it depends on:

- A server that streams progress, fires `list_changed`, supports resource
  subscriptions, or elicits MUST advertise the matching capability
  (`tools.listChanged`, `resources.listChanged`, `resources.subscribe`,
  `prompts.listChanged`, and the client-side `elicitation` capability the
  server relies on). A flag advertised MUST be backed by actual behavior — no
  inert flags.
- A client SHOULD advertise the `elicitation` capability when it can render
  clarification; a server that needs clarification from a client lacking it
  MUST fall back to the `emit_clarification` tool-result shape (§6).
- `list_capabilities` ([taxonomy.md §Grounding-as-Tools](taxonomy.md#grounding-as-tools))
  is the application-level, model-facing view of the surface; the `initialize`
  capabilities object is the protocol-level view. The two MUST be consistent.

## 8. Non-Goals

- **gRPC execution transport.** This document covers the MCP interaction-plane
  transport only. Typed deterministic execution transport remains in
  `geospatial-grpc` and the post-handoff execution plane
  ([planning.md §5.3](planning.md#53-post-handoff-execution--orchestration-plane));
  this document does not redefine it.
- **Authentication and authorization.** Auth (including HTTP/OAuth flows) is
  governed by the base MCP specification and the deployment; the
  `Mcp-Session-Id` is a correlation handle, not an authorization token (§4).
- **Message framing and JSON-RPC semantics.** Owned by the base MCP
  specification; referenced, not restated.
- **Server internals.** Worker routing, queue management, and storage backends
  remain private ([taxonomy.md §MCP Role in the Architecture](taxonomy.md#mcp-role-in-the-architecture));
  the transport contract never exposes them.
- **Parallel taxonomy, URI scheme, or error envelope.** This document reuses
  the `honua://` scheme and the canonical
  [`GeoprocessingError`](resources.md#error-model); it mints none of its own.

## 9. Observable Signals

Implementations should emit signals that allow transport-conformance tracking:

- **Revision coverage** — negotiated protocol revision per connection, and the
  rate of fallback to an older revision.
- **Session health** — session establishment, expiry (`404`) and re-initialize
  rate, and stateless-vs-stateful operation.
- **Streaming coverage** — fraction of long-running tool calls that stream
  `notifications/progress` versus complete synchronously, and progress-to-
  terminal-state correlation.
- **Notification fidelity** — `list_changed` emissions versus advertised
  `listChanged` capability flags (to detect inert flags).
- **Elicitation carrier** — share of clarifications carried as native
  `elicitation/create` versus the `emit_clarification` tool-result fallback.

These extend the taxonomy-, planning-, corpus-, and conformance-plane signals
defined in the sibling documents
([taxonomy.md §Observable Signals](taxonomy.md#observable-signals),
[planning.md §7](planning.md#7-observable-signals)).

## Downstream Coordination

This contract is implemented and exercised downstream, not in this repository:

- `honua-io/honua-server` — the reference `/mcp` surface implements the session,
  streaming, and revision contract (epic `honua-io/honua-server#1948`; sessions
  & streaming `honua-io/honua-server#1954`; transport-symmetric surface
  `honua-io/honua-server#1950`).
- `honua-io/honua-sdk-js` — the stdio surface and client integrations bind the
  same contract.

The reference implementation MAY vendor a slightly different shape ahead of this
document; where it diverges, this document defines the canonical contract and
the divergence is tracked in the referenced tickets.
