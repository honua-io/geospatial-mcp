# MCP Canonical Dataset Corpus and Scenario Packs

**Status:** Draft
**Date:** 2026-04-20
**Scope:** Shared test universe for the geospatial MCP standard

This document defines the canonical open dataset corpus, fixture conventions,
and scenario-pack taxonomy used to validate geospatial MCP operator workflows
across implementations and agent runtimes. It is the single source of truth
for corpus layout and scenario-pack vocabulary. It does not redefine terms,
the v1 capability matrix, the URI grammar, reason codes, step kinds, or
reserved result-package routes; those remain in `spec/taxonomy.md`,
`spec/resources.md`, and `spec/planning.md`.

Upstream references (authoritative for canonical object shapes and
protocol vocabulary):

- [AI Operator Contract](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md)
- [AI Operator Technical Plan](https://github.com/honua-io/honua-server/blob/main/docs/contributor/AI_OPERATOR_TECHNICAL_PLAN.md)
- [AI-First Operator Architecture](https://github.com/honua-io/honua-server/blob/main/docs/contributor/AI_OPERATOR_ARCHITECTURE.md)
- [Deterministic Operator Workflow Results](https://github.com/honua-io/honua-server/blob/main/docs/developer/DETERMINISTIC_OPERATOR_WORKFLOW_RESULTS.md)
- [ADR-0028: AI-Driven Data Editing Is Not Allowed](https://github.com/honua-io/honua-server/blob/main/docs/contributor/adr/0028-ai-data-editing-not-allowed.md)
- [geospatial-grpc `spatial_types.proto`](https://github.com/honua-io/geospatial-grpc/blob/main/geospatial/v1/spatial_types.proto)
- [Taxonomy, Capability Matrix, and Non-Goals](taxonomy.md)
- [MCP Resource Contracts](resources.md)
- [Clarification, Elicitation, Planning, and Handoff Semantics](planning.md)

## 1. Scope and Relationship to Sibling Documents

This document specifies *what* downstream conformance and evaluation work
runs against. It commits to corpus layout, fixture descriptor conventions,
scenario-pack taxonomy, expected scenario shapes at responsibility level,
and coverage language only.

It defers:

- vocabulary (families, primitives, canonical concept model, v1 capability
  matrix, non-goals) to [taxonomy.md](taxonomy.md);
- URI grammar, per-family resource contracts, reserved result-package
  routes, and the artifact-addressing rule to [resources.md](resources.md);
- clarification reason codes, `AssumptionPolicy` semantics, per-family
  planning behavior, step kinds, and plan-handoff semantics to
  [planning.md](planning.md).

Where a vocabulary or contract term is fixed in one of those documents,
this one references it by name without restating it. The v1 capability
matrix and the reserved-subtype language for non-analysis result routes
are not duplicated here; when coverage changes, those sibling documents
remain the single edit point.

The corpus is a **standards artifact**: the document pins descriptor
shape, identifier rules, and expected scenario shape. Fixture byte
material is out of scope; downstream fixture-bundle work owns payload
materialization and distribution.

## 2. Corpus Layout and Fixture Conventions

### 2.1 Directory Grammar

A conforming corpus is organized as:

```
corpus/{family}/{domain}/{variant}/
```

where `{family}` is one of the family slugs registered in §8,
`{domain}` is a short topical slug (for example `sites`, `parcels`,
`admin-boundaries`), and `{variant}` identifies a specific fixture within
that domain (for example `basic`, `dirty-crs`, `wfs`). Each leaf
directory hosts one fixture: descriptor file(s) and any payload
references. The grammar matches the pack-identifier grammar (§8.1) on a
one-to-one basis so a pack identifier resolves deterministically to a
corpus path.

### 2.2 Pack Identifier Grammar

Pack identifiers use dot-separated slugs:

```
{family-slug}.{domain-slug}.{variant}
```

- `family-slug` MUST match a registered slug from §8.1.
- `domain-slug` identifies a thematic dataset (letters, digits, hyphens;
  underscores permitted only when the slug reuses an upstream step-kind
  spelling, as for `dirty.{step-kind}.*` packs in §6).
- `variant` identifies a specific configuration (letters, digits,
  hyphens; underscores permitted only when the slug is an adapter slug
  registered in §5 or a step-kind identifier registered in §6;
  additional dots are allowed within the variant for multi-part
  distinctions such as `dirty-crs.wfs`).

Step-kind variants inherit their slug verbatim from upstream step-kind
spellings (§6). Adapter-slug variants reuse the upstream
`SourceBinding.protocol` spelling where upstream pins one; where
upstream has not pinned a concrete protocol token, the adapter slug is
a corpus-local label whose authority is §5. The corpus does not mint
synonyms for already-pinned upstream tokens.

Examples: `synthetic.geom.basic`, `analyze.sites.flood-risk`,
`publish.parcels.dirty-crs`, `mirror.parcels.ogc_features`,
`dirty.inspect_source.malformed-file`.

### 2.3 Fixture Descriptor Conventions

Each fixture ships a descriptor that pins the deterministic surface.
Descriptor fields are recorded as free-form structured data keyed by
canonical object responsibility; concrete serialization format is a
corpus-bundle concern and is not prescribed here. Every descriptor MUST
carry:

| Descriptor field | Role |
|---|---|
| `packId` | Pack identifier per §2.2 |
| `coverage` | One of `analyst`, `publisher`, `both` (§8.2) |
| `family` | Family slug registered in §8.1 (one of `synthetic`, `analyze`, `publish`, `build-app`, `deploy`, `mirror`, `dirty`) |
| `sourceShape` | One of `file`, `database`, `service`, or `synthetic` (§4) |
| `crs` | One or more spatial references, each recorded as `{wkid, wkt}` tuple (both present, even for EPSG codes, to disambiguate WKT variants) |
| `extent` | Bounding box `[minX, minY, maxX, maxY]` in the primary CRS |
| `rowCounts` | Stable counts per feature class or record type, keyed by class name |
| `featureIdStrategy` | One of `sequential`, `deterministic-uuid`, `external`; when `deterministic-uuid`, the descriptor MUST pin the namespace and seed |
| `attributeSchema` | Field list with canonical type name and nullability flag; attribute types reuse canonical geospatial-grpc `AttributeValue` type names |
| `geometryTypes` | Subset of the geospatial-grpc geometry vocabulary (`PointGeometry`, `MultiPointGeometry`, `PolylineGeometry`, `PolygonGeometry`, `MultiPolygonGeometry`) with `z` / `m` presence flags |
| `payloadRef` | Opaque pointer to fixture bytes in the corpus bundle (not a `honua://` URI); resolves through the corpus-bundle distribution channel |
| `payloadLicense` | SPDX identifier or equivalent license declaration for the referenced bytes |
| `specVersion` | The `geospatial-mcp` spec version this fixture was authored against |

### 2.4 Determinism Rules

- Fixture identifiers, row counts, bounds, and CRS declarations MUST be
  stable across re-materializations of the same fixture version.
- Descriptors MUST NOT reference proprietary or closed-license source
  data. Mirror packs pointing at third-party open services document the
  service terms in `payloadLicense` and are expected to be substitutable
  by an open self-hosted mirror during conformance runs.
- Where a fixture carries non-ASCII attribute content, the descriptor
  MUST record the encoding and the exact code points exercised (for
  example, a single attribute field that exercises Latin-1 edge cases
  for `clean_records`). Full localization coverage is not in scope for
  v1.
- Descriptors MUST NOT carry conversational content, natural-language
  prompts, or client-agent phrasing; scenario expectations describe
  shape, not script.

### 2.5 Artifact and Workspace References in Fixtures

Fixture descriptors and expected scenario shapes reference artifacts
and workspaces using canonical object names
([`ArtifactRef`](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md#artifactref),
[`WorkspaceRef`](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md#workspaceref))
and the URI grammar fixed in
[resources.md §Resource URI Conventions](resources.md#resource-uri-conventions).
The corpus does not mint synthetic `honua://` URIs that do not resolve
under that grammar. Where a scenario expects a package-embedded
artifact reference, it cites the reference by canonical field
responsibility; concrete upstream field names are consumed by
reference, consistent with
[resources.md §Artifact Addressing Rule](resources.md#artifact-addressing-rule).

## 3. Canonical Synthetic Pack

A single foundational pack exercises the full geometry, CRS, null, and
edge-case surface that every workflow family may encounter. Downstream
conformance harnesses reuse this pack across analyst, publisher, and
builder scenarios; it is not family-scoped.

**Pack identifier:** `synthetic.geom.basic`
**Coverage:** `both`
**Source shape:** `synthetic`

**Geometry surface.** Points, multi-points, polylines, polygons, and
multi-polygons, each with optional `z` and `m` dimensions per the
geospatial-grpc geometry vocabulary cited above. Every non-empty geometry
kind MUST appear at least once; `z` and `m` presence are exercised on at
least one fixture entry per geometry kind that supports them.

**CRS surface.** At least four distinct spatial references:

1. `EPSG:4326` (geographic, primary reference frame);
2. `EPSG:3857` (web mercator);
3. one projected UTM zone appropriate to the synthetic extent;
4. one non-EPSG WKT-only definition (stable WKT recorded in the
   descriptor).

Every CRS declaration records both `wkid` and the exact `wkt` string
(§2.3).

**Edge-case surface.** The pack exercises:

- null geometry;
- empty geometry;
- self-intersecting polygon;
- sliver polygon (area below a stated tolerance recorded in the
  descriptor);
- non-closed ring (invalid polygon);
- antimeridian-crossing polyline and polygon;
- polygon with interior rings (donut);
- mixed-dimension collection within a single record set.

**Attribute surface.** Integer, float, string, boolean, timestamp, and
null values across fields. One string field carries a non-ASCII subset
(encoding recorded per §2.4) to exercise `clean_records` encoding
behavior.

**Why a single pack.** Keeping the geometry / CRS / edge-case surface in
one fixture lets downstream scenarios reference a single substrate for
invariants and lets the taxonomy of failure modes in §6 attach to the
same geometry set without duplicating bytes.

## 4. Publishing and Source Packs

Publishing and source packs cover the source-shape families that
[`PublishingIntent.sourceRefs`](https://github.com/honua-io/honua-server/blob/main/docs/contributor/AI_OPERATOR_TECHNICAL_PLAN.md#publishingintent)
addresses. Each `publish.source.*` pack is a clean source-shape
baseline, not an end-to-end Publish Data scenario: it fixes the source
descriptor and planning inputs that downstream publish scenarios (for
example, `publish.parcels.*`) and dirty packs (§6) reuse. Each pack
describes its inputs through the canonical `PublishingIntent.sourceRefs`
source responsibilities (source `kind`, `provider`, `locator`, and
`acquisitionMode`) and records the `PublishingIntent.publishTargets`
that a downstream publish scenario should exercise. The corpus does not
mint new source-kind or publish-target vocabulary; it reuses the
upstream set. `SourceBinding` is a `MapPackage` concept and is
referenced only by the map-package and mirror-pack contexts (§5), not
by the publish-source packs in this section.

| Pack identifier | Source shape | Purpose |
|---|---|---|
| `publish.source.file` | `file` | Flat-file ingestion baseline: small GeoJSON and CSV fixtures drawn from `synthetic.geom.basic`; exercises `inspect_source`, `infer_schema`, and `normalize_crs` on a clean starting point before a downstream publish step is layered on |
| `publish.source.database` | `database` | Database-table ingestion baseline (PostGIS-style): records schema, primary key, and spatial index role; exercises `inspect_source` and `map_schema` on a clean database starting point before downstream `publish_service` execution is layered on |
| `publish.source.service` | `service` | Existing-service ingestion baseline: references an external open service through `PublishingIntent.sourceRefs` (`kind: service`, `provider`, `locator`) to exercise clean service-source inspection and republish planning before a downstream publish step is layered on |

Each source-shape pack carries a single clean variant whose identifier
is the source-shape token itself (`file`, `database`, `service`); dirty
variants are defined in §6 and are layered on these base packs through
pack-id composition (for example, `publish.parcels.dirty-crs` builds on
the file-source variant defined here).

These baseline packs do not by themselves assert the §7.2 publishing
result-package, `PublishedService`, or scenario-level `ArtifactKind`
surfaces. Those expectations attach only when a downstream publish
scenario opts into end-to-end publication.

## 5. Protocol Mirror Packs

Protocol-mirror packs document which canonical adapters expose the same
logical dataset. Adapters come from the upstream
[`SourceBinding`](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md#sourcebinding)
set:

- GeoServices REST (`geoservices_feature_service`);
- OGC API Features (`ogc_features`);
- OGC API Maps;
- OGC API Tiles;
- WFS;
- WMS;
- OData (secondary, fulfilled through the canonical external JS library
  per `SourceBinding`).

Mirror packs are keyed by a logical pack identifier; each adapter is an
entry under that identifier. A logical pack MAY omit adapters for which
the dataset has no sensible surface (for example, WMS / OGC API Maps on
a feature-only dataset). Omitted adapters are documented explicitly; an
absent adapter is not a defect claim against the adapter.

| Logical pack | Dataset character | Adapters in scope |
|---|---|---|
| `parcels` | Polygon feature layer with stable attribute schema; primary feature-layer mirror substrate | GeoServices REST, OGC API Features, WFS, OData |
| `admin-boundaries` | Polygon feature layer; secondary feature-layer mirror with lighter attribute schema | OGC API Features, WFS |
| `basemap-imagery` | Raster basemap; primary map-image mirror substrate | OGC API Maps, WMS |
| `basemap-tiles` | Vector and raster tiles; primary tile mirror substrate | OGC API Tiles |

Pack identifiers under a logical pack follow
`mirror.{logical-pack}.{adapter-slug}`. Adapter slugs reuse a concrete
upstream `SourceBinding.protocol` token when one has been pinned
upstream. Today upstream only pins `geoservices_feature_service` and
`ogc_features` as concrete `SourceBinding.protocol` values
([AI_OPERATOR_CONTRACT.md §SourceBinding / §MapPackage](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md#sourcebinding));
WFS, WMS, OGC API Maps, OGC API Tiles, and OData are named only as
protocol families in upstream prose. The corpus therefore pins its own
labels for those adapters — `wfs`, `wms`, `ogc_maps`, `ogc_tiles`, and
`odata` — and carries them as corpus-local pack-identifier tokens, not
as claimed canonical `SourceBinding.protocol` values. When upstream
pins a concrete token for any of these adapters, the corpus label will
be replaced by the upstream spelling through a change to this document.
Non-first-party OData is scoped only to logical packs whose attribute
surface fits the canonical wrapper's entity-collection model; it is
not required for raster or tile mirrors.

Completeness is **per-adapter**, not per-pack. The corpus does not
assert that every logical pack mirrors across every adapter; it asserts
which adapters expose each logical pack. Downstream conformance harnesses
derive adapter coverage from this table rather than from per-pack
uniformity.

## 6. Dirty-Data Packs

Dirty-data packs are failure-mode families pinned to Publish Data step
kinds from [planning.md §4](planning.md#4-per-family-planning-behavior).
Each family names the step kind it exercises, the failure signature, and
the expected planning-plane or execution-plane outcome vocabulary. The
corpus does not introduce new step kinds or reason codes; it exercises
the existing ones.

| Step kind | Pack family slug | Failure signature |
|---|---|---|
| `inspect_source` | `dirty.inspect_source` | Malformed fixture bytes, truncated payloads, encoding drift between declared and actual source encoding |
| `infer_schema` | `dirty.infer_schema` | Ambiguous field types, mixed-type columns, numeric coercion loss |
| `map_schema` | `dirty.map_schema` | Schema drift between source and declared target, missing target fields, conflicting type mappings |
| `normalize_crs` | `dirty.normalize_crs` | Missing SR declaration, mislabeled SR, heterogeneous SR within a single collection |
| `clean_records` | `dirty.clean_records` | Null geometries, invalid polygons (self-intersection, non-closed rings), attribute encoding issues |
| `dedupe` | `dirty.dedupe` | Exact duplicate records, near-duplicate records, geometric duplicates with divergent attributes |
| `enrich` | `dirty.enrich` | Lookup-table gaps, join-key collisions, stale enrichment snapshots |
| `quality_check` | `dirty.quality_check` | Out-of-range attribute values, missing required fields, extent drift against a pinned reference |

Pack identifiers follow `dirty.{step-kind}.{variant}`; each variant
names a single failure signature in the corresponding family (for
example `dirty.normalize_crs.heterogeneous-sr`). Every dirty pack's
descriptor cites:

- the Publish Data step kind it exercises;
- the base pack it derives from (typically `synthetic.geom.basic` or
  one of the `publish.source.*` packs);
- the expected planning-plane outcome, expressed as either a
  `ClarificationReasonCode` surfaced by the planner (for user-resolvable
  ambiguities per [planning.md §2.1](planning.md#21-trigger-conditions))
  or a `GeoprocessingError.kind`
  ([planning.md §5.3](planning.md#53-post-handoff-execution--orchestration-plane))
  raised at validation or execution time.

Dirty packs do not invent new reason-code or error-kind values. Where a
failure mode is not user-fixable (for example, a malformed fixture at
`inspect_source`), the expected outcome is a `GeoprocessingError.kind`
such as `ValidationFailed`, not a `ClarificationRequest`, consistent
with [planning.md §3.1](planning.md#31-resource-scoping-contract).

## 7. Expected Scenario Shapes Per Workflow Family

Every workflow family has a scenario-shape specification recorded here.
Each specification lists the canonical intent object, the minimum plan
step kinds the scenario exercises, the clarification codes expected to
trigger or suppress under each `AssumptionPolicy`, the canonical
result-package and resource URI the scenario expects, the expected
`ArtifactKind` values (literal `ArtifactKind` enum members per
[resources.md §Result Package Resources](resources.md#result-package-resources)),
and any expected resource projections (canonical references such as
`PublishedService`, `AppPackage`, `MapPackage`, `Deployment`, and
`honua://...` bindings, which are not `ArtifactKind` values). All
references stay at responsibility level, consistent with how
[resources.md](resources.md) handles `MapPackage`, `AppPackage`, and
`Deployment` while upstream field names finalize.

### 7.1 Analyze

- **Canonical intent:** `AnalysisIntent`.
- **Minimum step kinds exercised:** at least two of `QueryFeatures`,
  `Geoprocess`, `Aggregate`, `RenderMap`, `Export`
  ([planning.md §4](planning.md#4-per-family-planning-behavior);
  Analyze step-kind casing follows `AI_OPERATOR_CONTRACT.md`
  §AnalysisPlan per planning.md §4).
- **Clarification coverage (per policy):**
  - `AskAlways`: scenarios MUST cover at least one occurrence each of
    `MissingRequiredInput`, `AmbiguousDataset`, `AmbiguousProcess`,
    `PolicyBoundary`, `LowConfidence`, and `DestructiveAction` (when
    the plan emits mutating steps);
  - `AskWhenMaterial`: scenarios MUST cover material and immaterial
    resolutions for `AmbiguousDataset`, `AmbiguousProcess`, and
    `MissingRequiredInput` per the materiality criterion in
    [planning.md §2.3](planning.md#23-assumptionpolicy-behavior);
  - `UseDefaults`: scenarios MUST cover at least one suppression with
    a safe default for each of `AmbiguousDataset`, `AmbiguousProcess`,
    and `LowConfidence`, and MUST verify non-suppression of
    `DestructiveAction` and `PolicyBoundary` (the in-scope
    non-suppressible set for Analyze per
    [planning.md §2.1](planning.md#21-trigger-conditions)).
- **Result package and resource URI:** `AnalysisResultPackage`
  surfaced under `honua://results/{result_package_id}`
  ([resources.md §Result Package Resources](resources.md#result-package-resources)),
  with `honua://results/{rpid}/artifacts/{aid}` and
  `honua://results/{rpid}/provenance` available.
- **Expected `ArtifactKind` values:** scenarios MUST produce at least
  one of `FeatureLayer` or `Table`, plus `Report`; scenarios that
  request a map additionally produce `Map`.
- **Expected resource projections:** scenarios that request a map
  additionally surface a `honua://maps/{id}` binding.

### 7.2 Publish Data

- `publish.source.*` packs from §4 are the clean source-shape baselines
  for this family. The shape below governs end-to-end Publish Data
  scenarios such as `publish.parcels.*`, not those baseline descriptors.
- **Canonical intent:** `PublishingIntent`.
- **Minimum step kinds exercised:** `inspect_source` followed by
  step kinds required by the pack's failure or clean signature, ending
  in `publish_service`; `compose_map` is exercised when the pack
  publishes a map surface.
- **Clarification coverage (per policy):**
  - `AskAlways`: scenarios MUST cover `MissingRequiredInput`,
    `AmbiguousDataset`, `AmbiguousProcess`, `DestructiveAction`,
    `PublishAction`, `PolicyBoundary`, and `LowConfidence`;
  - `AskWhenMaterial`: same, with materiality distinguished per
    [planning.md §2.3](planning.md#23-assumptionpolicy-behavior);
  - `UseDefaults`: scenarios MUST verify non-suppression of
    `DestructiveAction`, `PublishAction`, and `PolicyBoundary` even
    when the suppressible set is exercised.
- **Result package and resource URI:** publishing scenarios expect a
  `PublishingResultPackage` surfaced under the reserved
  `honua://results/{id}` publishing route per
  [resources.md §Reserved `honua://results/{id}` — Publishing Result](resources.md#reserved-honuaresultsid--publishing-result);
  the expected route becomes constructible once upstream defines a
  shared stable identifier. The `PublishedService` surface projects
  under `honua://services/{published_service_id}`
  ([resources.md §Promotion-Surface Resources](resources.md#promotion-surface-resources)).
- **Expected `ArtifactKind` values:** `FeatureLayer` or `Table`.
- **Expected resource projections:** a canonical `PublishedService`
  reference (or the `serviceDefinition` output branch per the upstream
  Publishing result shape).

### 7.3 Build App

- **Canonical intent:** `BuilderIntent`.
- **Minimum step kinds exercised:** `select_template`, one or more of
  `bind_map_package`, `bind_artifacts`, `compose_widget`,
  `compose_workflow`, followed by `generate_project`; `preview_app`
  is exercised when the scenario asks for a preview.
- **Clarification coverage (per policy):**
  - `AskAlways`: `MissingRequiredInput`, `AmbiguousDataset` (when
    binding data), `LowConfidence`, `PolicyBoundary`, and
    `PublishAction` (when publishing the app);
  - `AskWhenMaterial`: materiality applies to `MissingRequiredInput`
    and `AmbiguousDataset`;
  - `UseDefaults`: verify non-suppression of `PublishAction` and
    `PolicyBoundary`.
- **Result package and resource URI:** Build App scenarios expect an
  `AppPackage` surfaced under `honua://apps/{app_package_id}`
  ([resources.md §`honua://apps/{app_package_id}`](resources.md#honuaappsapp_package_id)).
  `BuilderResultPackage` routing under the reserved
  `honua://results/{id}` builder route becomes constructible once
  upstream defines a shared stable identifier
  ([resources.md §Reserved `honua://results/{id}` — Builder Result](resources.md#reserved-honuaresultsid--builder-result));
  scenarios until then assert on the `honua://apps/{id}` projection.
- **Expected `ArtifactKind` values:** scenarios produce an `AppBundle`
  artifact; scenarios that bind a map additionally produce a `Map`
  artifact.
- **Expected resource projections:** a canonical `AppPackage`
  reference; scenarios that bind a map additionally surface a
  `honua://maps/{id}` binding. Build App output vocabulary remains
  upstream-owned per [planning.md §4.3](planning.md#43-build-app);
  scenarios cite `AppBundle` as the upstream `ArtifactKind` and emit
  the `app_package` / `preview` spellings used in the canonical
  Builder examples without introducing a third synonym.

### 7.4 Automate / Deploy

**Normative shape only; v1 coverage deferred** consistent with the
`Automate / Deploy` column in the v1 capability matrix.

- **Canonical intent:** `DeploymentIntent` carrying `targetRefs`,
  `schedule`, and `publicationScope`
  ([planning.md §4.4](planning.md#44-automate--deploy)).
- **Minimum step kinds exercised:** `register_definition` first,
  followed by `configure_schedule`, `configure_approvals`,
  `configure_runtime`, and `publish`; `rollback` is exercised only in
  recovery scenarios.
- **Clarification coverage:** scenarios exercise `MissingRequiredInput`,
  `PublishAction`, `DestructiveAction`, `PolicyBoundary`, and
  `LowConfidence`; all three policies apply to the same non-suppressible
  set
  ([planning.md §2.3](planning.md#23-assumptionpolicy-behavior)).
- **Result package and resource URI:** scenarios expect a canonical
  `Deployment` surfaced under `honua://deployments/{deployment_id}`
  ([resources.md §`honua://deployments/{deployment_id}`](resources.md#honuadeploymentsdeployment_id));
  `DeploymentResultPackage` routing stays reserved under
  [resources.md §Reserved `honua://results/{id}` — Deployment Result](resources.md#reserved-honuaresultsid--deployment-result).
- **Expected `ArtifactKind` values:** none; deploy scenarios produce
  canonical resource references rather than new `ArtifactKind`
  artifacts.
- **Expected resource projections:** target binding resolves to
  `AppPackage`, `MapPackage`, or `PublishedService` when the target
  has a defined MCP resource contract; `ProcessDefinition` and
  `PipelineDefinition` targets appear as opaque identifiers per
  resources.md.

## 8. Scenario-Pack Taxonomy

### 8.1 Family Slugs

The corpus registers the following top-level family slugs. They are not
a parallel workflow-family taxonomy; workflow families remain fixed in
[taxonomy.md §Workflow Families](taxonomy.md#workflow-families).

| Family slug | Purpose |
|---|---|
| `synthetic` | Foundational geometry / CRS / edge-case substrate (§3) |
| `analyze` | Analyze scenarios (§7.1) |
| `publish` | Publish Data scenarios and source-shape packs (§4, §7.2) |
| `build-app` | Build App scenarios (§7.3) |
| `deploy` | Automate / Deploy scenarios, normative shape only (§7.4) |
| `mirror` | Protocol-mirror packs (§5) |
| `dirty` | Dirty-data failure-mode packs bound to Publish Data step kinds (§6) |

Adding a new family slug requires an update to this document and a
matching scenario-pack taxonomy entry; the workflow-family taxonomy and
capability matrix stay owned by [taxonomy.md](taxonomy.md).

### 8.2 Coverage Flag

Each pack declares a coverage flag so analyst-facing and publisher-facing
surface area is unambiguous:

| Coverage | Applies to |
|---|---|
| `analyst` | Packs that primarily exercise analyst surfaces (`AnalysisIntent`, map composition without publication, builder preview surfaces that do not publish) |
| `publisher` | Packs that primarily exercise publisher surfaces (`PublishingIntent`, `PublishedService`, promotion) |
| `both` | Packs whose output is consumed across analyst and publisher surfaces (the canonical synthetic pack, protocol mirrors, and packs whose publish output feeds downstream analysis) |

Deployment-family packs declare coverage consistent with the underlying
promotion target (analyst for app promotion, publisher for service
promotion); the deferred status of `Automate / Deploy` does not change
the coverage flag vocabulary.

### 8.3 Pack Catalog

The v1 pack catalog is this document's single corpus coverage source.
Capability status for any cell follows the taxonomy matrix per §1. The
`Protocol mirrors` column carries the pack's adapter slugs as defined
in §5; `geoservices_feature_service` and `ogc_features` reuse concrete
upstream `SourceBinding.protocol` tokens, while `wfs`, `wms`,
`ogc_maps`, `ogc_tiles`, and `odata` are corpus-local labels until
upstream pins concrete tokens for those adapters. The
`Expected ArtifactKind values` column lists only literal `ArtifactKind`
enum members; the `Expected resource projections or outcomes` column
captures canonical resource references (`PublishedService`,
`AppPackage`, `MapPackage`, `Deployment`), `honua://...` bindings, and
planner- or execution-plane outcomes (`ClarificationRequest` codes,
`GeoprocessingError.kind` values) that are not `ArtifactKind` values.
`publish.source.*` rows are baseline descriptors, not end-to-end
publish scenarios; they therefore record baseline-only outcomes instead
of the §7.2 publishing-result / `PublishedService` surfaces.

| Pack identifier | Family | Coverage | Source shape | Protocol mirrors | Dirty-data families exercised | Expected `ArtifactKind` values | Expected resource projections or outcomes |
|---|---|---|---|---|---|---|---|
| `synthetic.geom.basic` | `synthetic` | `both` | `synthetic` | -- | -- | `FeatureLayer` (substrate only; no scenario-level outputs) | -- |
| `analyze.sites.basic` | `analyze` | `analyst` | `synthetic` | -- | -- | `FeatureLayer`, `Report` | -- |
| `analyze.sites.with-map` | `analyze` | `analyst` | `synthetic` | -- | -- | `FeatureLayer`, `Map`, `Report` | `honua://maps/{id}` binding |
| `analyze.hazard.flood-zone` | `analyze` | `analyst` | `synthetic` + `mirror.admin-boundaries.*` | `ogc_features`, `wfs` (via `admin-boundaries`) | -- | `FeatureLayer`, `Map`, `Report` | `honua://maps/{id}` binding |
| `analyze.service-coverage.baseline` | `analyze` | `analyst` | `synthetic` + `mirror.parcels.*` | `geoservices_feature_service`, `ogc_features`, `wfs` (via `parcels`) | -- | `FeatureLayer`, `Aggregate`-backed `Table`, `Report` | -- |
| `publish.source.file` | `publish` | `publisher` | `file` | -- | -- | -- | Source baseline only; no §7.2 publishing-result or `PublishedService` projection |
| `publish.source.database` | `publish` | `publisher` | `database` | -- | -- | -- | Source baseline only; no §7.2 publishing-result or `PublishedService` projection |
| `publish.source.service` | `publish` | `publisher` | `service` | -- | -- | -- | Source baseline only; no §7.2 publishing-result or `PublishedService` projection |
| `publish.parcels.file-ingest` | `publish` | `publisher` | `file` | -- | `inspect_source` (clean baseline) | `FeatureLayer` | `PublishedService` reference |
| `publish.parcels.dirty-crs` | `publish` | `publisher` | `file` | -- | `normalize_crs` | `FeatureLayer` | `PublishedService` reference |
| `publish.parcels.dirty-dedupe` | `publish` | `publisher` | `database` | -- | `dedupe` | `FeatureLayer` | `PublishedService` reference |
| `publish.parcels.dirty-quality` | `publish` | `publisher` | `file` | -- | `quality_check` | `FeatureLayer` | `PublishedService` reference |
| `publish.parcels.dirty-enrich` | `publish` | `publisher` | `database` | -- | `enrich` | `FeatureLayer` | `PublishedService` reference |
| `mirror.parcels.geoservices_feature_service` | `mirror` | `both` | `service` | `geoservices_feature_service` | -- | `FeatureLayer` (mirror exposure) | -- |
| `mirror.parcels.ogc_features` | `mirror` | `both` | `service` | `ogc_features` | -- | `FeatureLayer` (mirror exposure) | -- |
| `mirror.parcels.wfs` | `mirror` | `both` | `service` | `wfs` | -- | `FeatureLayer` (mirror exposure) | -- |
| `mirror.parcels.odata` | `mirror` | `both` | `service` | `odata` (via canonical external wrapper) | -- | `Table` (mirror exposure) | -- |
| `mirror.admin-boundaries.ogc_features` | `mirror` | `both` | `service` | `ogc_features` | -- | `FeatureLayer` (mirror exposure) | -- |
| `mirror.admin-boundaries.wfs` | `mirror` | `both` | `service` | `wfs` | -- | `FeatureLayer` (mirror exposure) | -- |
| `mirror.basemap-imagery.wms` | `mirror` | `both` | `service` | `wms` | -- | `Raster` (mirror exposure) | -- |
| `mirror.basemap-imagery.ogc_maps` | `mirror` | `both` | `service` | `ogc_maps` | -- | `Raster` (mirror exposure) | -- |
| `mirror.basemap-tiles.ogc_tiles` | `mirror` | `both` | `service` | `ogc_tiles` | -- | `Raster` (tile-set mirror exposure) | -- |
| `dirty.inspect_source.malformed-file` | `dirty` | `publisher` | `file` | -- | `inspect_source` | -- | Expected rejection via `GeoprocessingError.kind = ValidationFailed` |
| `dirty.infer_schema.mixed-types` | `dirty` | `publisher` | `file` | -- | `infer_schema` | -- | Expected `ClarificationRequest` with `MissingRequiredInput` / `AmbiguousProcess` as mapped by the planner |
| `dirty.map_schema.source-target-drift` | `dirty` | `publisher` | `database` | -- | `map_schema` | -- | Expected `ClarificationRequest` with `MissingRequiredInput` |
| `dirty.normalize_crs.heterogeneous-sr` | `dirty` | `publisher` | `file` | -- | `normalize_crs` | -- | Expected `ClarificationRequest` with `MissingRequiredInput`; resolution bakes CRS into plan step inputs |
| `dirty.clean_records.invalid-polygon` | `dirty` | `publisher` | `file` | -- | `clean_records` | -- | Expected `ClarificationRequest` with `DestructiveAction` |
| `dirty.dedupe.geometric` | `dirty` | `publisher` | `database` | -- | `dedupe` | -- | Expected `ClarificationRequest` with `DestructiveAction` |
| `dirty.enrich.lookup-gaps` | `dirty` | `publisher` | `database` | -- | `enrich` | -- | Expected `ClarificationRequest` with `MissingRequiredInput` |
| `dirty.quality_check.out-of-range` | `dirty` | `publisher` | `file` | -- | `quality_check` | -- | Expected rejection via `GeoprocessingError.kind = ValidationFailed` |
| `build-app.dashboard.basic` | `build-app` | `analyst` | `synthetic` | -- | -- | `AppBundle` | Canonical `AppPackage` reference |
| `build-app.field-ops.analysis-bound` | `build-app` | `analyst` | `synthetic` | -- | -- | `AppBundle`, `Map` | Canonical `AppPackage` and `MapPackage` references; `honua://maps/{id}` binding |
| `deploy.app.promotion` | `deploy` | `analyst` | `synthetic` | -- | -- | -- | Canonical `Deployment` reference (deferred per capability matrix) |
| `deploy.service.promotion` | `deploy` | `publisher` | `service` | -- | -- | -- | Canonical `Deployment` reference (deferred per capability matrix) |

The catalog is the single corpus coverage source. It does not republish
the v1 capability matrix; a cell marked `--` means the pack does not
participate in that dimension, not that the capability is out of scope.
Capability status flows from [taxonomy.md §v1 Capability Matrix](taxonomy.md#v1-capability-matrix).

## 9. Non-Goals

These items are explicitly out of scope for the geospatial MCP corpus
standard. They preserve the boundaries established in the sibling
documents.

### 1. No Production or Proprietary Data

The corpus is synthetic or drawn from permissively licensed open
sources. No proprietary datasets, customer data, or license-restricted
content may be introduced as fixtures or mirror substrates.

### 2. No Execution Harness Definition

Harness contract, runner invocation, and evaluation-result schema are
not defined here. Those are the scope of `geospatial-mcp#5` and
`honua-devops#29`; this document provides the test universe the harness
runs against.

### 3. No AI Data Mutation Fixtures

Per [ADR-0028](https://github.com/honua-io/honua-server/blob/main/docs/contributor/adr/0028-ai-data-editing-not-allowed.md),
AI-driven source-data mutation is excluded from the operator contract.
Corpus fixtures that model data mutation do so only within Publish Data
pipeline step boundaries (`clean_records`, `dedupe`, `enrich`,
`normalize_crs`) that operate on materialized output under operator
intent; the corpus does not define scenarios that present AI-authored
edits to source datasets as authoritative.

### 4. No Parallel Taxonomy, URI Scheme, Reason-Code Set, Step-Kind Set, or Error Envelope

Family names, the capability matrix, the URI scheme (`honua://`),
clarification reason codes, step kinds, and the error envelope
(`GeoprocessingError`) stay single-sourced in their respective sibling
documents. The corpus references them; it does not mint synonyms.

### 5. No Inlined Canonical Shapes

Canonical shapes (`AnalysisIntent`, `PublishingIntent`, `BuilderIntent`,
`DeploymentIntent`, the `*Plan` family, `AnalysisResultPackage`,
`MapPackage`, `AppPackage`, `PublishedService`, `Deployment`,
`ProvenanceRecord`, `ArtifactRef`, `WorkspaceRef`, `SourceBinding`,
`GeoprocessingError`) are referenced by name, not reproduced. When an
upstream shape evolves, scenario shapes absorb the change by
reference.

### 6. No Protocol-Specific Client SDK Guidance

The corpus does not prescribe client-library selection, adapter
implementation strategy, or wire-encoding choices for any protocol. It
documents which adapters expose each logical dataset (§5) and stops
there. Adapter behavior stays below the MCP contract layer.

### 7. No Fixture Bytes In This Repository

Payload bytes live in a corpus-bundle distribution owned outside this
repository. The standards document defines descriptor shape and
identifier rules; fixture materialization is a downstream dependency
(see §11).

## 10. Observable Signals

Implementations and conformance harnesses should emit corpus-plane
signals that extend the signal sets in
[taxonomy.md §Observable Signals](taxonomy.md#observable-signals) and
[planning.md §7](planning.md#7-observable-signals). Signal categories,
not prescribed metric names or instrumentation frameworks:

- **Pack coverage per workflow family.** Which pack identifiers in the
  v1 catalog (§8.3) executed successfully, broken down by workflow
  family slug.
- **Protocol-mirror coverage per adapter.** Which `SourceBinding`
  adapters exercised a mirror pack successfully, broken down by
  logical pack and adapter slug; asymmetry (OData scope, missing map
  or tile mirrors for feature-only packs) stays visible.
- **Dirty-data family coverage per Publish Data step kind.** Which
  `dirty.{step_kind}.*` variants fired, with the mapped
  `ClarificationReasonCode` or `GeoprocessingError.kind` the planner or
  execution host surfaced.
- **Scenario pass-versus-fail distribution per workflow family.** For
  each family, the fraction of scenarios whose expected outcome
  matched the observed planning-plane or execution-plane outcome;
  mismatches are reported with the canonical
  `ClarificationReasonCode`, `ArtifactKind`, or
  `GeoprocessingError.kind` mismatch reason.
- **Coverage-flag balance.** Ratio of `analyst` to `publisher` to
  `both` pack executions per run, so analyst-versus-publisher
  coverage is visible at the harness level.
- **Non-goal rejection signals.** Counts of attempts to execute
  scenarios that violate §9: proprietary-data references,
  AI-mutation-style scenarios, synthesized parallel reason codes or
  step kinds, fixture bytes hosted inside this repository.
- **Determinism drift.** Per fixture, counts of deterministic-surface
  violations (identifier drift, row-count drift, CRS-declaration drift,
  extent drift) relative to the descriptor-pinned values.

Adding a new pack family, coverage flag value, dirty-data step
binding, or protocol mirror in future changes to this document MUST
include a corresponding signal category here so coverage tracking
remains complete.

## 11. Downstream Coordination

This document unblocks the following consumers; they own their
implementation details.

| Consumer | Dependency |
|---|---|
| [`honua-server#734`](https://github.com/honua-io/honua-server/issues/734) | Conformance harness corpus reuse (eval task corpus materialization) |
| [`honua-sdk-js#21`](https://github.com/honua-io/honua-sdk-js/issues/21) | JS SDK resource consumption against corpus fixtures |
| [`honua-sdk-js#22`](https://github.com/honua-io/honua-sdk-js/issues/22) | JS SDK workflow coverage against Analyze and Build App scenario packs |
| [`honua-sdk-js#29`](https://github.com/honua-io/honua-sdk-js/issues/29) | Map and app packaging conformance against `analyze.*.with-map` and `build-app.*` scenario packs |
| [`honua-devops#29`](https://github.com/honua-io/honua-devops/issues/29) | Automation of conformance runs over the corpus |
| [`geospatial-mcp#5`](https://github.com/honua-io/geospatial-mcp/issues/5) | Evaluation harness authoring; consumes pack identifiers and expected scenario shapes from this document |

Sequencing: the corpus layout, pack identifiers, fixture descriptor
fields, and expected scenario shapes above are the stable interface.
Downstream tickets materialize fixture bytes, adapter-specific test
execution, and harness orchestration; they do not alter pack
identifiers, family slugs, or the coverage flag vocabulary without a
change to this document. The reserved result-package routes referenced
in §7 become constructible as upstream lands stable identifiers per
[resources.md §Downstream Coordination](resources.md#downstream-coordination).
