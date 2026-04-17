# MCP Clarification, Elicitation, Planning, and Handoff Semantics

**Status:** Draft
**Date:** 2026-04-16
**Scope:** Protocol interaction semantics for the geospatial MCP standard

This document defines how agents clarify ambiguous requests, elicit missing
inputs, assemble plans, and hand plans to execution hosts within the geospatial
MCP standard. It extends `spec/taxonomy.md` and does not redefine vocabulary,
the capability matrix, or the MCP-vs-gRPC boundary.

Upstream references (authoritative for object field shapes):

- [AI Operator Contract](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md)
- [AI Operator Technical Plan](https://github.com/honua-io/honua-server/blob/main/docs/contributor/AI_OPERATOR_TECHNICAL_PLAN.md)
- [AI Operator Agent Handoff](https://github.com/honua-io/honua-server/blob/main/docs/contributor/AI_OPERATOR_AGENT_HANDOFF.md)
- [AI-First Operator Architecture](https://github.com/honua-io/honua-server/blob/main/docs/contributor/AI_OPERATOR_ARCHITECTURE.md)

This repository owns protocol interaction semantics. Canonical object field
shapes remain in the upstream contract documents and are not restated here.

## 1. Scope and Relationship to Taxonomy

`spec/taxonomy.md` fixes the vocabulary: primitives, workflow families, the
canonical concept model, the v1 capability matrix, and non-goals. This document
specifies *how* the planning-plane primitives interact:

- when `clarify_intent` produces a `ClarificationRequest` instead of a plan
- how answers rebind onto intents
- what a planning tool must return before execution is eligible
- how per-family planners diverge in required resources and step kinds
- what crosses the MCP-to-execution boundary

If a term, primitive, or matrix entry is defined in `spec/taxonomy.md`, treat
that definition as canonical. This document references those names; it does not
shadow them. If a field shape is defined in the upstream contract, that field
shape is canonical; this document references it by name only.

Planning-plane semantics are interaction semantics. They do not define runtime
scheduling, approval enforcement, artifact lifecycle, or execution transport
semantics. See Section 6 (Non-Goals) for the boundaries that this document
preserves.

## 2. Clarification and Elicitation Semantics

The clarification loop is the deterministic protocol for resolving
underspecified intents before a plan is produced. Planning tools
(`plan_analysis` and per-family equivalents) and `clarify_intent` cooperate:
the planner decides whether to emit a plan or a `ClarificationRequest`, and the
client agent returns a `ClarificationResponse` that rebinds onto the
originating intent.

### 2.1 Trigger Conditions

A planner MUST emit a `ClarificationRequest` instead of a plan when any active
reason code applies to the current intent. Reason codes are canonical in the
upstream contract; this table defines which families each code is in scope for.

| `ClarificationReasonCode` | Analyze | Publish Data | Build App | Automate / Deploy |
|---|---|---|---|---|
| `MissingRequiredInput` | yes | yes | yes | yes |
| `AmbiguousDataset` | yes | yes | yes (when binding data) | yes |
| `AmbiguousProcess` | yes | yes | -- | yes |
| `DestructiveAction` | yes (when plan emits mutating steps) | yes | -- | yes |
| `PublishAction` | -- | yes | yes (when publishing the app) | yes |
| `PolicyBoundary` | yes | yes | yes | yes |
| `LowConfidence` | yes | yes | yes | yes |

A reason code MUST NOT be invented locally. If a planner detects a condition
that does not map to an existing reason code, it MUST fall back to
`PolicyBoundary` or `LowConfidence` and propose adding a new reason code
through a change to `spec/taxonomy.md` and this document.

### 2.2 Question Kinds and Shape

Field shape (`questionId`, `prompt`, `options[].id`, `options[].label`,
etc.) is owned by the upstream `ClarificationRequest` example in the AI
Operator Contract and is not restated here. Planners MUST use that shape.

The planning plane constrains which question kinds are valid and how
unresolvable ambiguity is handled:

- `kind` MUST be one of the canonical `ClarificationQuestionKind` values
  (`SingleSelect`, `MultiSelect`, `FreeText`, `Confirmation`).
- `options` MUST be present when `kind` is `SingleSelect` or `MultiSelect`
  and absent otherwise.
- Free-form model output that cannot be rendered as one of the four kinds
  is a contract violation. A planner that cannot express its ambiguity
  through the typed kinds MUST escalate to `LowConfidence` rather than
  inline a prose question.

The upstream `ClarificationRequest` carries `reasonCodes` at the request
level. A single request MAY combine multiple reason codes. The planning
plane does not add a per-question `reasonCode` field; if a client needs
to attribute questions to a specific reason code for rendering or
prioritization, it MUST derive that locally from the request's
`reasonCodes` and the question content.

### 2.3 AssumptionPolicy Behavior

`AssumptionPolicy` governs which reason codes the planner may resolve by
applying defaults versus which it MUST surface. The policy is carried on the
intent and travels with it through clarification rounds.

| Policy | Suppressible reason codes | Non-suppressible reason codes |
|---|---|---|
| `AskAlways` | (none) | all seven |
| `AskWhenMaterial` | `LowConfidence`; `AmbiguousDataset`, `AmbiguousProcess`, `MissingRequiredInput` only when immaterial (see below) and a safe default exists | `DestructiveAction`, `PublishAction`, `PolicyBoundary`; `AmbiguousDataset`, `AmbiguousProcess`, `MissingRequiredInput` when material or when no safe default exists |
| `UseDefaults` | `AmbiguousDataset`, `AmbiguousProcess`, `LowConfidence`, `MissingRequiredInput` when a safe default exists | `DestructiveAction`, `PublishAction`, `PolicyBoundary`; `MissingRequiredInput` when no safe default exists |

"Suppressible" means the planner MAY proceed by resolving the reason code
with a default and emitting the plan with that value applied.
"Non-suppressible" means the planner MUST emit a `ClarificationRequest`
regardless of policy. `DestructiveAction`, `PublishAction`, and
`PolicyBoundary` are never suppressible in any policy.

**Materiality criterion (`AskWhenMaterial` only).** A suppressible reason code
is **material** when the choice among available defaults would change the plan's
step kinds, declared `outputs`, or resource bindings. A choice is **immaterial**
when every plausible default produces an equivalent plan structure. Under
`AskWhenMaterial`, only immaterial suppressible codes may be resolved by
default; material ones MUST still surface a `ClarificationRequest`. Under
`UseDefaults`, the planner suppresses whenever a safe default exists regardless
of materiality. This makes `AskWhenMaterial` strictly more likely to ask than
`UseDefaults` for ambiguity and missing-input codes, while both policies agree
on the non-suppressible set.

When the planner suppresses a reason code under the active policy, it
MUST bake the resolved value into the plan's field values so the plan
remains self-describing. The resulting assumption (human-readable text
plus the resolved value) is audited downstream via the upstream
`assumptions` field on `ProvenanceRecord` and the family result package
(`AnalysisResultPackage.assumptions`, `PublishingResultPackage`
provenance, etc.). The execution host does not re-derive those strings;
the planner SHOULD hand the compact assumption audit (one string per
suppressed reason code) across the boundary alongside the plan so the
execution host can record it on `ProvenanceRecord`, when the
submission envelope supports the carrier field (see Section 5.4 for
the expected carrier role and its upstream dependency). Until an
upstream submission-level field exists, resolved values baked into
plan step inputs (Section 2.3, first sentence) remain the
authoritative record of what the planner assumed. The MCP plane MUST
NOT invent a plan-level assumption field beyond this compact audit
and the resolved values baked into step inputs.

### 2.4 Answer Binding

Field shape of `ClarificationResponse` (the `intentId` and the
`answers[questionId] -> string[]` map) is owned by the upstream contract.
Single-select, free-text, and confirmation answers use a single-element
list; multi-select uses one entry per selected option id. Planners MUST
accept that shape unchanged.

Rebinding rules layered on that shape:

- a planner applies answers as field updates to the intent, producing a
  version that MUST be idempotent with respect to answer order
- rebinding is additive within a round: answers resolve questions but MUST
  NOT remove previously resolved fields
- a single intent MAY round-trip clarification more than once; each round
  reuses the same `intentId`. This document does not define a separate
  round-counter field; round identity is carried by successive
  `ClarificationRequest` / `ClarificationResponse` pairs bound to that
  `intentId`

If an answer introduces a new ambiguity (for example, a free-text answer that
names a dataset that resolves to multiple candidates), the planner emits a new
`ClarificationRequest` with updated reason codes in the next round.

### 2.5 Planning-Readiness Termination

An intent is **planning-ready** when all of the following hold:

1. every `MissingRequiredInput` has a resolved value or a suppression record
   permitted by policy
2. every `AmbiguousDataset` or `AmbiguousProcess` is resolved to a single
   candidate or a suppression record permitted by policy
3. no active non-suppressible reason code applies under the current policy
4. remaining `LowConfidence` signal is below the planner's configured threshold
   (see Section 2.7) or suppressed by policy

A planner MUST NOT emit a plan before readiness. A planner MUST emit a plan
once readiness is reached. "Emit no plan and no clarification" is not a valid
terminal state.

### 2.6 MCP Elicitation Mapping

`ClarificationRequest` is the typed payload. MCP transport-level elicitation
prompts render the questions to the client and carry answers back as
`ClarificationResponse`. The transport does not own the reason codes, the
question kinds, or the assumption policy; those are protocol semantics defined
here and reused from the upstream contract.

A transport MAY batch multiple `ClarificationRequest`s before returning to the
planner, but MUST preserve `questionId` identity so answers remain bindable.
`questionId` values MUST be unique across the entire intent lifecycle (all
clarification rounds for a given `intentId`). Implementations MUST NOT reuse
a `questionId` in a later round or a batched request; reuse would cause one
answer to overwrite another in the `answers[questionId] -> string[]` map. If
a response contains a `questionId` that the planner did not emit for that
intent, the planner MUST reject the response.

### 2.7 LowConfidence Threshold

The `LowConfidence` threshold is planner-specific and MUST be:

- configurable per deployment
- observable through the planning-plane signals in Section 7

This document does not prescribe a numeric threshold; prescribing one would
constrain planner internals. Implementations that choose to publish a
threshold should do so through planner configuration, not through the
protocol.

## 3. Planning-Stage Resources

Planners consult MCP resources during clarification and plan construction.
This section lists which resource families are expected per planning step and
what the planning-plane contract requires of each.

| Resource family (from taxonomy) | Planning role | Failure mode if missing |
|---|---|---|
| Catalog resources | Scope dataset and process discovery | `MissingRequiredInput` |
| Dataset / Layer resources | Ground `DatasetRef` / `LayerRef` bindings | `AmbiguousDataset` or `MissingRequiredInput` |
| Process definition resources | Validate step parameter contracts | `UnknownProcess` (upstream error; surface as `AmbiguousProcess` during clarification) |
| Style resources | Bind `RenderMap` / `compose_map` steps | `MissingRequiredInput` when style is required for `requestedOutputs` |
| Theme resources | Token set for map and app composition | `MissingRequiredInput` when theme is required |
| Map template resources | Scaffold `compose_map` / `bind_map_package` steps | `MissingRequiredInput` when `Map` is in `requestedOutputs` |
| App template resources | Scaffold `select_template` / `generate_project` `BuilderPlan` steps | `MissingRequiredInput` when the intent requests an app scaffold output |
| Result package resources | Bind prior results as inputs | `AmbiguousDataset` when reference is ambiguous |

### 3.1 Resource Scoping Contract

- planners MUST scope resource reads to what the intent references or is
  likely to reference; full-catalog enumeration is a smell and should be
  telemetered against (Section 7)
- planners MAY cache resource reads within a single intent lifecycle but MUST
  NOT treat cached reads as authoritative across intents
- planners MUST surface resource-read errors as `ClarificationRequest`s driven
  by the mapped reason code, not as inline plan warnings

### 3.2 Workspace Hints

Planners MAY recommend a workspace kind (`Scratch`, `Persistent`, `TempLayer`,
`SavedLayer`, `ResultCollection`) on the plan as a hint to the execution host.
Planners MUST NOT create, mutate, or reference workspace state as part of
planning; workspace lifecycle is owned by gRPC `WorkspaceService`
(see `spec/taxonomy.md` MCP-vs-gRPC boundary).

## 4. Per-Family Planning Behavior

Each workflow family diverges in its expected step kinds, required planning
resources, and clarification reason codes in scope. The following table
extends the v1 capability matrix in `spec/taxonomy.md`; it is column-distinct
and does not restate coverage state.

| Family | Canonical plan object | Allowed step kinds | Required planning resources | Clarification codes in scope |
|---|---|---|---|---|
| Analyze | `AnalysisPlan` | `QueryFeatures`, `Geoprocess`, `Aggregate`, `RenderMap`, `Export` | catalog, dataset/layer, process definition, style (when rendering), map template (when `Map` is in `requestedOutputs`) | `MissingRequiredInput`, `AmbiguousDataset`, `AmbiguousProcess`, `LowConfidence`, `PolicyBoundary`, `DestructiveAction` (when steps mutate) |
| Publish Data | `PublishingPlan` | `inspect_source`, `infer_schema`, `map_schema`, `normalize_crs`, `clean_records`, `dedupe`, `enrich`, `quality_check`, `publish_service`, `compose_map` | catalog, dataset/layer, process definition, quality policy reference, map template (when publishing a map) | all Analyze codes plus `PublishAction`, `DestructiveAction` |
| Build App | `BuilderPlan` | `select_template`, `bind_map_package`, `bind_artifacts`, `compose_widget`, `compose_workflow`, `generate_project`, `preview_app` | app template, map template (when map is bound), prior result package or artifact references, theme | `MissingRequiredInput`, `AmbiguousDataset` (when binding data), `LowConfidence`, `PolicyBoundary`, `PublishAction` (when publishing the app) |
| Automate / Deploy | `DeploymentPlan` | `register_definition`, `configure_schedule`, `configure_approvals`, `configure_runtime`, `publish`, `rollback` | target reference (process, pipeline, map, or app), approval policy reference, runtime policy reference | `MissingRequiredInput`, `PublishAction`, `DestructiveAction`, `PolicyBoundary`, `LowConfidence` |

Step kind spellings match the upstream contract exactly. Planners MUST NOT
introduce step kinds outside this set; a new step kind requires a taxonomy
change and a matching extension in this document.

### 4.1 Analyze

- **Inputs.** An `AnalysisIntent` with at least one dataset or layer
  reference, or free-text sufficient to drive `ground_candidates` into a
  resolvable candidate set.
- **Plan construction.** Emit an `AnalysisPlan` whose steps are drawn from
  the Analyze step kinds. Each `Geoprocess` step binds a `ProcessDefinition`;
  the planner MUST NOT emit a `Geoprocess` step for an unbound process.
- **Pre-execution warnings.** The planner SHOULD annotate steps that will
  consume significant resources (large inputs, high-cardinality aggregation,
  wide spatial extent) through plan warnings. Warnings are advisory; they do
  not substitute for `DestructiveAction` clarification.
- **Required outputs.** `requestedOutputs` is required on the intent; the
  plan MUST include at least one step that produces each requested
  `ArtifactKind`.
- **Dry-run vs. submit.** `validate_plan` returns structural validation and
  authorization preview; `execute_plan` submits for materialization. Both are
  covered in Section 5.

### 4.2 Publish Data

- **Inputs.** A `PublishingIntent` that references a source (existing dataset,
  uploaded file reference, or external service) and a publishing target.
- **Plan construction.** Emit a `PublishingPlan` whose steps are drawn from
  the Publish Data step kinds. Pipelines are expected to begin with
  `inspect_source` and progress through schema and quality steps before
  `publish_service`; this ordering is a convention surfaced through plan
  warnings, not a protocol constraint.
- **Pre-execution warnings.** Every plan that contains `publish_service`
  MUST be driven to a `PublishAction` clarification before handoff unless
  policy suppresses it (which it may not, by Section 2.3). `clean_records`,
  `dedupe`, `enrich`, and `normalize_crs` emit `DestructiveAction`
  clarification because they mutate the materialized output.
- **Required outputs.** The `PublishingPlan` MUST declare the target
  `PublishedService` shape (protocol set, dataset identity) the intent
  requests, even if the planner leaves implementation details to the
  execution host.
- **Dry-run vs. submit.** Same as Analyze.

### 4.3 Build App

- **Inputs.** A `BuilderIntent` that references a target template family,
  plus the set of artifacts, map packages, or datasets the app will bind.
- **Plan construction.** Emit a `BuilderPlan` whose steps are drawn from
  the Build App step kinds. A plan MUST begin with `select_template` and MUST
  NOT emit `generate_project` before all `bind_*` and `compose_*` steps
  required by the chosen template are present.
- **Pre-execution warnings.** The planner SHOULD warn when the plan
  references artifacts that are not yet available (for example, a map
  package from an in-progress analysis). Build App v1 uses direct
  BuilderService-backed calls (`create_app_package`,
  `preview_app_package`) that require all bound artifacts to be
  resolved at call time; deferred dependency ordering is not available
  in the v1 path. If a future upstream contract adds job-backed
  Builder execution, dependency ordering semantics will follow the
  `ExecutionJob` model described in Section 5.3.
- **Required outputs.** `BuilderPlan.outputs` MUST declare the app
  artifacts the plan will produce, using the current upstream Build App
  spellings. `BuilderIntent.requestedOutputs` remains upstream-owned as
  well. Upstream still carries two vocabularies for Build App outputs:
  the shared `ArtifactKind` enum lists `AppBundle`
  (`AI_OPERATOR_CONTRACT.md` §AnalysisIntent, where the enum is
  defined) while the canonical `BuilderIntent` / `BuilderPlan` examples
  emit `app_package` and `preview`
  (`AI_OPERATOR_TECHNICAL_PLAN.md` §BuilderIntent, §BuilderPlan). This
  spec does not add a third repo-local synonym or make one spelling
  canonical ahead of upstream harmonization. Downstream consumers MUST
  follow the current upstream Builder examples verbatim until that
  vocabulary is unified there. The plan still resolves to an
  `AppPackage` resource object; if the app itself is to be published,
  `PublishAction` clarification fires before handoff (see Section 2.1).
- **Dry-run vs. submit.** `validate_plan` validates template binding and
  artifact references. `execute_plan` is not in scope in v1 for Build
  App; the v1 Build App MCP tool surface is `create_app_package` and
  `preview_app_package` (`spec/taxonomy.md` §MCP Tools to Workflow
  Family Mapping). `generate_project` and `preview_app` are
  `BuilderPlan` step kinds (`AI_OPERATOR_TECHNICAL_PLAN.md` §BuilderPlan),
  not MCP tools, and MUST NOT be referenced as MCP tool names.

### 4.4 Automate / Deploy

**Normative shape; v1 coverage deferred.** The v1 capability matrix marks
Automate / Deploy as deferred. This section specifies the shape of deploy
planning so downstream consumers (`honua-server#728`, `honua-devops#29`) do
not diverge on private conventions; it does not commit v1 implementation
coverage.

- **Inputs.** A deployment intent referencing a target object (process,
  pipeline, map, or app), an approval policy reference, and a runtime policy
  reference.
- **Plan construction.** Emit a `DeploymentPlan` whose steps are drawn from
  the Automate / Deploy step kinds. `register_definition` precedes every other
  step; `rollback` is a terminal step allowed only in recovery plans.
- **Pre-execution warnings.** `publish` always drives `PublishAction`
  clarification. `configure_approvals` and `configure_runtime` MAY drive
  `PolicyBoundary` clarification when the requested policy exceeds the
  caller's authorization.
- **Required outputs.** The plan MUST resolve to a `Deployment` reference on
  successful execution.
- **Dry-run vs. submit.** `validate_plan` returns configuration preview;
  actual execution semantics are owned by the downstream orchestration host
  and are out of scope here.

## 5. Plan Handoff Semantics

Plan handoff is the protocol boundary between the MCP interaction plane
and the execution plane. The execution plane is split across the
family-owning gRPC services: `ProcessService` (Analyze execution),
`PipelineService` (Publish Data execution), `BuilderService` (Build App
execution), and `DeploymentService` (Automate / Deploy execution), with
`WorkspaceService` owning artifact and workspace lifecycle across
families. Downstream orchestration hosts consume those same contracts
(see `AI_OPERATOR_AGENT_HANDOFF.md` §Repo Ownership and
`AI_OPERATOR_TECHNICAL_PLAN.md` §7 for service assignments).

**V1 scope.** `execute_plan` is v1 only for Analyze and Publish Data
(`AnalysisPlan`, `PublishingPlan`) per the capability matrix in
`spec/taxonomy.md`. Build App keeps v1 planning and direct Builder tool
semantics (`validate_plan`, `create_app_package`,
`preview_app_package`), but does not enter the `ExecutionJob` handoff
model described in Sections 5.2 and 5.3. Automate / Deploy execution is
deferred; its plan shape is specified in Section 4.4 for forward
compatibility. Sections 5.1 and 5.2 below therefore distinguish between
v1 job-backed plan submission and Builder's current direct-tool path.

### 5.1 Pre-Handoff (MCP Planning Plane)

Applies to the v1 handoff families (Analyze, Publish Data). The same
rules describe the handoff shape Builder and Deployment plans will follow
when those families become v1.

- the planner emits a canonical plan object (`AnalysisPlan` or
  `PublishingPlan` in v1; `BuilderPlan` / `DeploymentPlan` for forward
  compatibility) with `specVersion` set
- the planner MAY call `validate_plan` to obtain structural validation, an
  authorization preview, and a cost or coverage estimate surface without
  persisting state. `validate_plan` is v1 for Analyze, Publish Data, and
  Build App per the taxonomy matrix. For Analyze, `validate_plan` maps to
  `ProcessService.ValidatePlan` and `ProcessService.DryRunPlan`. For
  Publish Data, `validate_plan` maps to `PipelineService` ("validate
  publishing plan" per `AI_OPERATOR_TECHNICAL_PLAN.md` §7.4); the exact
  `PipelineService` method name is deferred until the `geospatial-grpc`
  contract lands. Build App also exposes `validate_plan` in the v1 MCP
  surface, but upstream has not yet named a Builder validation RPC; this
  document therefore constrains only the MCP-side semantics of that tool
  (template binding and artifact-reference checks) and does not assign
  it a job-producing handoff path
- calling `validate_plan` is RECOMMENDED, not REQUIRED, before
  `execute_plan` for Analyze and Publish Data. For Build App, it is an
  optional preflight before the direct Builder tool calls in the v1 MCP
  surface
- validation warnings are planning-plane concerns; validation errors that
  indicate destructive or publish actions MUST escalate back through
  clarification (`DestructiveAction`, `PublishAction`) rather than being
  surfaced as inline plan errors

### 5.2 Handoff Operation

In v1, `execute_plan` is the single MCP tool that crosses the boundary
for Analyze and Publish Data. It returns an `ExecutionJob` reference;
after the call returns, the MCP plane no longer owns runtime state for
that plan. Analyze `execute_plan` submits to
`ProcessService.SubmitPlanJob`. Publish Data `execute_plan` submits to
`PipelineService` ("execute ingest/transform/publish" per
`AI_OPERATOR_TECHNICAL_PLAN.md` §7.4); the exact `PipelineService`
method name is deferred until the `geospatial-grpc` contract lands.

Build App `execute_plan` and Automate / Deploy plan execution are
deferred. When those families become v1, handoff will follow the same
submission pattern against the family-owning service (`BuilderService`
for Build App, `DeploymentService` for Automate / Deploy). This
document does not commit to exact method names until the upstream
contracts add them.

Build App's v1 boundary-crossing tools are `create_app_package` and
`preview_app_package`. They are direct BuilderService-backed composition
calls that return builder artifacts or previews, not `ExecutionJob`
references, and they do not inherit the post-handoff job-state
semantics in Section 5.3.

- the planner MUST attach the `intentId` to the submission. The planner
  SHOULD attach the clarification audit and the assumption audit when
  the submission envelope supports the carrier fields (see Section 5.4
  for expected carrier roles and their upstream dependency). Resolved
  values are additionally baked into plan step inputs (Section 2.3).
  When the audit carriers are present, the execution host uses them,
  not the plan inputs, to populate
  `ProvenanceRecord.clarificationsAsked`, `.clarificationsAnswered`,
  and `.assumptions`
- the MCP plane MUST NOT retry `execute_plan` on its own initiative; retry
  policy is owned by the execution host

### 5.3 Post-Handoff (Execution / Orchestration Plane)

Applies to Analyze and Publish Data `execute_plan` submissions in v1,
and to any future workflow family that adopts the same `ExecutionJob`
submission model.

- `ExecutionJob.status` transitions (`Queued`, `Provisioning`, `Running`,
  `Succeeded`, `Failed`, `Cancelled`) are owned by the execution host
- artifact materialization, workspace lifecycle, approval enforcement, and
  provenance recording are owned by the execution host
- MCP tools MAY poll job status through transport-neutral resource reads but
  MUST NOT redefine status semantics, publish approval verdicts, or alter
  `ExecutionJob` fields
- result packaging for submitted plans (`AnalysisResultPackage`,
  `PublishingResultPackage`, and any future job-backed output packages) is
  constructed by the execution host and exposed as MCP resources once the
  execution host marks the job terminal; MCP does not construct result
  packages (resource exposure contract is owned by future work in this
  repository and is out of scope here)
- errors surfaced at or after handoff use the upstream
  `GeoprocessingError.kind` vocabulary (`ValidationFailed`,
  `AuthorizationDenied`, `UnknownDataset`, `UnknownProcess`,
  `ExecutionFailed`, `Timeout`, `Cancelled`, `OutputBindingFailed`); MCP does
  not define local error codes

### 5.4 Boundary-Crossing Fields

For `execute_plan` submissions, only the following fields cross the
MCP-to-execution boundary. All other state stays local to the
interaction plane.

| Field | Carries |
|---|---|
| `intentId` | originating intent identity for provenance |
| `planId` | plan identity |
| `specVersion` | spec version the plan was produced against |
| `requestedOutputs` | originating intent output request, preserved when needed for provenance or reconciliation against the plan's declared `outputs` |
| `outputs` | canonical plan-level output declaration consumed by the execution host |
| Plan steps | `stepId`, `kind`, `inputs`, `dependsOn`, family-specific typed fields |

Resolved clarification values and assumption defaults are additionally
baked into plan step `inputs` (Section 2.3) so the plan remains
self-describing. When both `requestedOutputs` and `outputs` are carried,
the former records what the caller asked for and the latter records what
the planner declared on the canonical plan object; execution hosts MUST
consume `outputs` as the execution-side contract.

**Future boundary carriers (not yet upstream-canonical).** Three
additional data roles are expected to cross the boundary once upstream
defines submission-level field paths:

- **Workspace hint** — recommended workspace kind (advisory); see
  Section 3.2.
- **Clarification audit** — lists of `questionId`s to populate
  `ProvenanceRecord.clarificationsAsked` and
  `.clarificationsAnswered` (identifiers only, no prompt text).
- **Assumption audit** — one human-readable string per suppressed
  reason code, to populate `ProvenanceRecord.assumptions` and the
  family result package `assumptions` field.

No canonical submission-level field name for any of these carriers
exists upstream today (`AI_OPERATOR_CONTRACT.md` §ProvenanceRecord,
fields `clarificationsAsked`, `clarificationsAnswered`,
`assumptions`). This spec names them by role; downstream consumers
MUST NOT invent private submission-envelope fields for these
carriers. A future upstream change MAY add concrete field names, and
this section MUST be updated to reference them when it does.

`ClarificationRequest` and `ClarificationResponse` prompt wording,
option labels, `FreeText` response text beyond the resolved value,
elicitation prompts, conversational context, and client-agent phrasing
do not cross the boundary. They remain MCP-side. Only the typed
identifiers (question IDs) and the compact assumption audit strings
cross, so that the execution host can record the audit fields without
receiving any natural-language client-agent content.

### 5.5 Orchestration Host Coordination

Orchestration hosts (for example, the consumer in `honua-devops#29`) host
plans over the same handoff semantics:

- orchestration hosts MUST NOT inject a private step kind, reason code, or
  assumption policy
- orchestration hosts that need an unrepresented planning concept MUST open a
  change against this document and `spec/taxonomy.md` rather than extend
  locally
- orchestration hosts that submit plans through `execute_plan` consume the
  same `ExecutionJob` abstraction and do not redefine its status
  transitions

## 6. Non-Goals

These items are explicitly out of scope for this document. They preserve the
architectural boundaries established in `spec/taxonomy.md`.

### 1. Runtime Scheduling and Provisioning

Queueing, worker routing, provisioning strategy, and execution-time resource
allocation are owned by execution hosts. This document names `ExecutionJob`
and its status set but does not define state machines, retry policy, or
back-pressure behavior.

### 2. Approval Enforcement and Policy Evaluation

Approval evaluation, policy gates, and authorization verdicts are owned
by server-internal policy evaluators behind the family-owning gRPC
services (`ProcessService`, `PipelineService`, `BuilderService`,
`DeploymentService`) and `WorkspaceService`. This document surfaces
`DestructiveAction`, `PublishAction`, and `PolicyBoundary` as
clarification reason codes only; it does not define how a host decides
whether to grant or deny approval.

### 3. Artifact Persistence and Workspace Lifecycle

Artifact storage, retention, promotion between workspace kinds, and workspace
creation or teardown are owned by gRPC `WorkspaceService`. Planners surface
workspace hints (Section 3.2) but do not manage lifecycle.

### 4. Result Package Construction

Result packages are constructed by execution hosts, not by MCP planners.

For Analyze and Publish Data, `AnalysisResultPackage` and
`PublishingResultPackage` are surfaced as MCP resources once the
execution host marks the backing `ExecutionJob` terminal. For Build
App v1, `AppPackage` is produced directly by `create_app_package` and
returned to the MCP plane without an intermediate job; when a future
upstream contract adds job-backed Builder execution, result packaging
will follow the same terminal-job model. `Deployment` output
semantics are deferred with the Automate / Deploy family. Result
resource schemas and caching semantics are owned by future work in
this repository.

### 5. Natural-Language Prompt Authoring and Model Selection

Client-agent phrasing of `ClarificationRequest.prompt`, LLM selection,
prompt-engineering patterns, and natural-language rendering of options are
owned by the client agent. MCP defines the typed protocol only.

### 6. gRPC Execution Transport Semantics

Wire encoding, streaming modes, connection management, and service-level
retry behavior for `ProcessService`, `PipelineService`, `BuilderService`,
`DeploymentService`, `WorkspaceService`, and related services are owned
by `geospatial-grpc`. This document references the gRPC method names
(for example, `ProcessService.ValidatePlan`) but does not specify their
transport behavior.

## 7. Observable Signals

Implementations should emit planning-plane signals that extend the signal set
in `spec/taxonomy.md` and allow coverage tracking against this document.
These are signal categories; specific metric names and instrumentation
frameworks are implementation choices.

- **Clarification reason-code coverage.** Which `ClarificationReasonCode`
  values have fired in production versus which are specified, and per
  workflow family.
- **AssumptionPolicy outcome distribution.** For each policy value
  (`AskAlways`, `AskWhenMaterial`, `UseDefaults`), the distribution of
  questions asked versus questions suppressed, broken down by reason code.
- **Plan validation outcomes.** Before handoff, the rate of `validate_plan`
  results (valid, warnings, errors) per workflow family.
- **Handoff boundary rejections.** Attempts from the MCP plane to cross
  runtime, approval, or artifact-lifecycle surfaces that the execution host
  rejects as out of scope for interaction semantics.
- **Planning-to-execution success ratio.** For workflow families that
  submit through `execute_plan` (Analyze and Publish Data in v1), the
  fraction of handed-off plans that reach `Succeeded`
  `ExecutionJob.status` versus those that reach `Failed` or
  `Cancelled`.
- **Full-catalog resource reads.** Frequency of full-catalog resource
  enumeration during planning (a smell per Section 3.1).
- **LowConfidence threshold configuration.** Per deployment, the configured
  threshold value and the rate at which `LowConfidence` clarifications fire.
- **Clarification and assumption audit coverage.** Per handoff, whether
  the clarification audit (question IDs) and assumption audit (one
  string per suppressed reason code) were attached to the submission,
  and the reconciliation rate between audit counts and the populated
  `ProvenanceRecord.clarificationsAsked`, `.clarificationsAnswered`,
  and `.assumptions` fields.

Adding a new clarification reason code, step kind, or planning resource in
future changes to this document MUST include a corresponding signal category
here so coverage tracking remains complete.
