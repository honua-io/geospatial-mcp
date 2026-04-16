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

Every question in a `ClarificationRequest` MUST carry at minimum:

- `questionId` -- stable identifier unique within the request
- `prompt` -- human-readable text the client agent may render
- `kind` -- one of `SingleSelect`, `MultiSelect`, `FreeText`, `Confirmation`
- `options` -- REQUIRED when `kind` is `SingleSelect` or `MultiSelect`; each
  option carries an `optionId` and a `label`
- `reasonCode` -- the `ClarificationReasonCode` that drove the question

Free-form model output that cannot be rendered as one of the four question
kinds is a contract violation. A planner that cannot express its ambiguity
through the typed kinds MUST escalate to `LowConfidence` rather than inline a
prose question.

Multiple reason codes in a single request are allowed, but each question
carries exactly one `reasonCode` so the client can group or prioritize
questions by driver.

### 2.3 AssumptionPolicy Behavior

`AssumptionPolicy` governs which reason codes the planner may resolve by
applying defaults versus which it MUST surface. The policy is carried on the
intent and travels with it through clarification rounds.

| Policy | Suppressible reason codes | Non-suppressible reason codes |
|---|---|---|
| `AskAlways` | (none) | all seven |
| `AskWhenMaterial` | `AmbiguousDataset`, `AmbiguousProcess`, `LowConfidence`, `MissingRequiredInput` when a safe default exists | `DestructiveAction`, `PublishAction`, `PolicyBoundary`; `MissingRequiredInput` when no safe default exists |
| `UseDefaults` | `AmbiguousDataset`, `AmbiguousProcess`, `LowConfidence`, `MissingRequiredInput` when a safe default exists | `DestructiveAction`, `PublishAction`, `PolicyBoundary`; `MissingRequiredInput` when no safe default exists |

"Suppressible" means the planner MAY proceed by recording an assumption on the
resulting plan. "Non-suppressible" means the planner MUST emit a
`ClarificationRequest` regardless of policy. `DestructiveAction`,
`PublishAction`, and `PolicyBoundary` are never suppressible in any policy.

A suppressed reason code MUST produce an entry in the plan's assumption record
(field shape owned by the upstream contract's `AnalysisPlan.assumptions` /
family equivalents) citing the `reasonCode`, the resolved value, and the
policy that permitted suppression.

### 2.4 Answer Binding

A `ClarificationResponse` rebinds onto the originating intent:

- the response MUST carry the `intentId` of the originating intent
- each answer carries the `questionId` it resolves and either a selected
  `optionId[]`, a `text` value, or a `confirmed` boolean per question `kind`
- the planner applies answers as field updates to the intent, producing a
  version that MUST be idempotent with respect to answer order
- rebinding is additive within a round: answers resolve questions but MUST NOT
  remove previously resolved fields
- a single intent MAY round-trip clarification more than once; each round
  carries the same `intentId` and advances a round counter (field shape owned
  by the upstream contract)

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
| Map template resources | Scaffold `compose_map` / `bind_map_package` steps | `MissingRequiredInput` when `map_package` is in `requestedOutputs` |
| App template resources | Scaffold `select_template` / `generate_project` steps | `MissingRequiredInput` when `app_package` is in `requestedOutputs` |
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
| Analyze | `AnalysisPlan` | `QueryFeatures`, `Geoprocess`, `Aggregate`, `RenderMap`, `Export` | catalog, dataset/layer, process definition, style (when rendering), map template (when `map_package` requested) | `MissingRequiredInput`, `AmbiguousDataset`, `AmbiguousProcess`, `LowConfidence`, `PolicyBoundary`, `DestructiveAction` (when steps mutate) |
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
- **Pre-execution warnings.** The planner SHOULD warn when the plan depends
  on artifacts that are not terminal (in an unresolved `ExecutionJob`). Such
  plans remain valid; the execution host resolves the dependency ordering.
- **Required outputs.** `app_package` MUST be in `requestedOutputs`. If the
  app itself is to be published, `PublishAction` clarification fires before
  handoff (see Section 2.1).
- **Dry-run vs. submit.** `validate_plan` validates template binding and
  artifact references. `execute_plan` is not in scope in v1 for Build App
  execution semantics beyond `preview_app` and `generate_project`; see
  `spec/taxonomy.md` v1 capability matrix.

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

Plan handoff is the protocol boundary between the MCP interaction plane and
the execution plane (gRPC `ProcessService`, `WorkspaceService`, and the
downstream orchestration host).

### 5.1 Pre-Handoff (MCP Planning Plane)

- the planner emits a canonical plan object (`AnalysisPlan`, `PublishingPlan`,
  `BuilderPlan`, or `DeploymentPlan`) with `specVersion` set
- the planner MAY call `validate_plan` to obtain structural validation, an
  authorization preview, and a cost or coverage estimate surface without
  persisting state. `validate_plan` is a dry-run adapter over gRPC
  `ProcessService.ValidatePlan` and `ProcessService.DryRunPlan`; the
  planning plane does not redefine their semantics
- calling `validate_plan` is RECOMMENDED, not REQUIRED, before `execute_plan`.
  Skipping `validate_plan` shifts validation cost to handoff time
- validation warnings are planning-plane concerns; validation errors that
  indicate destructive or publish actions MUST escalate back through
  clarification (`DestructiveAction`, `PublishAction`) rather than being
  surfaced as inline plan errors

### 5.2 Handoff Operation

