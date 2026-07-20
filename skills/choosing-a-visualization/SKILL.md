---
name: choosing-a-visualization
description: "Use when an agent must choose, compose, validate, or prepare to publish a geospatial visualization, including selecting a map form, classification, palette family, query shape, layer hierarchy, or safe preview workflow against a geospatial-mcp server."
---

# Choosing a Visualization

Choose a map that supports the question the viewer must answer. Treat the
server's advertised schema as authoritative and use only bare
`geospatial-mcp` operation names in portable plans.

## Establish the decision context

1. State the intended takeaway in one sentence.
2. Identify the audience, viewing scale, and whether exact lookup or broad
   pattern recognition matters more.
3. Discover MCP operation schemas through the protocol's `tools/list` request;
   `list_layers` discovers geospatial layers, not MCP tool schemas. Then inspect
   geometry type, field types, missingness, category cardinality, numeric range,
   sign, skew, units, denominator, and coordinate reference system with
   `list_layers` and a bounded `query_features` request. Use
   `summarize_statistics` when the optional `analysis` profile is advertised;
   otherwise request equivalent summary steps through `plan_analysis`.
4. Ask a focused clarification instead of inferring a denominator, semantic
   midpoint, category ordering, or publication audience.

Do not fetch unrestricted features merely to choose a visualization. Request
only the fields, extent, counts, or summaries needed for the decision.

## Choose the visual form

Use this order. Stop when a choice fits the question and data.

| Question and data | Preferred form | Guard |
|---|---|---|
| Locate or inspect distinct features | Individual points, lines, or polygon outlines | Preserve feature identity and useful attributes. |
| Compare named categories | Qualitative symbols or fills | Confirm categories are few enough to distinguish and have no implied magnitude. |
| Compare an ordered class | Ordered lightness or size | Preserve the declared order; do not invent equal numeric spacing. |
| Show a magnitude with one meaningful direction | Sequential lightness ramp | Use a scale that matches the distribution and units. |
| Show departure around a meaningful reference | Diverging ramp centred on that reference | Confirm the midpoint is substantively meaningful, not merely the sample mean. |
| Show direction, phase, season, or aspect | Cyclic scheme | Ensure the ends meet perceptually and are not read as low versus high. |
| Show a dense point pattern | Aggregated cells or a density surface | Prefer countable aggregation when readers need values; use a continuous surface only for pattern emphasis. |
| Compare a normalized value across areas | Choropleth | Require a defensible denominator. Raw totals usually encode area or population as much as the phenomenon. |

If geometry is available but the question is non-spatial, recommend a table or
chart rather than forcing a map.

## Choose classification and encoding

- Use a continuous scale when precise relative magnitude matters and the
  renderer remains legible.
- Use equal intervals when equal numeric differences must look equal and
  outliers do not collapse most observations.
- Use quantiles when rank and balanced class membership matter. State that
  adjacent classes may have small numeric differences.
- Use distribution-aware breaks when internal groupings are the intended
  story. Do not compare maps whose independently fitted breaks differ.
- Use explicit semantic thresholds for policy, safety, service levels, or
  other externally defined cutoffs. Record their source.
- Transform or normalize a heavy-tailed measure before styling when that
  operation preserves meaning. Explain transformed units.
- Use a qualitative palette for nominal values, an ordered-lightness palette
  for ordinal or sequential values, a two-sided palette for meaningful
  deviation, and a cyclic palette only for cyclic variables.
- Check contrast against the chosen background, color-vision accessibility,
  grayscale differentiation, missing-value treatment, and legend wording.

For parcel values, do not map countywide raw `landvalue` or `bldgvalue` as a
choropleth without addressing parcel area and the long tail. Consider a
documented per-area measure, a meaningful aggregation geography, explicit
thresholds, or a bounded local view. Treat zero and missing values separately.

## Shape the query before rendering

