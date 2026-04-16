# MCP Resource Contracts

**Status:** Draft
**Date:** 2026-04-16
**Scope:** Per-family resource contracts for the geospatial MCP standard

This document extends [Taxonomy, Capability Matrix, and Non-Goals](taxonomy.md)
with the concrete MCP resource contracts operators and downstream consumers
need to inspect result packages, map and app assets, styles, themes,
templates, and promotion-oriented surfaces. Taxonomy stays the single source
of truth for vocabulary and the v1 capability matrix; this document adds the
per-family URI grammar, inspection fields, lifecycle visibility, and
relationship graph that build on that baseline.

Upstream references:

- [AI Operator Contract](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md)
- [AI Operator Technical Plan](https://github.com/honua-io/honua-server/blob/main/docs/contributor/AI_OPERATOR_TECHNICAL_PLAN.md)
- [AI-First Operator Architecture](https://github.com/honua-io/honua-server/blob/main/docs/contributor/AI_OPERATOR_ARCHITECTURE.md)
- [MCP Server (open-core data access)](https://github.com/honua-io/honua-server/blob/main/docs/developer/MCP_SERVER.md)
- [Taxonomy, Capability Matrix, and Non-Goals](taxonomy.md)

## Boundary Restatement

MCP resources are the **inspection projection** of canonical server-side
objects. The MCP vs gRPC vs server-internal split from
[taxonomy.md](taxonomy.md#mcp-role-in-the-architecture) applies verbatim:

1. MCP resources surface read-only views. They never mutate server state.
2. Execution, promotion, approval gating, and deployment control stay with
   gRPC services and server-internal workflows.
3. Canonical shapes are owned by `honua-server` and referenced here, not
   redefined.

The boundary table is not repeated; see
[taxonomy.md §MCP Role in the Architecture](taxonomy.md#mcp-role-in-the-architecture).

## Resource URI Conventions

All MCP resources use the `honua://` scheme. The grammar is:

```
honua://{family}[/{id}[/{subfamily}/{subid}]*]
```

The `{id}` segment is omitted when addressing a family-level collection
root. The open-core data-access surface already exposes the collection
resource `honua://services` (see
[MCP_SERVER.md §Exposed MCP Resources](https://github.com/honua-io/honua-server/blob/main/docs/developer/MCP_SERVER.md#exposed-mcp-resources));
that resource remains valid under this grammar. Families introduced by
this document address instance resources (and their subresources) only;
they do not redefine collection roots.

Families introduced by this document:

| Family | URI form | Canonical source |
|---|---|---|
| Result package | `honua://results/{result_package_id}` | `AnalysisResultPackage` |
| Result artifact (outcome view) | `honua://results/{result_package_id}/artifacts/{artifact_id}` | `ArtifactRef` |
| Result provenance | `honua://results/{result_package_id}/provenance` | `ProvenanceRecord` |
| Map package | `honua://maps/{map_package_id}` | `MapPackage` |
| App package | `honua://apps/{app_package_id}` | `AppPackage` |
| Style | `honua://styles/{style_id}` | `StyleRef` |
| Theme | `honua://themes/{theme_id}` | `ThemeSpec` |
| Map template | `honua://templates/maps/{map_template_id}` | `MapTemplate` |
| App template | `honua://templates/apps/{app_template_id}` | `AppPackage.templateId` (shape deferred) |
| Published service | `honua://services/{published_service_id}` | `PublishedService` |
| Deployment | `honua://deployments/{deployment_id}` | `Deployment` |
| Workspace | `honua://workspaces/{workspace_id}` | `WorkspaceRef` |
| Workspace artifact (lifecycle view) | `honua://workspaces/{workspace_id}/artifacts/{artifact_id}` | `ArtifactRef` |

ID prefixes follow the canonical examples in
[AI_OPERATOR_CONTRACT.md](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md):
`result_`, `map_`, `app_`, `style_`, `theme_`, `maptmpl_`, `apptmpl_`,
`svc_`, `dep_`, `ws_`, `artifact_`, `rev_`.

The open-core data-access surface already uses
`honua://services/{encodedServiceId}/layers/{layerId}` for catalog-backed
layer schema inspection (see
[MCP_SERVER.md](https://github.com/honua-io/honua-server/blob/main/docs/developer/MCP_SERVER.md)).
`honua://services/{published_service_id}` coexists with that usage: the
former is operator-published service metadata, the latter is a layer schema
view. Both resolve under a single scheme; clients distinguish by path.

## Result Package Resources

### `honua://results/{result_package_id}`

Inspection projection of
[`AnalysisResultPackage`](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md#analysisresultpackage).
The canonical shape is authoritative; MCP surfaces a read-only view.

| Field | Role |
|---|---|
| `resultPackageId` | Stable identifier (`result_…`) |
| `status` | `GeoprocessingWorkflowStatus` (read-only) |
| `summary` | Title and description |
| `assumptions[]` | Assumptions recorded during planning or execution |
| `artifacts[]` | `ArtifactRef` entries (see artifact resources) |
| `workspaceRefs[]` | `WorkspaceRef` entries produced or consumed |
| `mapPackageId?` | Deferred reference resolved in `honua-server#730` |
| `appPackageId?` | Deferred reference resolved in `honua-server#731` |
| `provenance` | `ProvenanceRecord` (see provenance resource) |
| `errors[]` | `GeoprocessingError` entries, canonical envelope |

Lifecycle visibility: `GeoprocessingWorkflowStatus` values
(`Draft`, `AwaitingClarification`, `Validated`, `AwaitingApproval`,
`AwaitingExecution`, `Running`, `Completed`, `Failed`, `Cancelled`) are
surfaced read-only.

### `honua://results/{result_package_id}/artifacts/{artifact_id}`

Outcome-rooted view of an
[`ArtifactRef`](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md#artifactref).

Canonical `ArtifactRef` fields:

| Field | Role |
|---|---|
| `artifactId` | Stable identifier (`artifact_…`) |
| `kind` | `ArtifactKind` (`Scalar`, `FeatureLayer`, `Table`, `Raster`, `File`, `Report`, `Map`, `AppBundle`) |
| `label` | Human-readable label |
| `uri` | Canonical content locator (workspace-scoped, for example `honua://workspaces/{ws}/layers/{id}`) |
| `contentType` | MIME type |
| `metadata` | Canonical metadata map |

MCP-layer lifecycle projection (not a field of `ArtifactRef`; resolved
through the workspace lifecycle service):

| Derived signal | Source |
|---|---|
| `lifecycleState` | `ArtifactLifecycleState` (`Pending`, `Available`, `Promoted`, `Expired`, `Deleted`) from the workspace lifecycle service |

Artifacts are addressable through two complementary URIs. Result-rooted
reads (`honua://results/{rpid}/artifacts/{aid}`) are outcome-centric;
workspace-rooted reads
(`honua://workspaces/{wsid}/artifacts/{aid}`) are lifecycle- and
promotion-centric. The two views address the same underlying `ArtifactRef`.
Because the canonical shape carries `uri` (workspace-scoped) but the
upstream package shapes carry plain artifact IDs, the scoped URI for an
artifact is resolved through the `ArtifactRef` itself — see the
§Artifact Addressing Rule.

### `honua://results/{result_package_id}/provenance`

Projection of
[`ProvenanceRecord`](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md#provenancerecord).

| Field | Role |
|---|---|
| `sources[]` | Dataset sources with version and description |
| `processDefinitions[]` | Process identifiers used |
| `assumptions[]` | Assumptions recorded at execution time |
| `clarificationsAsked[]` | Questions issued to the operator |
| `clarificationsAnswered[]` | Resolved clarifications |
| `executedAt` | Execution timestamp |
| `generatedArtifactIds[]` | Artifacts produced by this execution |

`PublishingResultPackage`, `BuilderResultPackage`, and
`DeploymentResultPackage` (specified in the
[Technical Plan](https://github.com/honua-io/honua-server/blob/main/docs/contributor/AI_OPERATOR_TECHNICAL_PLAN.md))
are deferred. They reuse the same URI grammar (`honua://results/{id}`) once
their canonical shapes finalize in `honua-server#730` / `#732`; no parallel
family is introduced here.

## Asset Resources

### `honua://maps/{map_package_id}`

Projection of
[`MapPackage`](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md#mappackage).
The canonical shape is finalizing in `honua-server#730`; the
[`AI_OPERATOR_CONTRACT`](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md#mappackage)
and
[`AI_OPERATOR_TECHNICAL_PLAN`](https://github.com/honua-io/honua-server/blob/main/docs/contributor/AI_OPERATOR_TECHNICAL_PLAN.md#mappackage)
sections still use different spellings for several properties
(`mapSpec` vs `honuaMapSpec`, `previewArtifactId` vs `previewArtifact`,
etc.). To avoid freezing a draft variant, MCP describes the inspection
projection by responsibility and by the canonical objects it references
rather than by concrete field names. Consumers read field names from
the canonical shape when `honua-server#730` lands.

**Stable identifier:** `mapPackageId` (prefix `map_…`).

**Inspection responsibilities surfaced read-only:**

- package format and template binding (target identifies the canonical
  `MapTemplate`);
- source bindings (each binding is a canonical `SourceBinding`);
- styling composition (style and theme selection via canonical
  `StyleRef` and `ThemeSpec` references);
- map-spec document (the `HonuaMapSpec` style sheet used at runtime);
- initial view geometry (bounding box and CRS);
- legend, popup, and label composition;
- artifact bindings (preview artifact plus bound artifacts as canonical
  `ArtifactRef` references).

Edges: source bindings, styles, theme, template, bound artifacts, preview
artifact, initial view, legend, popup and label bindings. MCP exposes
these compositions by canonical object name; upstream field renames in
`honua-server#730` flow through by reference without invalidating this
surface.

### `honua://apps/{app_package_id}`

Projection of
[`AppPackage`](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md#apppackage).
The canonical shape is finalizing in `honua-server#731`; the
[`AI_OPERATOR_CONTRACT`](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md#apppackage)
and
[`AI_OPERATOR_TECHNICAL_PLAN`](https://github.com/honua-io/honua-server/blob/main/docs/contributor/AI_OPERATOR_TECHNICAL_PLAN.md#apppackage)
sections still use different spellings for several properties
(`bundleArtifactId` vs `bundleArtifactRef`, `mapPackageId` vs
`mapPackageRef`, `deliveryHints` vs `deploymentHints`). To avoid
freezing a draft variant, MCP describes the inspection projection by
responsibility and by the canonical objects it references rather than
by concrete field names.

**Stable identifier:** `appPackageId` (prefix `app_…`).

**Inspection responsibilities surfaced read-only:**

- target SDK declaration (v1 targets `honua-sdk-js` with a MapLibre GL JS
  runtime);
- template binding (references the app-template registry; see
  `honua://templates/apps/{id}`);
- package format and generated file manifest;
- bundle artifact reference (canonical `ArtifactRef`);
- delivery asset manifest (paths with content types);
- map binding (canonical `MapPackage` reference);
- runtime configuration schema;
- hosting and route hints (hosting mode and default route prefix);
- bound data artifacts required at runtime (canonical `ArtifactRef`
  references).

Edges: map package, bundle artifact, asset manifest, delivery hints,
runtime config schema, bound artifacts. MCP exposes compositions by
canonical object name; upstream field renames in `honua-server#731`
flow through by reference.

### `honua://styles/{style_id}`

Projection of
[`StyleRef`](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md#styleref).

| Field | Role |
|---|---|
| `styleId` | Stable identifier (`style_…`) |
| `rendererSpec` | `RendererSpec` reference |
| `labelSpec?` | Optional `LabelSpec` reference |
| `popupSpec?` | Optional `PopupSpec` reference |
| `legendInputs?` | Legend-generation inputs |

Edges: renderer spec, label spec, popup spec. Styles are composed into
map packages through `MapPackage.styleRefs[]`.

### `honua://themes/{theme_id}`

Projection of
[`ThemeSpec`](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md#themespec).

| Field | Role |
|---|---|
| `themeId` | Stable identifier (`theme_…`) |
| `colorRamps` | Color-ramp tokens |
| `typography` | Typographic tokens |
| `spacing` | Spacing and panel chrome |
| `semanticColors` | Status and semantic color tokens |

Edges: referenced by `MapPackage.themeId` and by `AppPackage` runtime
configuration.

### `honua://templates/maps/{map_template_id}`

Projection of
[`MapTemplate`](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md#maptemplate).

| Field | Role |
|---|---|
| `mapTemplateId` | Stable identifier (`maptmpl_…`) |
| `kind` | Template class (e.g., `analysis_default`, `dashboard`, `print_review`) |
| `layerSlots` | Named slots for source bindings |
| `defaultStyleRefs` | Default style references |
| `defaultThemeId` | Default theme reference |

Edges: referenced by `MapPackage.templateId`.

### `honua://templates/apps/{app_template_id}`

App-template inspection view. The canonical app-template shape is not yet
owned by a single honua-server type; it surfaces through
`AppPackage.templateId` and builder-side template registries. MCP exposes
the identifier and any documented template metadata read-only.

| Field | Role |
|---|---|
| `appTemplateId` | Stable identifier (`apptmpl_…`); guaranteed by this contract |
| `kind?` | Template class when published by the builder registry |
| `label?` | Human-readable label when published by the builder registry |

Edges: referenced by `AppPackage.templateId`. The concrete field set
beyond `appTemplateId` finalizes alongside `honua-server#731`; until then
this resource projects the identifier and whatever additional inspection
metadata the builder contract exposes, with no MCP-side reshaping.

## Promotion-Surface Resources

These resources are strictly read-only projections of promoted or deployed
state. None of them expose control operations through MCP.

### `honua://services/{published_service_id}`

Projection of
[`PublishedService`](https://github.com/honua-io/honua-server/blob/main/docs/contributor/AI_OPERATOR_TECHNICAL_PLAN.md#publishedservice).
The canonical shape is owned by `honua-server#730`; the
`AI_OPERATOR_CONTRACT` does not yet carry a `PublishedService` section,
and the `AI_OPERATOR_TECHNICAL_PLAN` enumerates properties only at the
responsibility level. MCP therefore describes the inspection projection
by responsibility rather than by concrete field names.

**Stable identifier:** `serviceId` (prefix `svc_…`).

**Inspection responsibilities surfaced read-only:**

- protocol surface enumeration (for example GeoServices, OGC API
  Features, WMS, WFS, OData, tile endpoints);
- styling composition (canonical `StyleRef` references bound to the
  service);
- source-to-service lineage summary;
- refresh state (read-only lifecycle signal).

Edges: referenced by `PublishingResultPackage.publishedService`
(canonical shape deferred), consumed by `Deployment.targetRef`.
Concrete field names finalize alongside `honua-server#730`; the
resource URI and responsibility list remain stable under reference.

### `honua://deployments/{deployment_id}`

Projection of
[`Deployment`](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md#deployment).
The canonical shape is finalizing in `honua-server#732`; the
[`AI_OPERATOR_CONTRACT`](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md#deployment)
and
[`AI_OPERATOR_TECHNICAL_PLAN`](https://github.com/honua-io/honua-server/blob/main/docs/contributor/AI_OPERATOR_TECHNICAL_PLAN.md#deployment)
sections still disagree on several properties (`approvalPolicyRef` vs
`approvalPolicy`; the tech plan also lists a `schedule` field not
present in the contract). MCP describes the inspection projection by
responsibility rather than by concrete field names.

**Stable identifier:** `deploymentId` (prefix `dep_…`).

**Inspection responsibilities surfaced read-only:**

- deployment kind (package class — for example `app_package`,
  `published_service`);
- target binding (`targetRef` resolves to the canonical `AppPackage`,
  `MapPackage`, or `PublishedService`; `ProcessDefinition` and
  `PipelineDefinition` targets are deferred alongside the
  `Automate / Deploy` workflow column in
  [taxonomy.md §v1 Capability Matrix](taxonomy.md#v1-capability-matrix));
- hosting mode (for example `static_site`, `managed`);
- route configuration (route prefix and resolved public URL);
- revision identifier (prefix `rev_…`);
- runtime profile (for example `browser_maplibre_js`);
- delivery artifact references (canonical `ArtifactRef`);
- injected runtime configuration (content projected, not interpreted);
- visibility scope (for example `workspace_shared`, `public`);
- auth policy reference;
- approval policy reference;
- publication lifecycle state (read-only projection).

Edges: `targetRef` → `AppPackage` | `MapPackage` | `PublishedService`;
delivery artifact references → `ArtifactRef`. Concrete field names
finalize alongside `honua-server#732`; the resource URI, target-kind
set, and responsibility list stay stable under reference.

### `honua://workspaces/{workspace_id}`

Projection of
[`WorkspaceRef`](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md#workspaceref).

Canonical `WorkspaceRef` fields:

| Field | Role |
|---|---|
| `workspaceId` | Stable identifier (`ws_…`) |
| `kind` | `WorkspaceKind` (`Scratch`, `Persistent`, `TempLayer`, `SavedLayer`, `ResultCollection`) |
| `label` | Human-readable label |
| `uri` | Canonical URI |
| `expiresAt?` | Expiration timestamp when applicable |

MCP-layer lifecycle projection (not a field of `WorkspaceRef`; resolved
through the workspace lifecycle service — see
[`AI_OPERATOR_CONTRACT` §Workspace Lifecycle](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md#workspace-lifecycle)):

| Derived signal | Source |
|---|---|
| `lifecycleState` | `WorkspaceLifecycleState` (`Active`, `Expired`, `Archived`, `Deleted`) |

### `honua://workspaces/{workspace_id}/artifacts/{artifact_id}`

Workspace-rooted view of an `ArtifactRef`. The canonical fields match
the result-rooted view above; this surface is the lifecycle- and
promotion-centric read path. All cells below are MCP-layer projections
(not fields of `ArtifactRef` itself):

| Derived signal | Source |
|---|---|
| `lifecycleState` | `ArtifactLifecycleState` (from the workspace lifecycle service) |
| `promotionEligible` | Boolean derived server-side from policy evaluation |
| `expiresAt?` | Expiration timestamp when applicable |
| `sourceWorkspaceKind` | `WorkspaceKind` of the owning workspace |

MCP surfaces only the derived `promotionEligible` flag; the underlying
eligibility policy is server-internal and not exposed.

## Resource Relationship Model

The normative composition graph downstream consumers should code against.
Edges are expressed by canonical object name (`ArtifactRef`, `StyleRef`,
`WorkspaceRef`, `SourceBinding`, …) rather than by the scoped URIs those
objects happen to resolve to. Upstream package shapes carry artifact IDs
without a result or workspace scope, so downstream consumers resolve the
fully scoped URI through the `ArtifactRef` itself (see
§Artifact Addressing Rule).

| From | To | Relationship |
|---|---|---|
| `results/{id}` | `ArtifactRef` | composes (`artifacts[]`, outcome-centric) |
| `results/{id}` | `WorkspaceRef` | references (`workspaceRefs[]`) |
| `results/{id}` | `results/{id}/provenance` | composes |
| `results/{id}` | `MapPackage` | references (`mapPackageId?`, deferred to `honua-server#730`) |
| `results/{id}` | `AppPackage` | references (`appPackageId?`, deferred to `honua-server#731`) |
| `results/{id}` | `GeoprocessingError` | composes (`errors[]`) |
| `maps/{id}` | `SourceBinding` | composes (binding list) |
| `maps/{id}` | `StyleRef` | references (style composition) |
| `maps/{id}` | `ThemeSpec` | references (theme selection) |
| `maps/{id}` | `MapTemplate` | references (template composition) |
| `maps/{id}` | `ArtifactRef` | references (preview and bound artifacts) |
| `apps/{id}` | `MapPackage` | references (map binding) |
| `apps/{id}` | `ArtifactRef` | references (bundle and bound artifacts) |
| `apps/{id}` | app template | references (template binding; canonical `AppTemplate` shape deferred) |
| `services/{id}` | `StyleRef` | references (styling bound to the service, shape deferred to `honua-server#730`) |
| `deployments/{id}` | `AppPackage` \| `MapPackage` \| `PublishedService` | references (`targetRef`); `ProcessDefinition` and `PipelineDefinition` targets deferred |
| `deployments/{id}` | `ArtifactRef` | references (delivery artifacts) |
| `ArtifactRef` | `workspaces/{wsid}/artifacts/{aid}` | resolves through `ArtifactRef.uri` (canonical workspace scope) |
| `ArtifactRef` | `results/{rpid}/artifacts/{aid}` | resolves through the owning `AnalysisResultPackage.artifacts[]` context |

Expressing edges by canonical object name keeps the graph stable when
upstream field names evolve. Upstream field additions or renames in
`MapPackage`, `AppPackage`, `Deployment`, and `PublishedService` (still
finalizing in `honua-server#730`/`#731`/`#732`) flow through by
reference.

### Artifact Addressing Rule

The canonical `ArtifactRef` (§AI_OPERATOR_CONTRACT) carries its own
workspace-scoped `uri` (for example
`honua://workspaces/ws_123/layers/candidate_parcels`). Package shapes
that reference artifacts (`MapPackage.previewArtifactId`,
`MapPackage.boundArtifacts[]`, `AppPackage.bundleArtifactId`,
`AppPackage.boundArtifacts[]`, `Deployment.deliveryArtifacts[]`) carry
plain artifact IDs and do not carry a result-package or workspace scope.
Consumers therefore:

1. Dereference the artifact ID to its canonical `ArtifactRef` (through
   the owning result package's `artifacts[]` or the workspace lifecycle
   service).
2. Use `ArtifactRef.uri` for workspace-rooted navigation
   (`honua://workspaces/{wsid}/artifacts/{aid}`) — this is the
   lifecycle- and promotion-centric path.
3. Use the result-rooted path
   (`honua://results/{rpid}/artifacts/{aid}`) only when the owning
   `AnalysisResultPackage` scope is already known from context.

MCP does not synthesize a scoped artifact URI from an unscoped artifact
ID. A scoped URI exists only where the scope is carried by the
containing object.

## Capability Coverage

Coverage status (`v1`, `deferred`, `--`, `excluded`) is single-sourced in
[taxonomy.md §v1 Capability Matrix](taxonomy.md#v1-capability-matrix). This
document does not republish coverage columns or duplicate the status
vocabulary. The mapping below is a pure resource-family-to-workflow-family
grouping so downstream packaging and deployment consumers can locate the
resource families each workflow reads; coverage status for any given
cell is read from the taxonomy matrix.

| Resource family | Workflow families consuming it |
|---|---|
| `results`, `results/{id}/artifacts`, `results/{id}/provenance` | Analyze, Publish Data, Build App, Automate / Deploy |
| `maps`, `styles`, `themes`, `templates/maps` | Analyze, Build App |
| `apps`, `templates/apps` | Build App |
| `services` | Publish Data, Automate / Deploy |
| `deployments` | Automate / Deploy |
| `workspaces`, `workspaces/{id}/artifacts` | Analyze, Publish Data, Build App, Automate / Deploy |

Whether any cell is `v1`, `deferred`, `--`, or `excluded` follows the
canonical taxonomy matrix and is not repeated here. When coverage
changes, the taxonomy matrix is the single edit point.

## Error Model

MCP resource surfaces reuse the canonical
[`GeoprocessingError`](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md#geoprocessingerror)
envelope verbatim:

| Field | Role |
|---|---|
| `kind` | `GeoprocessingErrorKind` (`ValidationFailed`, `AuthorizationDenied`, `UnknownDataset`, `UnknownProcess`, `ExecutionFailed`, `Timeout`, `Cancelled`, `OutputBindingFailed`) |
| `message` | Human-readable summary |
| `stepId?` | Plan step identifier when applicable |
| `violations[]` | Structured validation failures (`code`, `message`, `fieldPath`) |

No parallel codes, envelopes, or MCP-specific error taxonomy are defined.

## Non-Goals

These items are explicitly out of scope for MCP resource surfaces and align
with the non-goals in
[taxonomy.md §Non-Goals](taxonomy.md#non-goals).

### 1. No State Mutation

MCP resources never mutate server state. Publishing, promotion, approval,
deployment rollout, and revision cuts are owned by gRPC services and
server-internal workflows.

### 2. No Replacement of gRPC Execution Contracts

Resources project canonical shapes; they do not redefine service methods
or execution semantics. Execution contracts stay with `geospatial-grpc`.

### 3. No Exposure of Server Internals

Worker routing, queue state, provider adapters, storage backends,
eligibility-policy evaluation, and secret material are server-internal
and must not leak through resource projections.

### 4. No AI Data Editing

Per [ADR-0028](https://github.com/honua-io/honua-server/blob/main/docs/contributor/adr/0028-ai-data-editing-not-allowed.md)
AI may inspect but must not autonomously edit source data. Resource reads
do not grant edit paths.

### 5. No Parallel Taxonomy, URI Scheme, or Error Envelope

Family names, capability matrix, URI scheme (`honua://`), and error
envelope (`GeoprocessingError`) stay single-sourced. Alternative schemes
(for example `mcp://`) are not introduced.

### 6. No Inlined Canonical Shapes

Canonical shapes (`AnalysisResultPackage`, `MapPackage`, `AppPackage`,
`StyleRef`, `ThemeSpec`, `MapTemplate`, `SourceBinding`, `Deployment`,
`PublishedService`, `ProvenanceRecord`, `ArtifactRef`, `WorkspaceRef`,
`GeoprocessingError`) are referenced, not reproduced. When an upstream
shape finalizes (e.g., `MapPackage` in `honua-server#730`), the resource
contract absorbs the change by reference without local redefinition.

## Observable Signals

Implementations should preserve the telemetry the taxonomy document relies
on and add resource-level signals where behavior changes:

- **Workflow status visibility** -- emit `GeoprocessingWorkflowStatus`
  on result reads.
- **Publication state visibility** -- emit `Deployment.publicationState`
  and `PublishedService.refreshStatus` on promotion-surface reads.
- **Artifact lifecycle state** -- emit `ArtifactLifecycleState`
  (and derived `promotionEligible`) on artifact reads through either
  URI view.
- **Workspace lifecycle state** -- emit `WorkspaceLifecycleState` on
  workspace reads.
- **Per-family capability coverage** -- emit coverage flags aligned to
  the family-by-workflow table above.
- **Non-goal assertions** -- emit rejection or redirection signals when a
  request attempts state mutation, protocol-specific control, or
  server-internal introspection through a resource surface.

These signals support operational telemetry without prescribing an
instrumentation framework, consistent with
[taxonomy.md §Observable Signals](taxonomy.md#observable-signals).

## Downstream Coordination

This contract unblocks the following consumers; they own their own
implementation details.

| Consumer | Dependency |
|---|---|
| [`honua-server#731`](https://github.com/honua-io/honua-server/issues/731) | Result, map, app, and artifact packaging |
| [`honua-server#732`](https://github.com/honua-io/honua-server/issues/732) | Deployment lifecycle surfaces |
| [`honua-sdk-js#21`](https://github.com/honua-io/honua-sdk-js/issues/21) | JS SDK resource consumption |
| [`honua-sdk-js#29`](https://github.com/honua-io/honua-sdk-js/issues/29) | Map and app packaging in the JS runtime |

Sequencing: the resource grammar, inspection fields, lifecycle visibility,
and relationship graph above are the stable interface. Downstream tickets
finalize the concrete canonical shapes (`MapPackage`, `AppPackage`,
`PublishedService`, `PublishingResultPackage`) in `honua-server`;
resource URIs remain valid because they reference those shapes by name.