`execute_plan` is the single MCP tool that crosses the boundary. It submits
a validated plan to `ProcessService.SubmitPlanJob` (or the family-equivalent
service method) and returns an `ExecutionJob` reference. After this call
returns, the MCP plane no longer owns runtime state for that plan.

- the planner MUST attach the `intentId` and any accepted clarification
  assumptions to the submission
- the MCP plane MUST NOT retry `execute_plan` on its own initiative; retry
  policy is owned by the execution host

### 5.3 Post-Handoff (Execution / Orchestration Plane)

- `ExecutionJob.status` transitions (`Queued`, `Provisioning`, `Running`,
  `Succeeded`, `Failed`, `Cancelled`) are owned by the execution host
- artifact materialization, workspace lifecycle, approval enforcement, and
  provenance recording are owned by the execution host
- MCP tools MAY poll job status through transport-neutral resource reads but
  MUST NOT redefine status semantics, publish approval verdicts, or alter
  `ExecutionJob` fields
- result packaging (`AnalysisResultPackage`, `PublishingResultPackage`,
  `AppPackage`, `Deployment`) is constructed by the execution host and
  exposed as MCP resources once the execution host marks the job terminal;
  MCP does not construct result packages (resource exposure contract is
  owned by future work in this repository and is out of scope here)
- errors surfaced at or after handoff use the upstream
  `GeoprocessingError.kind` vocabulary (`ValidationFailed`,
  `AuthorizationDenied`, `UnknownDataset`, `UnknownProcess`,
  `ExecutionFailed`, `Timeout`, `Cancelled`, `OutputBindingFailed`); MCP does
  not define local error codes

### 5.4 Boundary-Crossing Fields

Only the following fields cross the MCP-to-execution boundary. All other
state stays local to the interaction plane.

| Field | Carries |
|---|---|
| `intentId` | originating intent identity for provenance |
| `planId` | plan identity |
| `specVersion` | spec version the plan was produced against |
| `requestedOutputs` | requested `ArtifactKind` set |
| Plan steps | `stepId`, `kind`, `inputs`, `dependsOn`, family-specific typed fields |
| Accepted assumptions | suppressed `ClarificationReasonCode` entries and resolved values |
| Workspace hint | recommended workspace kind (advisory) |

`ClarificationRequest` and `ClarificationResponse` history, elicitation
prompts, conversational context, and client-agent wording do not cross the
boundary. They remain MCP-side for audit through `ProvenanceRecord` on the
result package.

### 5.5 Orchestration Host Coordination

Orchestration hosts (for example, the consumer in `honua-devops#29`) host
plans over the same handoff semantics:

- orchestration hosts MUST NOT inject a private step kind, reason code, or
  assumption policy
- orchestration hosts that need an unrepresented planning concept MUST open a
  change against this document and `spec/taxonomy.md` rather than extend
  locally
- orchestration hosts consume the same `ExecutionJob` abstraction and do not
  redefine its status transitions

## 6. Non-Goals

These items are explicitly out of scope for this document. They preserve the
architectural boundaries established in `spec/taxonomy.md`.

### 1. Runtime Scheduling and Provisioning

Queueing, worker routing, provisioning strategy, and execution-time resource
allocation are owned by execution hosts. This document names `ExecutionJob`
and its status set but does not define state machines, retry policy, or
back-pressure behavior.

### 2. Approval Enforcement and Policy Evaluation

Approval evaluation, policy gates, and authorization verdicts are owned by
server-internal policy evaluators behind gRPC `ProcessService` and
`WorkspaceService`. This document surfaces `DestructiveAction`,
`PublishAction`, and `PolicyBoundary` as clarification reason codes only; it
does not define how a host decides whether to grant or deny approval.

### 3. Artifact Persistence and Workspace Lifecycle

Artifact storage, retention, promotion between workspace kinds, and workspace
creation or teardown are owned by gRPC `WorkspaceService`. Planners surface
workspace hints (Section 3.2) but do not manage lifecycle.

### 4. Result Package Construction

`AnalysisResultPackage`, `PublishingResultPackage`, `AppPackage`, and
`Deployment` are constructed by execution hosts. MCP surfaces these as
resources once the execution host marks the backing job terminal. Result
resource schemas and caching semantics are owned by future work in this
repository.

### 5. Natural-Language Prompt Authoring and Model Selection

Client-agent phrasing of `ClarificationRequest.prompt`, LLM selection,
prompt-engineering patterns, and natural-language rendering of options are
owned by the client agent. MCP defines the typed protocol only.

### 6. gRPC Execution Transport Semantics

Wire encoding, streaming modes, connection management, and service-level
retry behavior for `ProcessService`, `WorkspaceService`, and related services
are owned by `geospatial-grpc`. This document references the gRPC method
names (for example, `ProcessService.ValidatePlan`) but does not specify their
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
- **Planning-to-execution success ratio.** Per workflow family, the fraction
  of handed-off plans that reach `Succeeded` `ExecutionJob.status` versus
  those that reach `Failed` or `Cancelled`.
- **Full-catalog resource reads.** Frequency of full-catalog resource
  enumeration during planning (a smell per Section 3.1).
- **LowConfidence threshold configuration.** Per deployment, the configured
  threshold value and the rate at which `LowConfidence` clarifications fire.

Adding a new clarification reason code, step kind, or planning resource in
future changes to this document MUST include a corresponding signal category
here so coverage tracking remains complete.