1. Push `where` and `bbox` constraints to `query_features`.
2. Specify `bboxSrid` and `outSrid` deliberately. Reproject with
   `reproject_features` or a planned equivalent when the source and display
   operations require different CRSs.
3. Project only required `outFields`; omit geometry for profiling when it is
   not needed.
4. Use `returnCountOnly`, summaries, or aggregation before sampling. Sample
   only to inspect feature-level character, and state the sampling method.
5. Use bounded `limit` and stable paging for feature inspection. Reduce
   `geometryPrecision` only when the intended scale tolerates it.

Cost cliffs include unbounded feature reads, client-side filtering, geometry
transfer during attribute-only profiling, per-feature styling on dense layers,
and reprojection after a large result has already crossed the network.

## Compose the layers

- Put contextual, broad-coverage layers below analytical layers; keep sparse
  reference features and essential labels above fills.
- Give stacked analytical layers distinct visual roles. Do not distinguish
  independent layers with barely different shades of one hue.
- Use opacity to establish hierarchy, not to rescue incompatible palettes.
- Choose a subdued background whose labels and terrain do not compete with
  the thematic layer.
- Gate detail by scale. If labels collide, reduce label density or remove the
  least useful layer before shrinking everything.
- Drop a layer when it does not change the takeaway, duplicates another
  encoding, obscures the primary evidence, or cannot remain legible at the
  target scale.

Inspect the advertised schemas before choosing a composition path. When the
live surface exposes enough non-mutating package inputs to bind the intended
sources and style, create an isolated package and use `preview_map_package`.
Use `refine_map_package` or `compose_mixed_protocol_map` only for the inputs
their live schemas advertise; do not assume a package accepts source bindings
or an initial view. If no non-mutating package path can express the candidate,
preview an already configured layer or return a composition plan for review.
Do not mutate a hosted layer merely to obtain a preview. Use
`apply_style_preset` only when the operator explicitly approves a persistent
default-style change. A direct `render_map` call accepts layers and an extent;
it does not accept palette or class-break instructions. Never fabricate
styling arguments on the render call.

## Preview and publishing gate

1. Prefer an isolated styled package with `preview_map_package` only when the
   advertised package schema can express it. Otherwise use `render_map` for an
   already configured layer or stop at a reviewable plan; do not first change
   that layer's persistent style unless the operator explicitly approved it.
2. Inspect the full intended extent and representative dense, sparse, edge,
   missing-value, and boundary areas.
3. Confirm title, legend, units, CRS, attribution, source date, accessibility,
   and limitations.
4. Keep the work private or draft unless the user requested publication and
   the target visibility is explicit.
5. Before `publish_result`, confirm stable source identity, provenance,
   redistribution rights, privacy review, package validation, and a way to
   verify the published endpoint. Do not imply that a successful preview is a
   publication.

## Anti-patterns

- Mapping raw area totals as a choropleth without a denominator.
- Using a rainbow ramp for an ordered magnitude.
- Using a diverging palette without a meaningful centre.
- Treating arbitrary integer codes as continuous quantities.
- Choosing quantiles by default and hiding materially unequal class widths.
- Fitting different breaks to maps that viewers are expected to compare.
- Fetching all features and filtering, aggregating, or reprojecting locally.
- Omitting CRS identifiers from an extent or silently mixing coordinate axes.
- Stacking similarly colored layers or allowing a background to dominate.
- Keeping every available layer and compensating with tiny labels or opacity.
- Mutating a hosted layer's default style solely to produce a preview.
- Sending palette or class-break fields to `render_map` when they are absent
  from its advertised schema.
- Publishing a draft without provenance, rights, privacy, visibility, and
  endpoint verification.

## Completion check

Report the chosen form, variable semantics, normalization, classification,
palette family, query bounds, CRS handling, layer order, removed alternatives,
preview evidence, and publication state. Mark any unsupported optional
operation and the canonical fallback used.
