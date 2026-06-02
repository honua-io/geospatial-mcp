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

```text
honua://{family_key}[/{instance_id}[/{subresource}[/{subresource_id}]]]
```

`{family_key}` is one or more path segments identifying the resource
family (for example `results`, `templates/maps`); the registered keys
appear in the family table below. `{instance_id}` identifies a specific
resource within the family; it is omitted for collection roots.
`{subresource}` names a child collection or singleton;
`{subresource_id}` is present for collection children (for example
`/artifacts/{aid}`) and absent for singletons (for example
`/provenance`).

The open-core data-access surface already exposes the collection
resource `honua://services` (see
[MCP_SERVER.md §Exposed MCP Resources](https://github.com/honua-io/honua-server/blob/main/docs/developer/MCP_SERVER.md#exposed-mcp-resources));
that resource remains valid under this grammar. Families introduced by
this document address instance resources (and their subresources) only;
they do not redefine collection roots.

Families introduced by this document:

| Family | URI form | Canonical source |
|---|---|---|
| Result package | `honua://results/{result_package_id}` | `AnalysisResultPackage` (v1; owns `resultPackageId`). `PublishingResultPackage`, `BuilderResultPackage`, and `DeploymentResultPackage` URIs are **reserved**: they reuse the same grammar once upstream defines a shared stable identifier (see §Publishing Result, §Builder Result, §Deployment Result) |
| Result artifact (outcome view) | `honua://results/{result_package_id}/artifacts/{artifact_id}` | `ArtifactRef` |
| Result provenance | `honua://results/{result_package_id}/provenance` | `ProvenanceRecord` |
| Map package | `honua://maps/{map_package_id}` | `MapPackage` |
| App package | `honua://apps/{app_package_id}` | `AppPackage` |
| Style | `honua://styles/{style_id}` | `StyleRef` (`geospatial.v1.StyleRef`, geospatial-grpc; resolved via the server OGC API – Styles surface) |
| Theme | `honua://themes/{theme_id}` | `ThemeSpec` |
| Map template | `honua://templates/maps/{map_template_id}` | `MapTemplate` |
| App template | `honua://templates/apps/{app_template_id}` | `AppPackage.templateId` (shape deferred) |
| Published service | `honua://services/{published_service_id}` | `PublishedService` |
| Deployment | `honua://deployments/{deployment_id}` | `Deployment` |
| Workspace | `honua://workspaces/{workspace_id}` | `WorkspaceRef` |
| Workspace artifact (lifecycle view) | `honua://workspaces/{workspace_id}/artifacts/{artifact_id}` | `ArtifactRef` |

ID prefixes follow the canonical examples in
[AI_OPERATOR_CONTRACT.md](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md):
`result_`, `map_`, `app_`, `style_`, `theme_`, `dep_`, `ws_`, `artifact_`,
`rev_`. Published-service identifiers follow the upstream `serviceId`
vocabulary; this document does not impose an MCP-local prefix convention for
them. Template IDs are stable registry-defined identifiers (for example
`analysis_default`, `analysis_dashboard`) surfaced through `templateId`; this
document does not mandate an MCP-local prefix convention for templates.

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
| `mapPackageId?` | Deferred reference; concrete shape finalizes in the packaging lifecycle (see §Downstream Coordination) |
| `appPackageId?` | Deferred reference; concrete shape finalizes in the packaging lifecycle (see §Downstream Coordination) |
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
promotion-centric. The two views address the same underlying `ArtifactRef`,
but neither inspection URI is stored in `ArtifactRef` itself.
`ArtifactRef.uri` remains the canonical content locator for the artifact
payload (for example a workspace layer path); it is not reinterpreted as
the `honua://workspaces/{workspace_id}/artifacts/{artifact_id}` inspection
route. The workspace-artifact route is a separate MCP projection keyed by
workspace and artifact identity and resolved by the workspace lifecycle
service. See §Artifact Addressing Rule.

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

### Reserved `honua://results/{id}` — Publishing Result

Reserved inspection-route grammar for `PublishingResultPackage` (specified in the
[Technical Plan](https://github.com/honua-io/honua-server/blob/main/docs/contributor/AI_OPERATOR_TECHNICAL_PLAN.md)).
The canonical shape is finalizing in `honua-server#730`; the Technical
Plan enumerates required fields at the responsibility level only. MCP
therefore describes the inspection projection by responsibility rather
than by concrete field names, consistent with the approach used for
`MapPackage` and `AppPackage` below. Upstream does not yet define a stable
identifier shared with `AnalysisResultPackage`, so this section is a
reserved subtype note rather than a constructible MCP resource contract.

**Identifier status:** deferred upstream. Once `honua-server#730` defines a
stable result identifier compatible with the shared `honua://results/{id}`
grammar, this reserved route will surface the following responsibilities
read-only.

**Inspection responsibilities surfaced read-only:**

- source-data lineage (upstream responsibility; concrete fields finalize
  with `honua-server#730`);
- quality-assessment outcome (upstream responsibility; concrete fields
  finalize with `honua-server#730`);
- published service reference (canonical `PublishedService` reference)
  or service-definition output branch (`serviceDefinition` field
  per the Technical Plan); the output branch is determined upstream;
- map package when spatially relevant (canonical `MapPackage` reference);
- provenance (canonical `ProvenanceRecord`).

Reserved edges once the shared identifier lands: published service or
service-definition output branch, quality-assessment outcome, map package,
provenance.
MCP exposes compositions by canonical object name or upstream field
reference; field names finalize alongside `honua-server#730`.

### Reserved `honua://results/{id}` — Builder Result

Reserved inspection-route grammar for `BuilderResultPackage` (specified in the
[Technical Plan](https://github.com/honua-io/honua-server/blob/main/docs/contributor/AI_OPERATOR_TECHNICAL_PLAN.md)).
The canonical shape is finalizing in the packaging lifecycle; the Technical
Plan enumerates required fields at the responsibility level only. MCP
therefore describes the inspection projection by responsibility rather
than by concrete field names. Upstream does not yet define a stable
identifier compatible with the shared `honua://results/{id}` grammar, so
this section is a reserved subtype note rather than a constructible MCP
resource contract.

**Identifier status:** deferred upstream. Once the packaging lifecycle
defines a stable result identifier compatible with the shared
`honua://results/{id}` grammar, this reserved route will surface the
following responsibilities read-only.

**Inspection responsibilities surfaced read-only:**

- app package (canonical `AppPackage` reference);
- map package when applicable (canonical `MapPackage` reference);
- preview artifacts (canonical `ArtifactRef` references);
- provenance (canonical `ProvenanceRecord`).

Reserved edges once the shared identifier lands: app package, map package,
preview artifacts, provenance. MCP exposes compositions by canonical object
name; upstream field names finalize alongside the packaging lifecycle (see
§Downstream Coordination).

### Reserved `honua://results/{id}` — Deployment Result

`DeploymentResultPackage` (specified in the
[Technical Plan](https://github.com/honua-io/honua-server/blob/main/docs/contributor/AI_OPERATOR_TECHNICAL_PLAN.md))
is deferred alongside the `Automate / Deploy` workflow column in
[taxonomy.md §v1 Capability Matrix](taxonomy.md#v1-capability-matrix). It
reuses the same reserved URI grammar (`honua://results/{id}`) once upstream
defines a shared stable identifier and its canonical shape finalizes in
`honua-server#732`.

## Asset Resources

### `honua://maps/{map_package_id}`

Projection of
[`MapPackage`](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md#mappackage).
The canonical shape is finalizing in the packaging lifecycle; the
[`AI_OPERATOR_CONTRACT`](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md#mappackage)
and
[`AI_OPERATOR_TECHNICAL_PLAN`](https://github.com/honua-io/honua-server/blob/main/docs/contributor/AI_OPERATOR_TECHNICAL_PLAN.md#mappackage)
sections still use different spellings for several properties
(`mapSpec` vs `honuaMapSpec`, `previewArtifactId` vs `previewArtifact`,
etc.). To avoid freezing a draft variant, MCP describes the inspection
projection by responsibility and by the canonical objects it references
rather than by concrete field names. Consumers read field names from
the canonical shape when the packaging lifecycle ticket lands.

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
the packaging lifecycle flow through by reference without invalidating
this surface.

### `honua://apps/{app_package_id}`

Projection of
[`AppPackage`](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md#apppackage).
The canonical shape is finalizing in the packaging lifecycle; the
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
canonical object name; upstream field renames in the packaging lifecycle
flow through by reference.

### `honua://styles/{style_id}`

Inspection projection of the canonical
[`StyleRef`](https://github.com/honua-io/geospatial-grpc/blob/main/geospatial/v1/style_types.proto)
message (`geospatial.v1.StyleRef` in geospatial-grpc). A style is an
addressable, encoding-independent 2D cartography object; the concrete encoded
representations live in `StyleRef.encodings` (one entry per encoding).

The canonical identifier is `styleId`, whose canonical URI form is
`honua://styles/{style_id}`. The server resolves this projection from its live
**OGC API – Styles** surface (honua-server, ADR-0048):

- `GET /ogc/styles` — the styles list (`{ styles: [{ id, title, links }],
  default? }`);
- `GET /ogc/styles/{styleId}` — the stylesheet body, content-negotiated by the
  `Accept` header (MapLibre/Mapbox style JSON by default; SLD 1.0/1.1 derived);
- `GET /ogc/styles/{styleId}/metadata` — descriptive metadata
  (`{ id, title, description, keywords, license, version, links }`).

**Stable identifier:** `styleId` (canonical examples use the `style_…` prefix;
in the Phase 1 OGC – Styles adapter the identifier is the styled collection's
resource name).

**Inspection fields surfaced read-only** (aligned with `StyleRef`):

| Field | Role |
|---|---|
| `styleId` | Stable identifier; canonical URI `honua://styles/{style_id}` |
| `title` | Human-readable style title |
| `description` | Optional free-form description / abstract |
| `styleVersion` | Author-managed integer version of the style document |
| `encodings[]` | `StyleEncoding` entries: `{ encoding, contentType, inlineBody? \| storageRef? }`. Canonical `encoding` values: `mapbox-style`, `sld-1.0.0`, `sld-1.1.0`, `esri-drawing-info`, `esri-image-renderer`, `3d-tiles-styling` |
| `legendUrl` | Optional legend graphic URL |

The MapLibre/Mapbox encoding (`mapbox-style`) is inlined (`inlineBody`); the
derived SLD encodings are advertised by reference (`storageRef` = the
`/ogc/styles/{styleId}` stylesheet URL, content-negotiated by `Accept`).

A styles catalog is also addressable at `honua://styles` — the list of
available styles, each with its `styleId`, `title`, and canonical
`honua://styles/{id}` URI, plus the server-designated `default` when present.

Edges: renderer, label, and popup composition are owned by the canonical
`StyleRef`; styles are consumed by `MapPackage` style composition and by
`PublishedService` styling composition. This projection is read-only — MCP
never mutates server-side styles; persisting a style onto a map or published
service stays with the gRPC execution layer (see
[taxonomy.md §MCP Role in the Architecture](taxonomy.md#mcp-role-in-the-architecture)).

### `honua://themes/{theme_id}`

Projection of
[`ThemeSpec`](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md#themespec).
The canonical source currently standardizes token families and examples
rather than a frozen property table, so MCP describes the inspection
projection by responsibility rather than by concrete field names.

**Stable identifier:** theme ID (prefix `theme_…`).

**Inspection responsibilities surfaced read-only:**

- color-ramp tokens;
- typography tokens;
- spacing and panel chrome;
- semantic status colors.

Edges: theme composition owned by the canonical `ThemeSpec`; themes are
referenced by `MapPackage` theme selection and by `AppPackage` runtime
presentation configuration. Concrete field names finalize upstream; the
resource URI and responsibility list stay stable under reference.

### `honua://templates/maps/{map_template_id}`

Projection of
[`MapTemplate`](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md#maptemplate).
The canonical source currently standardizes template role and examples
rather than a frozen property table, so MCP describes the inspection
projection by responsibility rather than by concrete field names.

**Stable identifier:** map-template ID (registry-defined; for example
`analysis_default`).

**Inspection responsibilities surfaced read-only:**

- cartographic composition class (for example analysis default, dashboard,
  print-friendly review);
- named slots for `SourceBinding` placement;
- default style and theme composition;
- layout and view presets that seed `MapPackage` generation.

Edges: template composition owned by the canonical `MapTemplate`; map
templates are referenced by `MapPackage.templateId`. Concrete field names
finalize upstream; the resource URI and responsibility list stay stable
under reference.

### `honua://templates/apps/{app_template_id}`

App-template inspection view. The canonical app-template shape is not yet
owned by a single honua-server type; it surfaces through
`AppPackage.templateId` and builder-side template registries. MCP
therefore standardizes the URI and template identity only, and passes
through builder-owned inspection metadata without renaming it.

**Stable identifier:** app-template ID (registry-defined, surfaced
through `AppPackage.templateId`).

**Inspection responsibilities surfaced read-only:**

- template identity carried by `AppPackage.templateId`;
- template class and label when published by the builder registry;
- additional builder-owned inspection metadata, passed through verbatim.

Edges: referenced by `AppPackage.templateId`. Concrete field names beyond
the template identity finalize alongside the packaging lifecycle ticket; until then
this resource does not create an MCP-local app-template field table.

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

**Stable identifier:** upstream `serviceId` (no MCP-local prefix convention
defined in this document).

**Inspection responsibilities surfaced read-only:**

- protocol surface enumeration (for example GeoServices, OGC API
  Features, WMS, WFS, OData, tile endpoints);
- styling composition (canonical `StyleRef` references bound to the
  service);
- source-to-service lineage summary;
- refresh state (read-only lifecycle signal).

Edges: referenced by `PublishingResultPackage.publishedService`
(canonical shape deferred; see §Publishing Result for the
`serviceDefinition` output branch), consumed by
`Deployment.targetRef`.
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
  `published_service`, `process`, `pipeline`);
- target binding (`targetRef` resolves to `AppPackage`, `MapPackage`,
  or `PublishedService` when the target has a defined MCP resource
  contract; `ProcessDefinition` and `PipelineDefinition` targets are
  surfaced as **opaque identifiers** — no MCP resource URI or inspection
  contract is defined for those families in this version (see
  [taxonomy.md §Resources](taxonomy.md#resources)); the full target set
  matches the upstream `Deployment` shape; deployment creation tooling
  for process and pipeline targets is deferred alongside the
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

Edges: `targetRef` → `AppPackage` | `MapPackage` | `PublishedService` |
`ProcessDefinition` | `PipelineDefinition`; delivery artifact
references → `ArtifactRef`. The full target-kind set matches the
upstream `Deployment` shape; deployment creation tooling for
process and pipeline targets is deferred alongside the
`Automate / Deploy` workflow column.
Concrete field names finalize alongside `honua-server#732`; the
resource URI and responsibility list stay stable under reference.

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
promotion-centric read path. It is keyed by workspace and artifact
identity through lifecycle ownership context; it does not reuse
`ArtifactRef.uri` as its inspection address. All cells below are MCP-layer
projections (not fields of `ArtifactRef` itself):

| Derived signal | Source |
|---|---|
| `lifecycleState` | `ArtifactLifecycleState` (from the workspace lifecycle service) |
| `promotionSourceReady` | Boolean: source-side preconditions met (artifact state is `Available`; owning workspace kind is temporary; owning workspace is `Active` before its `ExpiresAt`, or effectively `Expired` within the cleanup grace period with `AllowPromotionBeforeCleanup` enabled for its kind — a source past `ExpiresAt + CleanupGracePeriod` is no longer eligible). Target-side checks are evaluated at promotion time and are not projected here. |
| `expiresAt?` | Expiration timestamp when applicable |
| `sourceWorkspaceKind` | `WorkspaceKind` of the owning workspace |

MCP surfaces only the source-side `promotionSourceReady` flag. Full
promotion eligibility depends on a target workspace (kind must be durable,
state must be `Active`) and is evaluated server-side when a promotion
request supplies a `targetWorkspaceId`. The underlying eligibility policy
is server-internal and not exposed through the read surface.

## Resource Relationship Model

The normative composition graph downstream consumers should code against.
Edges are expressed by canonical object name (`ArtifactRef`, `StyleRef`,
`WorkspaceRef`, `SourceBinding`, …) rather than by the scoped URIs those
objects happen to resolve to. Upstream package shapes carry artifact IDs
without a result or workspace inspection scope, so downstream consumers
resolve result-rooted artifact reads from the owning analysis result
package's artifact fields (`AnalysisResultPackage.artifacts[]`) today.
Reserved non-analysis result routes extend the same pattern once upstream
lands a constructible shared result identifier. Workspace-rooted artifact
reads come from workspace ownership and lifecycle context (see
§Artifact Addressing Rule).

| From | To | Relationship |
|---|---|---|
| `results/{result_package_id}` | `ArtifactRef` | composes (`AnalysisResultPackage.artifacts[]`) |
| `results/{result_package_id}` | `WorkspaceRef` | references (`AnalysisResultPackage.workspaceRefs[]`) |
| `results/{result_package_id}` | `results/{result_package_id}/provenance` | composes (`AnalysisResultPackage.provenance`) |
| `results/{result_package_id}` | `MapPackage` | references (`AnalysisResultPackage.mapPackageId?`) |
| `results/{result_package_id}` | `AppPackage` | references (`AnalysisResultPackage.appPackageId?`) |
| `results/{result_package_id}` | `GeoprocessingError` | composes (`AnalysisResultPackage.errors[]`) |
| `maps/{id}` | `SourceBinding` | composes (binding list) |
| `maps/{id}` | `StyleRef` | references (style composition) |
| `maps/{id}` | `ThemeSpec` | references (theme selection) |
| `maps/{id}` | `MapTemplate` | references (template composition) |
| `maps/{id}` | `ArtifactRef` | references (preview and bound artifacts) |
| `apps/{id}` | `MapPackage` | references (map binding) |
| `apps/{id}` | `ArtifactRef` | references (bundle and bound artifacts) |
| `apps/{id}` | app-template registry entry | references (template binding via `AppPackage.templateId`; standalone shape deferred) |
| `services/{id}` | `StyleRef` | references (styling bound to the service, shape deferred to `honua-server#730`) |
| `deployments/{id}` | `AppPackage` \| `MapPackage` \| `PublishedService` \| `ProcessDefinition` (opaque) \| `PipelineDefinition` (opaque) | references (`targetRef`); navigable for families with MCP resource contracts; `ProcessDefinition` and `PipelineDefinition` targets are opaque identifiers in this version |
| `deployments/{id}` | `ArtifactRef` | references (delivery artifacts) |
| `ArtifactRef` | `workspaces/{wsid}/artifacts/{aid}` | inspected through workspace ownership and lifecycle context (not via `ArtifactRef.uri`) |
| `ArtifactRef` | `results/{rpid}/artifacts/{aid}` | resolves through the owning `AnalysisResultPackage.artifacts[]`; reserved builder-result routing extends this once upstream lands a stable shared result identifier |

Reserved non-analysis result extensions follow the same graph once
upstream lands a constructible shared result identifier: publishing
results reference `PublishedService` or the `serviceDefinition` output
branch, `MapPackage`, and `ProvenanceRecord`; builder results reference
`AppPackage`, `MapPackage`, preview `ArtifactRef` values, and
`ProvenanceRecord`; deployment-result routing stays deferred with the
`Automate / Deploy` workflow family.

Expressing edges by canonical object name keeps the graph stable when
upstream field names evolve. Upstream field additions or renames in
`MapPackage`, `AppPackage`, `Deployment`, and `PublishedService` (still
finalizing in `honua-server#730`/`#731`/`#732`) flow through by
reference.

### Artifact Addressing Rule

The canonical `ArtifactRef` (§AI_OPERATOR_CONTRACT) carries its own
content `uri` (for example
`honua://workspaces/ws_123/layers/candidate_parcels`). That locator points
to the artifact payload within the workspace namespace; it is not the MCP
inspection URI `honua://workspaces/{wsid}/artifacts/{aid}`. Package shapes
that reference artifacts (`MapPackage`, `AppPackage`, `Deployment`) carry
artifact references through canonical fields whose concrete names are
finalizing in `honua-server#731`/`#732`. Regardless of final spelling,
these references identify artifacts without embedding a result-package or
workspace inspection URI. Consumers therefore:

1. Resolve the artifact ID to its canonical `ArtifactRef` through a
   known ownership scope — the owning `AnalysisResultPackage`
   artifact fields or the workspace lifecycle service
   (`ListArtifacts`) — when they need payload information such as
   `kind`, `contentType`, `metadata`, or the content locator `uri`.
2. Use the result-rooted path
   (`honua://results/{rpid}/artifacts/{aid}`) when the owning result
   package scope is already known from context. Today this applies to
   `AnalysisResultPackage.artifacts[]`. Reserved builder-result
   routing extends the same rule once upstream defines a stable
   non-analysis result identifier.
3. Use the workspace-rooted path
   (`honua://workspaces/{wsid}/artifacts/{aid}`) only when the owning
   workspace identity is already known from context or resolved through
   the workspace lifecycle service.

MCP does not synthesize a scoped inspection URI from `ArtifactRef.uri`, and
it does not infer result or workspace scope from an unscoped artifact ID
alone. Scoped inspection routes exist only where result ownership or
workspace ownership is carried by the containing object or resolved by the
workspace lifecycle service.

**Resolution path for package-embedded artifact references.** Package
resources (`MapPackage`, `AppPackage`, `Deployment`) carry artifact
identifiers through canonical fields. No unscoped artifact lookup
exists in the public contract (`WorkspaceService` exposes
`ListArtifacts` scoped by workspace; there is no `GetArtifact`
by ID alone). Consumers resolve these identifiers to full
`ArtifactRef` objects through a known ownership context. The
target resolution sequence is: read the package resource → extract
the artifact identifier → match the identifier against `ArtifactRef`
objects obtained from the owning
`AnalysisResultPackage.artifacts[]` or from the workspace lifecycle
service (`ListArtifacts` on the owning workspace) → use workspace
ownership to construct the workspace-rooted inspection URI
(`honua://workspaces/{wsid}/artifacts/{aid}`) for lifecycle state.

Reserved builder-result artifact routing follows the same lookup shape
once upstream defines a stable non-analysis result identifier and makes
the `honua://results/{id}` builder route constructible.

Workspace ownership is resolvable through two mechanisms, neither of
which is unconditionally available today:

1. **Content URI convention** — `ArtifactRef.uri` (when populated)
   carries a workspace-scoped path (for example
   `honua://workspaces/ws_123/layers/candidate_parcels`) from which
   the owning workspace identity can be derived by convention.
   However, `ArtifactRef.Uri` is nullable in the canonical shape and
   `AddArtifactAsync` permits omitting it, so this path is available
   only when the producing workflow populates the content locator.
2. **Planned `workspaceRef` field** — the
   [Technical Plan](https://github.com/honua-io/honua-server/blob/main/docs/contributor/AI_OPERATOR_TECHNICAL_PLAN.md)
   specifies `workspaceRef` as a planned `ArtifactRef` field that
   will provide explicit workspace ownership. This field has not
   finalized upstream.

Until at least one mechanism is unconditionally present on every
`ArtifactRef` returned by the server, workspace-rooted lifecycle
inspection for a package-embedded artifact is available only when the
artifact's content URI is populated or `workspaceRef` is present.
Consumers should treat the absence of both as a deferred-resolution
case and fall back to the `ArtifactRef` payload fields (`kind`,
`contentType`, `metadata`) available from any scoped read that
returned the `ArtifactRef`.

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
| `maps`, `styles`, `themes`, `templates/maps` | Analyze, Publish Data, Build App, Automate / Deploy |
| `apps`, `templates/apps` | Analyze, Build App, Automate / Deploy |
| `services` | Publish Data, Automate / Deploy |
| `deployments` | Publish Data, Build App, Automate / Deploy |
| `workspaces`, `workspaces/{id}/artifacts` | Analyze, Publish Data, Build App, Automate / Deploy |

Whether any cell is `v1`, `deferred`, `--`, or `excluded` follows the
canonical taxonomy matrix and is not repeated here. When coverage
changes, the taxonomy matrix is the single edit point.

Current normative `results/{result_package_id}` resources are
analysis-owned. Publish Data, Build App, and Automate / Deploy consume
the result family through reserved subtype extensions that become
constructible once upstream defines stable non-analysis result
identifiers.

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

## Metadata Cache State

Metadata reads on MCP discovery and inspection surfaces MAY be served from a
platform metadata cache. The caching policy, cache-key inputs, TTLs,
revalidation behavior, and invalidation triggers are owned upstream by the
[platform metadata caching strategy](https://github.com/honua-io/honua-sdk-js/issues/62)
and the server/SDK contract it lands; this document does not define a TTL
table, a key-derivation algorithm, or an invalidation policy. What MCP owns is
the **read-surface projection**: a structured `cache` field that makes the
cache state of a metadata read visible to agents so they can distinguish fresh
discovery metadata from stale or degraded metadata and decide when to request a
refresh.

### Applicable Surfaces

The `cache` projection applies to **metadata-oriented** reads — the discovery,
catalog, and inspection surfaces that return descriptive metadata about a
source, layer, collection, capability, style, theme, template, or process:

- catalog and capability metadata (`CapabilityCatalog`);
- dataset and layer descriptors (`DatasetRef`, `LayerRef`, field and schema
  reads, including the open-core
  `honua://services/{encodedServiceId}/layers/{layerId}` route per
  [MCP_SERVER.md](https://github.com/honua-io/honua-server/blob/main/docs/developer/MCP_SERVER.md));
- process and pipeline descriptions (`ProcessDefinition`,
  `PipelineDefinition`);
- style, theme, and template inspection (`StyleRef`, `ThemeSpec`,
  `MapTemplate`, app-template registry entries);
- published-service metadata (`honua://services/{published_service_id}`),
  where the read returns descriptive service metadata rather than live feature
  state.

The `cache` projection is a transport-neutral envelope attached to the read
result; it does not replace or rename any canonical metadata field, and it is
never persisted into a canonical object shape. When a surface is not served
through the metadata cache, the projection MAY be omitted or carry the
`bypass` state (see below).

### Feature, Query, and Result Reads Are Not Default-Cached

Live feature state, ad hoc spatial query responses (bbox, geometry, nearest,
distance, CQL2/OData spatial, render/export), realtime deltas, and operational
incident rows are **not** default-cached tool results, consistent with the
upstream non-goals in
[honua-sdk-js#62](https://github.com/honua-io/honua-sdk-js/issues/62). Feature
and query tool outputs therefore do not carry a metadata `cache` projection by
default. A `cache` projection appears on a feature/query/result surface **only**
when the workflow explicitly consumes a materialized result (an opt-in
materialization, not baseline behavior); such a surface carries the projection
with the state that reflects the materialized artifact, never a metadata-cache
state implying the live source was cached.

### Cache State

`cache.state` is exactly one of the five states defined by the upstream
SDK/server cache contract. MCP surfaces them verbatim and does not introduce
synonyms:

| State | Meaning surfaced to the agent |
|---|---|
| `hit` | Metadata served from a fresh cache entry within its TTL |
| `miss` | No usable cache entry; metadata fetched from the source |
| `stale` | Cache entry served past its TTL while revalidation is pending or has not yet been attempted; the agent MUST treat the metadata as possibly out of date |
| `refreshed` | Cache entry was revalidated against the source on this read and is current |
| `bypass` | Cache was intentionally bypassed (for example a forced refresh or a non-cacheable surface); metadata is source-fresh and was not cached |

### Cache Projection Fields

The `cache` projection carries the following fields. Field shapes and exact
spellings are owned by the upstream cache contract and referenced here, not
redefined; MCP surfaces the subset relevant to read-state visibility and omits
a field when the value is not available from the cache layer.

| Field | Role |
|---|---|
| `state` | One of the five states above (REQ-002) |
| `keyFingerprint` | Opaque fingerprint of the cache key (tenant/auth-scope/source/layer/protocol/version inputs); identifies the entry without exposing the server-internal key derivation |
| `age` | Age of the served entry since it was populated or last revalidated |
| `ttl` | Time-to-live configured for the entry's metadata category |
| `revalidatedAt` | Timestamp of the most recent successful revalidation, when available |
| `validators` | Upstream validators carried for revalidation (for example `ETag`, `Last-Modified`), when available |
| `invalidationReason` | Reason the entry was invalidated or marked stale (for example source refresh, import job, migration, schema change, admin action), when available |
| `refreshErrorId` | Identifier of a failed revalidation attempt, present when a refresh was attempted and failed; correlates to the canonical [`GeoprocessingError`](#error-model) surfaced for the failure |

`keyFingerprint` is an opaque correlation handle. The cache key's component
inputs and derivation are server-internal (see §Non-Goals) and MUST NOT be
decomposed or reconstructed from the fingerprint on the read surface.

### Stale and Degraded Read Semantics

A read in the `stale` state, or a read whose `cache` projection carries a
`refreshErrorId`, is a **degraded** metadata read. The surface MUST present it
as such:

1. A tool summary MUST NOT present `stale` metadata as fresh, and MUST NOT
   imply realtime feature freshness from any metadata cache state (NFR-001).
   `hit` and `refreshed` describe metadata freshness only; they say nothing
   about the freshness of live feature state behind the source.
2. When `state` is `stale` or a `refreshErrorId` is present, the surface
   SHOULD signal that a refresh is available and MAY recommend requesting one.
   Requesting a refresh is a read-time revalidation of cached metadata; it is
   not a state mutation of the source and stays within the read-only boundary
   (§Non-Goals — No State Mutation).
3. A failed revalidation surfaces the failure through the canonical
   `GeoprocessingError` envelope (§Error Model); the metadata `cache`
   projection carries the correlating `refreshErrorId` and the last-known
   `state`. No MCP-local cache error code is introduced.

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
and must not leak through resource projections. Metadata cache-key
derivation, TTL policy, and invalidation-trigger evaluation are
server-internal; the read surface exposes only the `cache` projection
(state plus the visibility fields in §Metadata Cache State) and the opaque
`keyFingerprint`, never the key's component inputs or the policy that
produced them.

### 4. No AI Data Editing

Per [ADR-0028](https://github.com/honua-io/honua-server/blob/main/docs/contributor/adr/0028-ai-data-editing-not-allowed.md)
AI may inspect but must not autonomously edit source data. Resource reads
do not grant edit paths.

### 5. No Parallel Taxonomy, URI Scheme, or Error Envelope

Family names, capability matrix, URI scheme (`honua://`), and error
envelope (`GeoprocessingError`) stay single-sourced. Alternative schemes
(for example `mcp://`) are not introduced. The metadata cache states
(`hit`, `miss`, `stale`, `refreshed`, `bypass`) are owned by the upstream
cache contract (§Metadata Cache State); MCP surfaces them verbatim and does
not mint MCP-local cache states or synonyms.

### 6. No Inlined Canonical Shapes

Canonical shapes (`AnalysisResultPackage`, `MapPackage`, `AppPackage`,
`StyleRef`, `ThemeSpec`, `MapTemplate`, `SourceBinding`, `Deployment`,
`PublishedService`, `ProvenanceRecord`, `ArtifactRef`, `WorkspaceRef`,
`GeoprocessingError`) are referenced, not reproduced. When an upstream
shape finalizes (e.g., `MapPackage` in the packaging lifecycle ticket),
the resource contract absorbs the change by reference without local
redefinition.

## Observable Signals

Implementations should preserve the telemetry the taxonomy document relies
on and add resource-level signals where behavior changes:

- **Workflow status visibility** -- emit `GeoprocessingWorkflowStatus`
  on result reads.
- **Publication state visibility** -- emit `Deployment.publicationState`
  and published service refresh state on promotion-surface reads (concrete
  field name deferred until `honua-server#730` finalizes the
  `PublishedService` shape).
- **Artifact lifecycle state** -- emit `ArtifactLifecycleState` on
  artifact reads through either URI view; emit derived
  `promotionSourceReady` on workspace-rooted artifact reads only
  (source-side preconditions; result-rooted reads do not resolve
  promotion readiness).
- **Workspace lifecycle state** -- emit `WorkspaceLifecycleState` on
  workspace reads.
- **Metadata cache state** -- emit the `cache.state`
  (`hit`/`miss`/`stale`/`refreshed`/`bypass`) on metadata-oriented reads,
  with `keyFingerprint` for entry correlation and `refreshErrorId` when a
  revalidation attempt failed (§Metadata Cache State). Feature, query, and
  non-materialized result reads do not emit a metadata cache state.
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
| [`honua-server#730`](https://github.com/honua-io/honua-server/issues/730) | Publishing lifecycle surfaces |
| [`honua-server#731`](https://github.com/honua-io/honua-server/issues/731) | Map, app, and artifact packaging |
| [`honua-server#732`](https://github.com/honua-io/honua-server/issues/732) | Deployment lifecycle surfaces |
| [`honua-sdk-js#21`](https://github.com/honua-io/honua-sdk-js/issues/21) | JS SDK resource consumption |
| [`honua-sdk-js#29`](https://github.com/honua-io/honua-sdk-js/issues/29) | Map and app packaging in the JS runtime |

Sequencing: the resource grammar, inspection fields, lifecycle visibility,
and relationship graph above are the stable interface. Downstream tickets
finalize the concrete canonical shapes: `PublishedService` and
`PublishingResultPackage` in `honua-server#730`; `MapPackage` and
`AppPackage` in the packaging lifecycle ticket (`honua-server#731` per the
Technical Plan; the AI Operator Contract references `#730` in some
sections — downstream consumers should follow the ticket that lands the
concrete type).
Resource URIs remain valid because they reference those shapes by name.
