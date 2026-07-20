---
name: query-shaping
description: "Use when an agent must retrieve, summarize, sample, page, or reproject geospatial data without unbounded provider work, truncation, CRS ambiguity, or unnecessary sensitive fields."
---

# Query Shaping

Shape the smallest server-side request that can answer the question, then prove
that the result is complete enough for the claim being made.

## Establish the query contract

1. State the statistic, feature set, or display decision the query must support.
2. Discover operation schemas with `tools/list`; use `list_layers` for layer
   identity, fields, geometry, extent, CRS, record limits, and capabilities.
3. Declare the predicate, projected fields, spatial bound and its SRID, output
   SRID, geometry requirement, precision, ordering, limit, and completeness
   check before retrieving rows.
4. Exclude unused identifiers, personal data, geometry, and attributes.

## Push work to the provider

- Put attribute predicates in `where` and spatial predicates in `bbox` with an
  explicit `bboxSrid`. Request only necessary `outFields`.
- Use `returnCountOnly` or `summarize_statistics` before sampling. The direct
  verb cannot compute median. When the requested statistic is unsupported or
  the optional analysis profile is absent, compile the bounded server-side work
  with `plan_analysis`, check the returned plan with `validate_plan`, obtain
  operator approval for its inputs and cost, and submit the validated plan with
  `execute_plan`. Use an `idempotencyKey` when a retry could duplicate work.
- Request `returnGeometry: false` for schema checks, counts, and statistics.
- Set `outSrid` deliberately when geometry is required. Use
  `reproject_features` only when advertised and bounded; otherwise use
  `plan_analysis` or stop rather than silently reprojecting client-side.
- Lower `geometryPrecision` only when the decision and display scale tolerate
  the loss, and record the chosen precision.

## Completeness, paging, and sampling

Never treat a page as a population. Capture the authoritative count first,
page with a stable order or deterministic identifier chunks, stay below the
advertised record limit, deduplicate identifiers, and reconcile fetched counts.
Fail closed on truncation flags, repeated pages, missing identifiers, count
drift, timeout, or a provider edit during the run.

Aggregate when the question asks for totals, rates, distributions, or grouped
patterns. Sample only for visual inspection, schema discovery, representative
examples, or an explicitly approximate estimate. Declare the sampling frame,
method, size, seed when available, strata, exclusions, and uncertainty. A
convenience first page is not a sample.

## Cost cliffs

- Full geometry transfer before filtering, aggregation, or reprojection.
- Sorting or grouping on unindexed high-cardinality expressions.
- Large offsets on providers that rescan earlier pages.
- Repeated count, statistics, and feature queries against a changing snapshot.
- Excess precision, unused fields, or countywide polygons for an overview map.
- Client-side joins or transforms that a canonical plan can execute near data.

An `AnalysisPlan` is not a result. Do not report counts, medians, or rows from
`plan_analysis` alone. If the plan cannot be validated, approved, executed, or
observed to successful completion, return the unresolved plan and cost risk.
Do not degrade silently to an unbounded read.

## Anti-patterns

- Fetching all fields and geometry before deciding what is needed.
- Omitting `bboxSrid`, guessing axis order, or mixing source and output CRS.
- Assuming the first page is complete or representative.
- Paging without stable ordering, identifier reconciliation, or edit detection.
- Calculating provider-supported filters, groups, or summaries client-side.
- Sampling when an exact aggregate is required, or presenting a sample as exact.
- Returning sensitive identifiers that are irrelevant to the decision.
- Retrying an expensive query unchanged after truncation or timeout.
- Treating a compiled or validated plan as executed analysis evidence.

## Completion check

Report the exact predicate, fields, bound and SRIDs, geometry and precision,
count, page or sample strategy, completeness reconciliation, capability
fallback, validation and execution state, idempotency key, snapshot assumptions,
sensitive-field exclusions, and remaining cost or accuracy limits.
