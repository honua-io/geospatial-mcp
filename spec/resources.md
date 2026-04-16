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
honua://{family}/{id}[/{subfamily}/{subid}]*
```

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

| Field | Role |
|---|---|
| `artifactId` | Stable identifier (`artifact_…`) |
| `kind` | `ArtifactKind` (`Scalar`, `FeatureLayer`, `Table`, `Raster`, `File`, `Report`, `Map`, `AppBundle`) |
| `label` | Human-readable label |
| `uri` | Canonical content locator (often `honua://workspaces/{ws}/layers/{id}`) |
| `contentType` | MIME type |
| `metadata` | Canonical metadata map |
| `lifecycleState` | `ArtifactLifecycleState` (`Pending`, `Available`, `Promoted`, `Expired`, `Deleted`) |

Artifacts are addressable through two complementary URIs. Result-rooted
reads (`honua://results/{rpid}/artifacts/{aid}`) are outcome-centric;
workspace-rooted reads
(`honua://workspaces/{wsid}/artifacts/{aid}`) are lifecycle- and
promotion-centric. The two views address the same underlying `ArtifactRef`.

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
[`MapPackage`](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md#mappackage)
(concrete shape finalized in `honua-server#730`).

| Field | Role |
|---|---|
| `mapPackageId` | Stable identifier (`map_…`) |
| `format` | Package format version (e.g., `honua_map_package.v1`) |
| `templateId` | `MapTemplate` reference |
| `sourceBindings[]` | `SourceBinding` entries |
| `styleRefs[]` | `StyleRef` identifiers |
| `themeId` | `ThemeSpec` identifier |
| `mapSpec` | `HonuaMapSpec` document (style sheet) |
| `initialView` | Bounding box and CRS |
| `legend[]` | Legend entries |
| `popupBindings[]` | `PopupSpec` bindings |
| `labelBindings[]` | `LabelSpec` bindings |
| `previewArtifactId` | Preview image artifact |
| `boundArtifacts[]` | Artifacts bound into the map |

Edges: source bindings, styles, theme, template, bound artifacts, preview
artifact, initial view, legend, popup and label bindings. `MapPackage` is
composed from these references; MCP exposes them but does not flatten their
definitions.

### `honua://apps/{app_package_id}`

Projection of
[`AppPackage`](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md#apppackage)
(concrete shape finalized in `honua-server#731`).

| Field | Role |
|---|---|
| `appPackageId` | Stable identifier (`app_…`) |
| `targetSdk` | Target runtime (`honua-sdk-js` in v1) |
| `templateId` | App template reference |
| `format` | Package format version (e.g., `honua_app_package.v1`) |
| `entryPoint` | Generated entry file |
| `generatedFiles[]` | Emitted file manifest |
| `bundleArtifactId` | Bundle artifact reference |
| `assetManifest[]` | Delivery assets with content types |
| `mapPackageId` | Bound `MapPackage` reference |
| `runtimeConfigSchema` | Config schema for the bundle |
| `deliveryHints` | `hostingMode`, `defaultRoutePrefix` |
| `boundArtifacts[]` | Data artifacts required at runtime |

Edges: map package, bundle artifact, asset manifest, delivery hints,
runtime config schema.

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
the identifier and any documented template metadata read-only. The
concrete shape will finalize alongside `honua-server#731`; until then this
resource projects the identifier and whatever inspection metadata the
builder contract exposes, with no MCP-side reshaping.

## Promotion-Surface Resources

These resources are strictly read-only projections of promoted or deployed
state. None of them expose control operations through MCP.

### `honua://services/{published_service_id}`

Projection of
[`PublishedService`](https://github.com/honua-io/honua-server/blob/main/docs/contributor/AI_OPERATOR_TECHNICAL_PLAN.md#publishedservice)
(shape owned by `honua-server#730`, subject to finalization there).

| Field | Role |
|---|---|
| `serviceId` | Stable identifier (`svc_…`) |
| `protocolSurfaces[]` | Protocol endpoints (GeoServices, OGC API, WMS, WFS, OData, tiles) |
| `styleRefs[]` | Style references bound to the service |
| `sourceLineage` | Source-to-service lineage summary |
| `refreshStatus` | Refresh state (read-only) |

Edges: referenced by `PublishingResultPackage.publishedService` (deferred),
consumed by `Deployment.targetRef`.

### `honua://deployments/{deployment_id}`

Projection of
[`Deployment`](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md#deployment).

| Field | Role |
|---|---|
| `deploymentId` | Stable identifier (`dep_…`) |
| `deploymentKind` | Package class (e.g., `app_package`, `published_service`) |
| `targetRef` | Package or service reference |
| `hostingMode` | `static_site`, `managed`, etc. |
| `routePrefix` | Route path segment |
| `publicUrl` | Resolved endpoint URL |
| `revisionId` | Revision identifier (`rev_…`) |
| `runtimeProfile` | Runtime environment (e.g., `browser_maplibre_js`) |
| `deliveryArtifacts[]` | Artifacts served by the deployment |
| `runtimeConfig` | Injected runtime configuration |
| `visibility` | Access scope (e.g., `workspace_shared`, `public`) |
| `authPolicyRef` | Auth policy binding |
| `approvalPolicyRef` | Approval policy binding |
| `publicationState` | Publication lifecycle state (read-only) |

Edges: `targetRef` → `MapPackage` | `AppPackage` | `PublishedService`;
`deliveryArtifacts[]` → `ArtifactRef`.

### `honua://workspaces/{workspace_id}`

Projection of
[`WorkspaceRef`](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md#workspaceref).

| Field | Role |
|---|---|
| `workspaceId` | Stable identifier (`ws_…`) |
| `kind` | `WorkspaceKind` (`Scratch`, `Persistent`, `TempLayer`, `SavedLayer`, `ResultCollection`) |
| `label` | Human-readable label |
| `uri` | Canonical URI |
| `expiresAt?` | Expiration timestamp when applicable |
| `lifecycleState` | `WorkspaceLifecycleState` (`Active`, `Expired`, `Archived`, `Deleted`) |

### `honua://workspaces/{workspace_id}/artifacts/{artifact_id}`

Workspace-rooted view of an `ArtifactRef`. Fields match the result-rooted
view above; this surface is the lifecycle- and promotion-centric read path.

| Derived field | Source |
|---|---|
| `lifecycleState` | `ArtifactLifecycleState` |
| `promotionEligible` | Boolean derived server-side from policy evaluation |
| `expiresAt?` | Expiration timestamp when applicable |
| `sourceWorkspaceKind` | `WorkspaceKind` of the owning workspace |

MCP surfaces only the derived `promotionEligible` flag; the underlying
eligibility policy is server-internal and not exposed.

## Resource Relationship Model

The normative composition graph downstream consumers should code against:

| From | To | Relationship |
|---|---|---|
| `results/{id}` | `results/{id}/artifacts/{aid}` | composes (outcome-centric) |
| `results/{id}` | `workspaces/{wsid}` | references (`workspaceRefs[]`) |
| `results/{id}` | `results/{id}/provenance` | composes |
| `results/{id}` | `maps/{map_id}` | references (`mapPackageId?`, deferred) |
| `results/{id}` | `apps/{app_id}` | references (`appPackageId?`, deferred) |
| `results/{id}` | `GeoprocessingError[]` | composes (`errors[]`) |
| `maps/{id}` | `SourceBinding[]` | composes |
| `maps/{id}` | `styles/{style_id}` | references (`styleRefs[]`) |
| `maps/{id}` | `themes/{theme_id}` | references (`themeId`) |
| `maps/{id}` | `templates/maps/{tmpl_id}` | references (`templateId`) |
| `maps/{id}` | `results/{id}/artifacts/{aid}` | references (`boundArtifacts[]`, `previewArtifactId`) |
| `apps/{id}` | `maps/{map_id}` | references (`mapPackageId`) |
| `apps/{id}` | `results/{id}/artifacts/{aid}` | references (`bundleArtifactId`, `boundArtifacts[]`) |
| `apps/{id}` | `templates/apps/{tmpl_id}` | references (`templateId`) |
| `services/{id}` | `styles/{style_id}` | references (`styleRefs[]`) |
| `deployments/{id}` | `apps/{id}` \| `maps/{id}` \| `services/{id}` | references (`targetRef`) |
| `deployments/{id}` | `workspaces/{wsid}/artifacts/{aid}` | references (`deliveryArtifacts[]`) |
| `workspaces/{wsid}/artifacts/{aid}` | `results/{id}/artifacts/{aid}` | same underlying `ArtifactRef` |

Edges are expressed by canonical object name so field additions upstream
do not invalidate this graph. When a canonical shape changes field names,
the edge continues to resolve through the named relationship.

## Capability Coverage

The v1 capability matrix stays single-sourced in
[taxonomy.md §v1 Capability Matrix](taxonomy.md#v1-capability-matrix). This
document does not republish coverage columns. The mapping from workflow
family to resource family that downstream packaging and deployment
consumers should use is:

| Resource family | Analyze | Publish Data | Build App | Automate / Deploy |
|---|---|---|---|---|
| `results` | v1 | v1 | v1 | deferred |
| `results/{id}/artifacts` | v1 | v1 | v1 | deferred |
| `results/{id}/provenance` | v1 | v1 | v1 | deferred |
| `maps` | v1 | -- | v1 | -- |
| `apps` | -- | -- | v1 | -- |
| `styles`, `themes`, `templates/maps` | v1 | -- | v1 | -- |
| `templates/apps` | -- | -- | v1 | -- |
| `services` | -- | v1 | -- | deferred |
| `deployments` | -- | -- | -- | deferred |
| `workspaces`, `workspaces/{id}/artifacts` | v1 | v1 | v1 | deferred |

Coverage keys (`v1`, `deferred`, `--`, `excluded`) are defined in
[taxonomy.md §v1 Capability Matrix](taxonomy.md#v1-capability-matrix).

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
