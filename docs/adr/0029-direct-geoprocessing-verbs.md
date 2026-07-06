# ADR-0029: Direct Geoprocessing Verbs Belong in the Standard (Analysis Profile)

## Status

Accepted (2026-07-06). Standalone standard decision (no honua-server ADR to
reconcile). Resolves [geospatial-mcp#53](https://github.com/honua-io/geospatial-mcp/issues/53).

## Context

The standard models all geoprocessing through a plan/execute indirection.
[`taxonomy.md` §Analyze](../../spec/taxonomy.md#analyze) makes analysis a
lifecycle — `AnalysisIntent` → `AnalysisPlan` → `ExecutionJob` →
`AnalysisResultPackage` — and every operation is a `Geoprocess` plan step bound
to a `ProcessDefinition`, submitted through `plan_analysis` → `validate_plan` →
`execute_plan`. The bare taxonomy deliberately does **not** expose basic GIS
operations as discrete tools; it models them as plan steps
([taxonomy.md §Reference-Shape Tools](../../spec/taxonomy.md#reference-shape-tools-non-normative)).

That indirection is correct for multi-step analysis with dependencies,
clarification, and packaged results. It is heavy for the single, self-contained
verbs an operator agent reaches for constantly — buffer a layer, intersect two
layers, summarize a field by group, reproject a dataset, join a table, export a
result. The standard already concedes this shape for reads: `query_features`,
`render_map`, and `list_layers` are direct data-access tools, not planned steps,
because forcing an agent to author a plan to read a layer is friction with no
payoff. The same argument applies to single-step geoprocessing: a GIS agent
should call `buffer_features` directly, not compose a one-step plan to reach it.

Two questions had to be resolved:

1. **Do direct verbs belong in the standard, or are they a vendor surface?** In
   the standard. The standard-first doctrine ([GOVERNANCE.md](../../GOVERNANCE.md))
   says the vocabulary is owned here. Direct verbs are a capability agents will
   call; if the standard cannot describe them, adopters invent divergent private
   spellings (the exact failure ADR-0028 corrected for `edit_features`).

2. **Do they belong on the `base` floor, or in an opt-in profile?** In an opt-in
   profile. An adopter that offers only the plan/execute surface is a complete,
   conformant implementation; the direct verbs are an *additive* convenience over
   that floor. Placing them in `base` and marking them `implemented` would, the
   moment the reference ships them, retroactively demote every base-only adopter
   from FULL to MAPPED — a backward-incompatible change to the conformance floor,
   which the additive-profile rule in
   [GOVERNANCE.md §Conformance profiles](../../GOVERNANCE.md#conformance-profiles)
   exists to prevent. A profile keeps the addition MINOR and non-breaking, exactly
   as `mutation` did.

## Decision

Direct geoprocessing verbs are **admitted into the standard** as first-class
Analyze-family tools, gated by a new additive **`analysis` conformance profile**.

### The `analysis` conformance profile

The standard now defines three profiles:

- **`base`** — the read-only floor, unchanged. The plan/execute analysis surface
  (`plan_analysis`, `validate_plan`, `execute_plan`, …) stays in `base`: an
  implementation that offers only orchestrated, planned analysis reaches **FULL**
  on `base` without advertising any direct verb.
- **`mutation`** — governed feature editing (ADR-0028), unchanged.
- **`analysis`** — additive. Its members are the direct geoprocessing verbs
  `buffer_features`, `overlay_features`, `summarize_statistics`,
  `reproject_features`, `join_features`, and `export_dataset`. An implementation
  conforms to `analysis` by declaring the profile
  (`implementation.profiles` includes `"analysis"`) and advertising its members.

"Analyze the family" and "analysis the profile" are distinct: the **Analyze
workflow family** is the plan/execute orchestration surface (base); the
**`analysis` profile** is the direct, single-step verb surface layered over it.
A verb is `analysis`-profile in `index.json` via the existing optional `profile`
field, so it is required for FULL only when a manifest declares `analysis` —
identical machinery to `mutation`, no checker change needed.

### Direct-verb contract (normative for the analysis profile)

- **When to use (verbatim in each tool description):** call a direct verb for a
  single self-contained step; use `plan_analysis` + `execute_plan` for multi-step
  analysis with dependencies, clarification, and a packaged result.
- **Source reference.** Each verb's `source` (and second operand, for
  `overlay_features` / `join_features`) is EITHER a published layer
  (`serviceId` + `layerId`, the `LayerRef` spelling used by `query_features` and
  `edit_features`) OR a prior-result artifact (`artifactId`, the `ArtifactRef`
  spelling of [`resources/artifact.schema.json`](../../spec/schemas/resources/artifact.schema.json)).
  This lets verbs chain onto earlier job/verb outputs without a plan. The concrete
  layer/artifact spellings track the reference pipeline and are marked
  `x-honua-reference-shape`, consistent with `edit_features`.
- **Async posture (no new job shape).** A verb returns an `ExecutionJob` handle
  (`honua://jobs/{job_id}`) for durable, long-running work — pollable, and
  cancelable via `cancel_job` — or an inline result for trivially small/fast
  computations. This is the same handoff `execute_plan` documents in prose; the
  standard does **not** introduce a per-tool `outputSchema` (no standard tool
  ships one) and does **not** invent a second job model.
- **Reproject: verb *and* param.** `reproject_features` is a first-class verb
  because standalone reprojection of a dataset is a real single-step request an
  agent makes by name. The other verbs additionally carry an optional `outSrid`
  output-CRS param (matching `query_features` / `solve_route`), so "compute in /
  return in CRS X" never forces a second call. Providing both is deliberate: the
  verb serves reprojection-as-the-goal; the param serves reprojection-as-a-detail.
- **Annotations.** The read verbs (`buffer_features`, `overlay_features`,
  `summarize_statistics`, `reproject_features`, `join_features`) are advertised
  `readOnlyHint: true` — they compute a derived result and mutate no server state.
  `export_dataset` is advertised `readOnlyHint: false` (it writes a new
  downloadable artifact) but **non-destructive** (it creates a new artifact and
  mutates no source records) and **idempotent**. No verb is in the `mutation`
  profile: none edits source features.

### Reference implementation status

The reference does **not** ship the direct verbs yet. Every member lands with
`implementationStatus: "known-gap"` in `index.json` and is *not* added to the
reference manifest — honest, and informational in `check_manifest.py`. The
reference declares `["base"]` (it also does not implement the `mutation`
profile per ADR-0028's reference-posture addendum) and continues to reach FULL
on `base` unchanged. The server-side implementation phase is tracked separately
in honua-server; when it lands, the reference manifest declares `analysis` and
advertises the verbs, and the affected `index.json` entries flip to
`implemented`.

## Consequences

- A new additive profile (`analysis`) is a **MINOR** `SPEC_VERSION` change: no
  existing base- or mutation-conformant implementation becomes non-conformant.
- `check_manifest.py` needs **no code change**: profile gating is already generic
  over the `profile` field and `implementation.profiles`. A regression test pins
  the new profile's gating behavior.
- `taxonomy.md`, `conformance.md`, and `CONFORMANCE.md` gain the `analysis`
  profile and the direct-verb family; the v1 capability matrix records the verbs
  as Analyze-family, `analysis`-profile capabilities.
- When the reference implements a verb, its `index.json` entry flips to
  `implemented` and the reference manifest declares `analysis` and advertises it;
  because the tool is `analysis`-profile, base-only adopters are unaffected.
- Future direct verbs (e.g. `dissolve_features`, `clip_raster`) join the
  `analysis` profile through the same issue → ADR → schema + fixture process,
  never by vendor hand-edit.
