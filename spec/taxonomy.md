# MCP Taxonomy, Capability Matrix, and Non-Goals

**Status:** Draft
**Date:** 2026-04-11
**Scope:** Vocabulary baseline for the geospatial MCP standard

This document defines the standard vocabulary, capability coverage, and explicit
non-goals for the geospatial MCP standard. It is the canonical source for
taxonomy used by all other documents in this repository.

Per-family resource contracts (URI grammar, inspection fields, lifecycle
visibility, and relationship graph) for result, asset, promotion-surface,
and workspace families are in [MCP Resource Contracts](resources.md).

Upstream references:

- [AI Operator Contract](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md)
- [AI Operator Technical Plan](https://github.com/honua-io/honua-server/blob/main/docs/contributor/AI_OPERATOR_TECHNICAL_PLAN.md)
- [AI-First Operator Architecture](https://github.com/honua-io/honua-server/blob/main/docs/contributor/AI_OPERATOR_ARCHITECTURE.md)
- [ADR-0028: AI-Driven Data Editing Is Not Allowed](https://github.com/honua-io/honua-server/blob/trunk/docs/internal/contributor/adr/0028-ai-data-editing-not-allowed.md) — reconciled by the standard's [ADR-0028: Governed Feature Mutation](../docs/adr/0028-governed-feature-mutation.md)

## Standard Version

The geospatial MCP standard is versioned as a single monotonic identifier that
every document in this repository shares. This is the canonical version of the
standard; it is defined here and referenced (not re-declared) by the other spec
documents.

```text
SPEC_VERSION = 1.0
```

The per-document `**Date:**` headers are editorial provenance for each
document's last substantive edit; they are **not** independent version
identities. Consumers pin against `SPEC_VERSION`, never against a per-document
`Date`.

**Mapping to plan, fixture, and manifest fields.** Several carriers record the
version an artifact was produced against; each MUST resolve to a released
`SPEC_VERSION`:

- the canonical plan-object `specVersion`
  ([planning.md §5.4](planning.md#54-boundary-crossing-fields)) declares the
  `SPEC_VERSION` a plan was produced against;
- a conformance fixture descriptor's `specVersion`
  ([corpus.md §2.3](corpus.md#23-fixture-descriptor-conventions)) declares the
  `SPEC_VERSION` the fixture was authored against;
- a conformance manifest's `specDate` records the `**Date:**` of the
  `spec/conformance.md` revision an implementation was checked against; that
  `Date` resolves to a `SPEC_VERSION` through this section
  ([conformance.md §8](conformance.md#8-observable-signals)).

**Versioning and compatibility policy.** `SPEC_VERSION` uses `MAJOR.MINOR`:

- **MINOR** increments for backward-compatible additions (new tools, resource
  families, reason codes, step kinds, or optional fields). A consumer written
  against an earlier minor of the same major continues to interoperate, and
  moving a capability from `deferred` to `v1` in the capability matrix is a
  MINOR change.
- **MAJOR** increments for backward-incompatible changes: removing or renaming
  a tool, resource family, reason code, or step kind; tightening a previously
  optional contract into a required one; or moving a published capability to
  `excluded`. Consumers MUST re-pin and migrate across a MAJOR change.

While the standard carries `**Status:** Draft`, `SPEC_VERSION` MAY change
without the guarantees above; the compatibility policy governs released
versions.

## MCP Role in the Architecture

MCP is the **agent interaction plane** for geospatial operator workflows. It
presents semantic operations that agents use to discover data, gather
requirements, plan work, execute analysis, compose maps, build applications, and
publish results.

MCP does not replace gRPC or server internals. The boundary is:

| Layer | Responsibility | Examples |
|---|---|---|
| **MCP** | Agent interaction and orchestration | Tools, resources, prompts, elicitation |
| **gRPC** | Typed deterministic execution | FeatureService, FormService (seeded); CatalogService, ProcessService, WorkspaceService, RenderService, BuilderService (planned) |
| **Server internals** | Private runtime semantics | Worker routing, queue management, provider adapters, storage backends |

MCP surfaces semantic operations. gRPC executes them deterministically. Server
internals are private and must not leak into either surface.

### Boundary Rules

1. MCP tools delegate to transport-neutral internal services, not directly
   into gRPC wire contracts.
2. MCP resources expose read-only context, not mutable service state.
3. gRPC services own validation, authorization, state transitions, and
   persistence.
4. Runtime adapters sit below the contract layer and are invisible to both MCP
   and gRPC consumers.
5. Canonical objects are transport-neutral. Neither MCP nor gRPC naming is the
   source of truth for internal semantics.

## MCP Primitives

The MCP protocol defines four primitive categories. Each has a specific role in
geospatial operator workflows.

### Resources

Resources provide read-only context that the application attaches to agent
conversations. They represent the discoverable universe available to the
operator.

Geospatial resource families:

- **Catalog resources** -- dataset listings, process registries, capability
  metadata
- **Dataset resources** -- dataset references, layer references, field
  definitions, and schema information
- **Process definition resources** -- available geoprocessing operations and
  their parameter contracts
- **Style resources** -- reusable style presets, renderer configurations
- **Theme resources** -- visual token sets (color ramps, typography, spacing)
- **Map template resources** -- cartographic composition templates
- **App template resources** -- application scaffold templates
- **Result package resources** -- saved analysis results and their provenance
- **Map package resources** -- composed map definitions with source bindings,
  styles, and view state
- **App package resources** -- SDK application scaffolds with map and artifact
  bindings
- **Published service resources** -- published dataset or service surfaces with
  protocol endpoints
- **Deployment resources** -- routable runtime surfaces for promoted packages
- **Workspace resources** -- managed working state and artifact lifecycle views

Per-family resource contracts (URI grammar, inspection fields, lifecycle
visibility, and relationship graph) for result, asset, promotion-surface,
and workspace families are in
[MCP Resource Contracts](resources.md). Catalog, dataset, and
process-definition families use the existing open-core data-access and gRPC
service contracts; per-family MCP resource contracts for those families are
not defined in this version of the standard.

### Tools

Tools are agent-invoked operations that advance workflows through discrete
steps. They operate at the semantic level, not at the desktop-command or
protocol-specific level.

Geospatial tool families:

- **Intent and planning** -- `plan_analysis`, `ground_candidates`,
  `clarify_intent`, `validate_plan`
- **Execution** -- `execute_plan`
- **Style inspection** -- `get_style` (read-only: resolves a canonical
  `StyleRef` — style_id / title / encodings — from the server OGC API – Styles
  surface, or lists available styles; see
  [`honua://styles/{style_id}`](resources.md#honuastylesstyle_id))
- **Map composition** -- `create_map_package`, `refine_map_package`,
  `apply_style_preset`, `compose_mixed_protocol_map`, `preview_map_package`.
  The reference implementation ships `apply_style_preset` as an
  `x-honua-reference-shape` tool (advertised `honua_apply_style_preset`): it
  binds a preset `StyleRef` as the primary/default style of a published
  `(serviceId, layerId)` layer, persisting through the server OGC API – Styles
  authoring surface (ADR-0048) so subsequent `render_map` calls reflect it. It
  authors presentation metadata on the hosted service and never edits feature
  records (ADR-0028).
- **App composition** -- `create_app_package`, `preview_app_package`
- **Publishing** -- `publish_result`

### Prompts

Prompts are reusable workflow entry points that encode domain-specific patterns.
They help agents start common geospatial workflows without requiring the user to
specify every parameter.

Geospatial prompt families:

- **Analysis prompts** -- site selection, hazard assessment, service coverage
  analysis
- **Review prompts** -- permit review, data quality review
- **Builder prompts** -- dashboard scaffolding, field operations app

### Elicitation

Elicitation provides structured clarification when the system cannot proceed
safely. It replaces freeform guessing with typed questions.

Elicitation triggers:

- Required inputs are missing
- Dataset or process choices are ambiguous
- Actions require approval (publish, destructive operations)
- Request exceeds a policy boundary
- Planner confidence is below threshold

See `spec/planning.md` §2 for the full clarification protocol: reason codes,
question kinds, assumption policies, and answer binding semantics.

## Workflow Families

The geospatial MCP standard covers four operator workflow families. A fifth
family, Edit Data, is admitted only as the opt-in **`mutation` conformance
profile** — governed, authenticated, transactional feature editing exposed as a
discrete tool. *Autonomous* AI mutation of source data remains excluded. See
`spec/planning.md` §4 for per-family planning behavior: step kinds, required
planning resources, and clarification codes in scope.

### Analyze

The primary workflow family. An agent discovers data, gathers requirements,
plans analysis, executes geoprocessing, and packages results including maps.

Lifecycle: `AnalysisIntent` -> `ClarificationRequest` / `ClarificationResponse`
-> `AnalysisPlan` -> `ExecutionJob` -> `AnalysisResultPackage` (with
`MapPackage`)

### Publish Data

Ingest, validate, and publish data products. AI participates in profiling,
quality assessment, and pipeline definition. AI does not mutate source data
directly.

Lifecycle: `PublishingIntent` -> `ClarificationRequest` /
`ClarificationResponse` -> `PublishingPlan` -> publishing execution ->
`PublishingResultPackage` (with `PublishedService`)

### Build App

Compose SDK-native applications from analysis results, map packages, and
templates. V1 targets `honua-sdk-js` with MapLibre GL JS.

Lifecycle: `BuilderIntent` -> `ClarificationRequest` /
`ClarificationResponse` -> `BuilderPlan` -> `AppPackage`

### Automate / Deploy

Operationalize a process, pipeline, map, or application into a routable runtime
surface. Covers promotion from one-off results into persistent deployments.

Lifecycle: `DeploymentIntent` -> `DeploymentPlan` -> provisioning ->
`Deployment`

### Edit Data (Mutation Profile)

Feature editing is admitted as the opt-in **`mutation` conformance profile**,
whose sole v1 member is the `edit_features` tool. This is *governed* mutation,
not the *autonomous* mutation honua-server ADR-0028 forbids: an implementation
MUST require an authenticated, authorized caller, MUST authorize each edit type
(insert/update/delete) independently, and applies the edits as one all-or-nothing
transaction by default. An implementation MAY be read-only and still conform to
the base profile without advertising `edit_features`. The `mutation` profile is
**optional** and is not implemented by the reference implementation (Honua),
which declares `base` only and does not support AI operational data editing
(honua-server ADR-0028). Standard reconciliation and reference-posture addendum:
[docs/adr/0028-governed-feature-mutation.md](../docs/adr/0028-governed-feature-mutation.md).

Autonomous, unapproved editing remains excluded: agents must not mutate
attributes, create or reshape geometry, or publish edits as authoritative source
changes on their own initiative. `edit_features` is always an explicit, named,
authorized tool call — never a side effect of analysis or planning. Outside the
mutation profile, AI may inspect, profile, validate, recommend fixes, and propose
edit plans for human review.

## Canonical Concept Model

These transport-neutral objects form the shared vocabulary between MCP and gRPC
surfaces. Canonical definitions are spread across three upstream documents:

- [AI Operator Contract](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md) -- resource families, MCP contract structure, workflow lifecycle
- [AI Operator Technical Plan](https://github.com/honua-io/honua-server/blob/main/docs/contributor/AI_OPERATOR_TECHNICAL_PLAN.md) -- discovery objects, workflow-family intents and plans, publishing and pipeline nouns
- [AI-First Operator Architecture](https://github.com/honua-io/honua-server/blob/main/docs/contributor/AI_OPERATOR_ARCHITECTURE.md) -- full canonical concept model, composition objects (`RendererSpec`, `LabelSpec`, `PopupSpec`)

This section lists the objects for reference; the upstream documents are
authoritative.

### Discovery and Context

| Object | Role |
|---|---|
| `CapabilityCatalog` | Discoverable universe: datasets, processes, styles, templates, policies |
| `DatasetRef` | Reference to a dataset |
| `LayerRef` | Reference to a layer within a dataset |
| `ProcessDefinition` | Available geoprocessing operation and its parameter contract |
| `PipelineDefinition` | Reusable publishing logic and transformation plan |

### Intent and Planning

| Object | Role |
|---|---|
| `AnalysisIntent` | Partially structured user goal for analysis |
| `PublishingIntent` | Partially structured user goal for data publishing |
| `BuilderIntent` | Partially structured user goal for app creation |
| `DeploymentIntent` | Partially structured user goal for deployment (normative shape; v1 deferred) |
| `ClarificationRequest` | Structured questions needed to proceed safely |
| `ClarificationResponse` | User answers or accepted defaults |
| `AnalysisPlan` | Typed executable graph for analysis |
| `PublishingPlan` | Typed DAG for publishing workflows |
| `BuilderPlan` | Typed plan for app generation |
| `DeploymentPlan` | Typed plan for deployment (normative shape; v1 deferred) |

### Execution and State

| Object | Role |
|---|---|
| `ExecutionJob` | Durable execution state for a job-backed submitted plan |
| `WorkspaceRef` | Reference to managed working state (scratch, persistent, temp) |
| `ArtifactRef` | Reference to a concrete output (layer, table, raster, file, report, map, app) |

### Composition and Styling

| Object | Role |
|---|---|
| `StyleRef` | Reusable style asset or renderer bundle; canonical shape `geospatial.v1.StyleRef` (style_id / title / description / style_version / encodings / legend_url) in [geospatial-grpc](https://github.com/honua-io/geospatial-grpc/blob/main/geospatial/v1/style_types.proto). Resolved read-only via [`honua://styles/{style_id}`](resources.md#honuastylesstyle_id) over the server OGC API – Styles surface |
| `MapTemplate` | Reusable cartographic composition template |
| `ThemeSpec` | Reusable visual tokens (color ramps, typography, spacing) |
| `RendererSpec` | Thematic renderer configuration |
| `LabelSpec` | Label binding configuration |
| `PopupSpec` | Popup binding configuration |
| `SourceBinding` | Protocol-aware binding of a map layer to a data source |

### Result Packaging

| Object | Role |
|---|---|
| `MapPackage` | Runnable map definition with source bindings, styles, and view state |
| `AppPackage` | Runnable SDK application scaffold with map and artifact bindings |
| `AnalysisResultPackage` | Complete result: summary, assumptions, provenance, artifacts, map |
| `PublishingResultPackage` | Complete result from publishing: lineage, quality report, published service |
| `PublishedService` | Published dataset or service surface with protocol endpoints and lineage |
| `ProvenanceRecord` | Audit trail: sources, versions, assumptions, clarifications, timestamps |
| `Deployment` | Routable runtime surface for a promoted package |

## v1 Capability Matrix

This matrix defines what the geospatial MCP standard covers in v1. Use it to
determine whether a capability is in scope, deferred, or excluded.

This matrix describes **standard coverage** (what v1 specifies), which is
distinct from **reference-implementation coverage** (what Honua ships today).
Several capabilities below are specified at `v1` but are still `known-gap` in the
reference — notably the map/app composition and publishing tool families. The
authoritative per-tool/per-resource implementation status is the
`implementationStatus` field in
[`spec/schemas/index.json`](schemas/index.json), enforced by
`conformance/check_manifest.py` (see [`/CONFORMANCE.md`](../CONFORMANCE.md)). Do
not read `v1` in this matrix as "available in the reference".

**Coverage key:**

- **v1** -- covered in the first version of the standard
- **deferred** -- recognized but not specified in v1
- **excluded** -- explicitly out of scope per architectural decisions
- **mutation** -- available only under the opt-in `mutation` conformance
  profile (governed `edit_features`; see
  [Edit Data (Mutation Profile)](#edit-data-mutation-profile))

### By Workflow Family

| Capability | Analyze | Publish Data | Build App | Automate / Deploy |
|---|---|---|---|---|
| Intent capture | v1 | v1 | v1 | deferred |
| Clarification / elicitation | v1 | v1 | v1 | deferred |
| Plan validation | v1 | v1 | v1 | deferred |
| Plan execution | v1 | v1 | deferred | deferred |
| Map composition and styling | v1 | -- | v1 | -- |
| App composition | -- | -- | v1 | -- |
| Result packaging | v1 | v1 | v1 | deferred |
| Artifact publishing | v1 | v1 | v1 | deferred |
| Deployment orchestration | -- | -- | -- | deferred |
| Autonomous source-data mutation | excluded | excluded | excluded | excluded |
| Governed feature editing (`edit_features`, mutation profile) | mutation | mutation | mutation | mutation |

### By MCP Primitive

| Primitive | v1 Coverage |
|---|---|
| Resources | Catalog, dataset, process definition, style, theme, map template, app template, result package, map, app, published service, deployment, workspace ([per-family contracts](resources.md) for result through workspace families) |
| Tools | Intent/planning, execution, map composition, app composition, publishing |
| Prompts | Analysis workflows (site selection, hazard assessment, service coverage), review workflows, builder workflows |
| Elicitation | Clarification reason codes defined in `spec/planning.md` §2.1 (seven codes across all workflow families) |

### MCP Tools to Workflow Family Mapping

| Tool | Analyze | Publish Data | Build App |
|---|---|---|---|
| `plan_analysis` | v1 | -- | -- |
| `ground_candidates` | v1 | v1 | -- |
| `clarify_intent` | v1 | v1 | v1 |
| `validate_plan` | v1 | v1 | v1 |
| `execute_plan` | v1 | v1 | -- |
| `create_map_package` | v1 | -- | v1 |
| `refine_map_package` | v1 | -- | v1 |
| `get_style` | v1 | v1 | v1 |
| `apply_style_preset` | v1 | -- | v1 |
| `compose_mixed_protocol_map` | v1 | -- | v1 |
| `preview_map_package` | v1 | -- | v1 |
| `create_app_package` | -- | -- | v1 |
| `preview_app_package` | -- | -- | v1 |
| `publish_result` | v1 | v1 | v1 |
| `edit_features` (mutation profile) | mutation | mutation | mutation |

Automate / Deploy tools are deferred and not listed. `edit_features` is the sole
member of the opt-in `mutation` conformance profile; it is `v1` only for
implementations that declare that profile (see
[Edit Data (Mutation Profile)](#edit-data-mutation-profile) and
[/CONFORMANCE.md §Conformance Profiles](../CONFORMANCE.md#conformance-profiles)).

### Reference-Shape Tools (Non-Normative)

The published JSON Schema index
([`spec/schemas/index.json`](schemas/index.json)) additionally records a set of
**reference-shape tools** that the reference implementation (Honua `/mcp`)
advertises over the open-core data-access surface but that are **not** part of
the v1 standard tool vocabulary above. They carry a `(reference shape)` family
suffix in the index so a reference manifest can map every advertised tool onto a
published `standardName` (see [CONFORMANCE.md](../CONFORMANCE.md)); they are not
standard MCP tools:

| Reference-shape tool | Index family | How the bare standard models it |
|---|---|---|
| `list_layers` | Discovery and query (reference shape) | a `CapabilityCatalog` / dataset-layer resource read ([§Resources](#resources)) |
| `query_features` | Discovery and query (reference shape) | open-core data-access surface; not an MCP standard tool |
| `render_map` | Discovery and query (reference shape) | open-core data-access surface; not an MCP standard tool |
| `geocode_address` | Analysis and geoprocessing (reference shape) | a `Geoprocess` plan step bound to a `ProcessDefinition` ([planning.md §4](planning.md#4-per-family-planning-behavior)) |
| `geocode_addresses` | Analysis and geoprocessing (reference shape) | a batched `Geoprocess` plan step bound to a `ProcessDefinition` ([planning.md §4](planning.md#4-per-family-planning-behavior)) |
| `solve_route` | Analysis and geoprocessing (reference shape) | a `Geoprocess` plan step bound to a `ProcessDefinition` ([planning.md §4](planning.md#4-per-family-planning-behavior)) |
| `cancel_job` | Execution (reference shape) | post-handoff `ExecutionJob` lifecycle, owned by `ProcessService` ([planning.md §5.3](planning.md#53-post-handoff-execution--orchestration-plane)) |
| `propose_operation` | Control-plane proposal (reference shape) | a control-plane proposal; no v1 standard MCP tool |
| `ingest_dataset` | Publishing | the ingest step of the Publish Data workflow ([§Publish Data](#publish-data)); the standard's file/URL ingest contract finalizes upstream |

Reference-shape tools MUST NOT be treated as v1 standard vocabulary; promoting
one into the standard requires a change to the matrix above. The bare standard
models discovery as a `CapabilityCatalog` read and analysis as `Geoprocess`
plan steps rather than as discrete tools.

## Non-Goals

These items are explicitly out of scope for the geospatial MCP standard. They
are not deferred features; they are architectural boundaries.

### 1. Autonomous AI Data Editing

*Autonomous* AI mutation of source data is not allowed: AI may inspect, profile,
validate, and recommend, but must not edit source data on its own initiative.
*Governed* transactional editing — an explicit, authenticated, per-edit-type
authorized `edit_features` call — is not a non-goal; it is the opt-in `mutation`
conformance profile (see [Edit Data (Mutation Profile)](#edit-data-mutation-profile)
and [docs/adr/0028-governed-feature-mutation.md](../docs/adr/0028-governed-feature-mutation.md)).
Adding further mutation members requires a new ADR.

### 2. Replacing gRPC Contracts

MCP defines the agent interaction plane. It does not replace or duplicate the
typed execution contracts in `geospatial-grpc`. MCP tools delegate to
deterministic services; they do not reimplement service logic.

### 3. Redefining Server Internals

MCP does not specify worker routing, queue management, provider adapters,
storage backends, or other private runtime semantics. The standard describes the
interaction surface, not the execution engine.

### 4. Protocol-Specific Tool Contracts

MCP tools operate at the semantic level. They do not expose GeoServices,
OGC API, or OData protocol details directly. Protocol adaptation happens below
the contract layer through compatibility adapters.

### 5. Desktop Command Parity

The MCP standard models analyst and builder workflows, not desktop GIS command
surfaces. Feature parity with desktop toolboxes is not a goal.

### 6. Full Print Cartography

V1 map composition covers semantically rich operational styling (renderers,
labels, popups, legends, themes, templates, mixed-protocol sources). Full
desktop print-layout parity is not a v1 goal.

## Observable Signals

Implementations should emit signals that allow coverage tracking against this
taxonomy:

- **Capability coverage** -- which tools, resources, prompts, and elicitation
  triggers are implemented versus specified
- **Workflow family coverage** -- which workflow families have complete
  intent-to-result paths
- **Non-goal boundary signals** -- rejection or redirection when a request
  falls outside scope (data editing, direct protocol operations, server
  internals)

These signals support operational telemetry without prescribing a specific
instrumentation framework. See `spec/planning.md` §7 for planning-plane signals
(clarification reason-code coverage, assumption-policy distribution, plan
validation outcomes, handoff boundary rejections), `spec/corpus.md` §10 for
corpus-plane signals (pack coverage per workflow family, protocol-mirror
coverage per adapter, dirty-data family coverage, coverage-flag balance,
non-goal rejection signals, determinism drift), and `spec/conformance.md` §8
for conformance-plane signals (scenario pass rate, non-goal assertion rate,
runtime coverage, deferred-shape exclusion rate) that extend this set.
