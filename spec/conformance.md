# MCP Conformance Fixtures and Evaluation

**Status:** Draft
**Date:** 2026-04-19
**Scope:** Conformance strategy, fixture layout, operator-workflow evaluation, and runtime portability guidance for the geospatial MCP standard

This document defines how a third-party implementation demonstrates that it
honors the geospatial MCP standard. It specifies a fixture layout, an
operator-workflow evaluation model, a pass/fail rubric scoped to what MCP
owns, and host-integration notes for the four named target runtimes. It
extends [Taxonomy, Capability Matrix, and Non-Goals](taxonomy.md),
[MCP Resource Contracts](resources.md), and
[Clarification, Elicitation, Planning, and Handoff Semantics](planning.md);
it does not redefine vocabulary, resource URIs, planning semantics, or the
MCP-vs-gRPC boundary.

Upstream references (authoritative for object field shapes):

- [AI Operator Contract](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md)
- [AI Operator Technical Plan](https://github.com/honua-io/honua-server/blob/main/docs/contributor/AI_OPERATOR_TECHNICAL_PLAN.md)
- [AI Operator Agent Handoff](https://github.com/honua-io/honua-server/blob/main/docs/contributor/AI_OPERATOR_AGENT_HANDOFF.md)
- [AI-First Operator Architecture](https://github.com/honua-io/honua-server/blob/main/docs/contributor/AI_OPERATOR_ARCHITECTURE.md)
- [ADR-0028: AI-Driven Data Editing Is Not Allowed](https://github.com/honua-io/honua-server/blob/main/docs/contributor/adr/0028-ai-data-editing-not-allowed.md)

This repository owns the conformance strategy. Downstream harness
implementations, reference fixture sets, and host-specific eval runners
belong to consumer repositories (see §Downstream Coordination).

## 1. Scope and Relationship to Existing Spec Documents

The other three spec documents specify *what* the standard requires.
This document specifies *how to verify* that a given implementation meets
those requirements at the interaction-plane level:

- `spec/taxonomy.md` fixes primitives, the v1 capability matrix, and
  non-goals. Coverage status (`v1`, `deferred`, `--`, `excluded`) for any
  capability is read from that matrix; this document does not republish it.
- `spec/resources.md` fixes the `honua://` URI grammar, per-family
  inspection projections, lifecycle visibility, and the resource
  relationship graph. Resource fixtures reference those shapes by name.
- `spec/planning.md` fixes clarification reason codes, question kinds,
  assumption policies, per-family planning behavior, and the handoff
  contract. Scenarios encode those semantics as expected protocol turns.

The conformance document verifies behavior that is observable at the MCP
plane. It does not verify execution correctness, approval verdicts, or
gRPC wire behavior; those are owned by the family-owning gRPC services
and server-internal runtimes (see §7 Non-Goals).

This document is specification-only. It standardizes the fixture layout,
scenario model, and rubric a harness implements; it does not commit a
runnable fixture tree in this repository. A reference harness, if built,
is a downstream consumer artifact (see §Downstream Coordination).

## 2. Fixture Layout and Naming

Fixtures are runtime-neutral files that bind canonical MCP primitives to
expected behaviors. Each fixture references canonical shapes by name and
never inlines a canonical definition (per
[resources.md §Non-Goals — No Inlined Canonical Shapes](resources.md#6-no-inlined-canonical-shapes)).

### 2.1 Directory Structure

```
conformance/
  fixtures/
    tools/{tool_name}/           one subdirectory per MCP tool, organized by family; each contains one or more single-envelope fixture files (one file per case in §2.3, e.g. a `validate_plan` subdirectory carries separate `plan_validation`, `emit_clarification`, and `geoprocessing_error` files)
    resources/{family}/          one subdirectory per resource family; each contains one or more single-envelope fixture files
    prompts/{family}/            one subdirectory per prompt family; each contains one or more single-envelope fixture files
    elicitation/{reason_code}/   one subdirectory per ClarificationReasonCode; each contains one or more single-envelope fixture files
  scenarios/
    analyze/
    publish/
    build/
    deploy/         non-v1; scenarios are shape-only and flagged deferred
```

Each leaf fixture file carries exactly one §2.2 envelope. Multiple cases for
the same primitive entry (for example, the `plan_validation` and
`emit_clarification` outcomes a `validate_plan` fixture must exercise, or the
`geoprocessing_error` path every tool and resource MUST cover) are expressed
as separate files inside the primitive's subdirectory, not as a multi-fixture
collection file.

Directory keys mirror vocabulary already defined in the spec:

| Directory | Source vocabulary |
|---|---|
| `fixtures/tools/{tool_name}/` | MCP tools enumerated in [taxonomy.md §MCP Tools to Workflow Family Mapping](taxonomy.md#mcp-tools-to-workflow-family-mapping) |
| `fixtures/resources/{family}/` | Resource families enumerated in [resources.md §Resource URI Conventions](resources.md#resource-uri-conventions), plus the planning-stage resource families referenced by [planning.md §3](planning.md#3-planning-stage-resources) that use the open-core data-access surface rather than an MCP resource contract defined in this repository: catalog (`CapabilityCatalog`), dataset/layer (open-core `honua://services/{encodedServiceId}/layers/{layerId}` per [MCP_SERVER.md §Exposed MCP Resources](https://github.com/honua-io/honua-server/blob/main/docs/developer/MCP_SERVER.md#exposed-mcp-resources)), and process definition (`ProcessDefinition`). Fixtures for open-core families bind the canonical object or the open-core URI by name and MUST NOT invent an MCP-local inspection URI for a family that this spec does not define (per [taxonomy.md §Resources](taxonomy.md#resources)) |
| `fixtures/prompts/{family}/` | Prompt families enumerated in [taxonomy.md §Prompts](taxonomy.md#prompts) |
| `fixtures/elicitation/{reason_code}/` | `ClarificationReasonCode` values per [planning.md §2.1](planning.md#21-trigger-conditions) |
| `scenarios/{family}/` | Workflow families in [taxonomy.md §Workflow Families](taxonomy.md#workflow-families) |

No new family keys, reason codes, or tool names are introduced by this
layout. A harness that needs one MUST propose a change to
`spec/taxonomy.md` or `spec/planning.md` first.

### 2.2 Fixture Envelope

Every fixture file declares the same four-field envelope. The envelope is
transport-neutral; concrete serialization (JSON, YAML, other) is a
downstream harness choice.

| Field | Role |
|---|---|
| `id` | Stable fixture identifier, unique within its enclosing primitive subdirectory (per tool, per resource family, per prompt family, or per ClarificationReasonCode) |
| `inputs` | Typed intent fields, tool arguments, or resource-read parameters, keyed by canonical field name |
| `expected` | Exactly one of the expected-behavior shapes defined in §2.3 |
| `canonicalRefs[]` | Canonical objects this fixture binds, by upstream name (for example `AnalysisIntent`, `ClarificationRequest`, `ProcessDefinition`, `MapPackage`, `GeoprocessingError`) |

`canonicalRefs[]` is a provenance trail for the fixture, not a new
vocabulary. Every name in it MUST exist either in
[taxonomy.md §Canonical Concept Model](taxonomy.md#canonical-concept-model),
[resources.md](resources.md), or
[planning.md](planning.md), or in one of the upstream authoritative
documents cited at the top of this document (for example
`PlanValidationResult`, which is defined upstream in
[`DETERMINISTIC_OPERATOR_WORKFLOW_RESULTS.md` §Stage Model](https://github.com/honua-io/honua-server/blob/main/docs/developer/DETERMINISTIC_OPERATOR_WORKFLOW_RESULTS.md#stage-model)
and referenced without local redefinition per §2.3 and §7.8). A
fixture MUST NOT introduce an MCP-local object name or redefine
canonical field sets.

### 2.3 Expected-Behavior Shapes

A fixture's `expected` value is exactly one of:

| Shape | Applies to | Required bindings |
|---|---|---|
| `emit_plan` | Tool fixtures for the named plan-emitting MCP tool: `plan_analysis` (Analyze). Publish Data, Build App, and Automate / Deploy do not define a plan-emitting MCP tool in [taxonomy.md §MCP Tools to Workflow Family Mapping](taxonomy.md#mcp-tools-to-workflow-family-mapping); their plans surface to MCP through `validate_plan` or direct family tools (per [planning.md §2](planning.md#2-clarification-and-elicitation-semantics) and the per-family handoff model in [planning.md §5](planning.md#5-plan-handoff-semantics)) until upstream names additional plan-emitting MCP tools. A harness MUST NOT fixture an `emit_plan` shape under a tool name the taxonomy does not define; if upstream later names per-family plan-emitting tools, this row and the taxonomy tool matrix update together | Canonical `AnalysisPlan`, expected `outputs` declaration per [planning.md §5.4](planning.md#54-boundary-crossing-fields); no validation verdict is asserted |
| `plan_validation` | Tool fixtures for `validate_plan` (Analyze, Publish Data, Build App per [taxonomy.md §MCP Tools to Workflow Family Mapping](taxonomy.md#mcp-tools-to-workflow-family-mapping)) | Canonical `PlanValidationResult` (upstream: [`DETERMINISTIC_OPERATOR_WORKFLOW_RESULTS.md` §Stage Model](https://github.com/honua-io/honua-server/blob/main/docs/developer/DETERMINISTIC_OPERATOR_WORKFLOW_RESULTS.md#stage-model) and [`AI_OPERATOR_CONTRACT.md` §ValidatePlan](https://github.com/honua-io/honua-server/blob/main/docs/developer/AI_OPERATOR_CONTRACT.md)) asserted over a supplied canonical plan; the fixture asserts structural validation, capability preview, authorization preview, and policy preview outcomes without emitting a new plan |
| `tool_result` | Tool fixtures that return a canonical resource object or assert a boundary-crossing handoff rather than a plan (`execute_plan` → `ExecutionJob` reference for Analyze; Publish Data `execute_plan` asserts submission into `PipelineService` with **no MCP-owned return object**, and any follow-up state expectations in the enclosing scenario are expressed through deferred-shape fixtures per §2.4 — `PipelineService`-owned internal execution state is not an MCP resource in this version of the standard and cannot be expressed through `resource_projection`; `create_app_package` → `AppPackage`; `preview_app_package` → preview `ArtifactRef` (canonical per [resources.md §`honua://apps/{app_package_id}`](resources.md#honuaappsapp_package_id) and the Reserved `honua://results/{id}` — Builder Result section in the same document); `create_map_package`, `refine_map_package`, `apply_style_preset`, `compose_mixed_protocol_map` → `MapPackage`; `preview_map_package` → preview `ArtifactRef`; `publish_result` → canonical promotion-surface target per family: `PublishedService` for Publish Data (deferred shape until `honua-server#730`) and `Deployment` for Analyze and Build App (deferred shape until `honua-server#732`)) | For canonical-return tools, the returned object by name and, where defined in [resources.md](resources.md), the `honua://` URI under which it is addressable. For Publish Data `execute_plan`, the fixture binds the handoff boundary only: it MUST NOT invent a local job/result noun, and the enclosing scenario MUST NOT require a `resource_projection` fixture against a non-MCP `PipelineService`-owned surface. Any post-handoff state the scenario wants to assert (for example, eventual `PublishedService` surface or `PublishingResultPackage`) MUST be expressed as a deferred-shape fixture per §2.4 until the upstream shape becomes constructible (`honua-server#730` for `PublishedService`; upstream-defined shared result identifier for `PublishingResultPackage`). Deferred shapes follow §2.4 |
| `emit_clarification` | Tool fixtures for `clarify_intent` and any planning or validation tool when reason codes apply | `ClarificationRequest` with `reasonCodes[]` (subset of [planning.md §2.1](planning.md#21-trigger-conditions)) and per-question `kind` drawn from `ClarificationQuestionKind` |
| `resource_projection` | Resource fixtures | For resource families defined in [resources.md §Resource URI Conventions](resources.md#resource-uri-conventions): a `honua://` URI matching that section and the per-family responsibilities enumerated in the same document. For planning-stage families referenced by [planning.md §3](planning.md#3-planning-stage-resources) that use the open-core data-access surface (per §2.1): the open-core `honua://services/{encodedServiceId}/layers/{layerId}` route per [MCP_SERVER.md](https://github.com/honua-io/honua-server/blob/main/docs/developer/MCP_SERVER.md) for dataset/layer reads, or a canonical-object-name binding (`CapabilityCatalog`, `ProcessDefinition`) for families that do not carry an MCP inspection URI in this version of the standard. A fixture MUST NOT mint a new `honua://` route for a family this spec does not define |
| `geoprocessing_error` | Tool or resource fixtures that drive failure paths | Canonical [`GeoprocessingError`](resources.md#error-model) envelope with `kind` drawn from the upstream `GeoprocessingErrorKind` set |

A fixture MUST NOT declare a freeform response, a multi-shape disjunction,
or a response that mixes plan, validation-verdict, and clarification
output. "Emit no plan and no clarification" is not a legal expected shape
for `plan_analysis` (see
[planning.md §2.5](planning.md#25-planning-readiness-termination));
`plan_validation` and `tool_result` fixtures instead assert their
respective canonical returns or handoff assertions.

### 2.4 Deferred-Shape Fixtures

A fixture MAY bind a canonical object whose concrete field shape is still
finalizing upstream and whose MCP surface is not yet constructible end to
end (for example `PublishingResultPackage`, `PublishedService`, or
deferred `Deployment` promotion surfaces). `MapPackage` and
`AppPackage` remain scoreable on the stable identifier and
responsibility-level projections already defined in [resources.md](resources.md);
only their unsettled concrete field spellings stay deferred. Such a
fixture:

- MUST reference the canonical object by name only, in the pattern used
  by [resources.md](resources.md) for reserved routes;
- MUST set a `deferred: true` flag and name the upstream ticket that will
  finalize the shape (for example `honua-server#730`);
- MUST NOT freeze a draft field spelling or add an MCP-local synonym.

A scenario MAY include deferred-shape fixtures. Harnesses mark only the
rubric axes that depend on the unsettled field set as `not_applicable`;
axes that can be evaluated from stable identifiers, ownership rules,
URI grammar, or responsibility-level projections remain scoreable. The
scenario coverage matrix (§6) records a family or scenario as
`deferred` only when the upstream surface itself is non-v1 or
non-constructible.

## 3. Scenario Model

Scenarios are ordered chains of fixtures that exercise a full operator
workflow. Each scenario declares the typed expectations a harness scores
against the rubric in §4.

### 3.1 Scenario Fields

| Field | Role | Source |
|---|---|---|
| `id` | Stable scenario identifier, unique within its family directory | local |
| `family` | One of `Analyze`, `Publish Data`, `Build App`, `Automate / Deploy` | [taxonomy.md §Workflow Families](taxonomy.md#workflow-families) |
| `intentSeed` | Partially specified canonical intent of the family (`AnalysisIntent`, `PublishingIntent`, `BuilderIntent`, `DeploymentIntent`) | upstream contract |
| `assumptionPolicy` | `AskAlways`, `AskWhenMaterial`, or `UseDefaults` | [planning.md §2.3](planning.md#23-assumptionpolicy-behavior) |
| `expectedTurns[]` | Ordered protocol turns, family-specific. Every family permits zero or more `clarify_intent` rounds. `validate_plan` is OPTIONAL: RECOMMENDED for Analyze and Publish Data per [planning.md §5.1](planning.md#51-pre-handoff-mcp-planning-plane), and an optional preflight for Build App per [planning.md §4.3](planning.md#43-build-app). The terminal turn is chosen from the family's v1 handoff model — Analyze: `execute_plan` returning an `ExecutionJob` reference, with a post-execution `AnalysisResultPackage` projection read permitted when the scenario exercises promotion or provenance inspection; Publish Data: `execute_plan` into `PipelineService` with no MCP-owned return object; the scenario terminates at the handoff boundary and MUST NOT assert a `resource_projection` fixture against a non-MCP `PipelineService`-owned surface (publication-state read, refresh-run identity, or other internal pipeline state is not an MCP resource in this version of the standard per [planning.md §5.3](planning.md#53-post-handoff-execution--orchestration-plane) and [resources.md §PublishedService](resources.md#honuaservicespublished_service_id)). A scenario that wants to assert eventual post-handoff state MAY append a deferred-shape fixture per §2.4 bound to `PublishedService` (flagged `deferred: true` until `honua-server#730`) or `PublishingResultPackage` (reserved; deferred until upstream defines a shared stable result identifier); Build App: a direct Builder tool (`create_app_package` returning `AppPackage`, or `preview_app_package` returning a preview `ArtifactRef`), with no `execute_plan` turn per [planning.md §4.3](planning.md#43-build-app); Automate / Deploy: deferred, shape-only scenarios per §3.2 | [planning.md §5](planning.md#5-plan-handoff-semantics), [taxonomy.md §MCP Tools to Workflow Family Mapping](taxonomy.md#mcp-tools-to-workflow-family-mapping) |
| `expectedReasonCodes[]` | `ClarificationReasonCode` values the scenario is designed to exercise, restricted to the per-family scope in [planning.md §2.1](planning.md#21-trigger-conditions) | planning.md |
| `expectedStepKinds[]` | Step kinds expected in the emitted plan, drawn from the per-family set in [planning.md §4](planning.md#4-per-family-planning-behavior); omitted for Build App scenarios that exercise only direct Builder tools without a separate plan-emission turn | planning.md |
| `expectedResourceReads[]` | Resource families expected during planning, drawn from the per-family required resources in [planning.md §3](planning.md#3-planning-stage-resources) | planning.md |
| `expectedProvenanceFields[]` | `ProvenanceRecord` fields expected on the terminal projection **when** the scenario terminates in a result package (`AnalysisResultPackage`, `PublishingResultPackage`), drawn from [resources.md §Result Package Resources](resources.md#result-package-resources). Omitted for scenarios whose terminal projection is not a result package (`AppPackage`, preview `ArtifactRef`, `ExecutionJob` reference, `PublishedService` read) and for scenarios that terminate at a handoff boundary with no MCP-owned return object (Publish Data `execute_plan`); those scenarios carry provenance at the family-owning service layer, not on an MCP-projected `ProvenanceRecord`. Provenance fields on a deferred-shape `PublishingResultPackage` fixture follow §2.4 and are scored `not_applicable` on axes that depend on the unsettled field set | resources.md |
| `outOfScopeGuards[]` | At least one action the scenario MUST NOT observe (see §3.3) | local (per scenario) |

No field in this list introduces a new canonical noun. `id` and
`outOfScopeGuards[]` are the only locally defined fields; both are
scenario-scoped and MUST NOT leak across the boundary described in
[planning.md §5.4](planning.md#54-boundary-crossing-fields).

### 3.2 Scenario Families

v1 scenario families derive from the capability matrix in
[taxonomy.md §v1 Capability Matrix](taxonomy.md#v1-capability-matrix) and
the per-family planning behavior in
[planning.md §4](planning.md#4-per-family-planning-behavior).

| Family | Scenario coverage target | Handoff model |
|---|---|---|
| Analyze | discovery, planning, execution, map refinement, promotion | `execute_plan` → `ProcessService.SubmitPlanJob` → `ExecutionJob` → `AnalysisResultPackage` |
| Publish Data | source inspection, schema and quality review, publish, refresh monitoring (deferred shape), deployment inspection | `execute_plan` → `PipelineService` execution with no MCP-owned return object; scenarios terminate at the handoff boundary in v1. `PipelineService`-owned internal execution state (publication-state read, refresh-run identity) is not an MCP resource and MUST NOT be expressed as a `resource_projection` fixture. Post-handoff verification, when a scenario asserts it, uses a deferred-shape fixture per §2.4 bound to `PublishedService` (flagged `deferred: true` until `honua-server#730`) or `PublishingResultPackage` (reserved per the Reserved `honua://results/{id}` — Publishing Result section of [resources.md](resources.md); deferred until upstream defines a shared stable result identifier) |
| Build App | template binding, `create_app_package`, `preview_app_package`, package inspection | direct Builder tools → `AppPackage` (via `create_app_package`) or preview `ArtifactRef` (via `preview_app_package`); no `execute_plan` handoff per [planning.md §4.3](planning.md#43-build-app) |
| Automate / Deploy | deferred; shape-only scenarios only | not executed in v1; scenarios validate plan-shape assertions only |

Publisher refresh-monitoring scenarios MUST be flagged deferred-shape
per §2.4 until `honua-server#730` finalizes
[`PublishedService`](resources.md#honuaservicespublished_service_id).
Automate / Deploy scenarios MUST carry a `deferred: true` flag on the
scenario envelope so harnesses exclude them from v1 scoring.

### 3.3 Out-of-Scope Guards

Every scenario MUST declare at least one out-of-scope guard so non-goals
are telemetered when a scenario runs. Guards are drawn from the
non-goals already specified in the spec; the conformance document does
not introduce new non-goals at this point.

| Guard category | Source |
|---|---|
| No AI data mutation path is taken | [taxonomy.md §Non-Goals — Direct AI Data Editing](taxonomy.md#1-direct-ai-data-editing) |
| No non-whitelisted step kind is emitted | [planning.md §4](planning.md#4-per-family-planning-behavior) |
| No unknown `ClarificationReasonCode` is emitted | [planning.md §2.1](planning.md#21-trigger-conditions) |
| No protocol-specific tool (GeoServices, OGC, OData) surfaces | [taxonomy.md §Non-Goals — Protocol-Specific Tool Contracts](taxonomy.md#4-protocol-specific-tool-contracts) |
| No state-mutation path is exposed through a resource read | [resources.md §Non-Goals — No State Mutation](resources.md#1-no-state-mutation) |
| No MCP-local error code is introduced outside `GeoprocessingError` | [resources.md §Error Model](resources.md#error-model) |
| No server-internal field is surfaced through a resource projection | [resources.md §Non-Goals — No Exposure of Server Internals](resources.md#3-no-exposure-of-server-internals) |

A scenario that fails to declare any guard fails rubric axis 7
(§4.1) regardless of the scored behavior.

## 4. Pass/Fail Rubric

The rubric is scoped to MCP ownership boundaries. It scores observable
protocol behavior only; it does not score whether `ProcessService`,
`PipelineService`, or `BuilderService` actually produced correct data,
and it does not score approval verdicts or gRPC wire behavior.

Scoring is rubric-based, not numeric. A reference harness or a human
reviewer applies each axis independently; this document does not
prescribe weights or aggregate thresholds.

### 4.1 Scoring Axes

Each axis yields one of `pass`, `partial`, `fail`. `partial` applies when
the expectation is met but with a minor deviation explicitly permitted by
the listed source section.

| Axis | Pass when | Partial when | Fail when | Source |
|---|---|---|---|---|
| 1. Clarification quality | Fires only when at least one in-scope reason code applies; each question uses one of the four canonical `ClarificationQuestionKind` values; `questionId` is unique across the intent lifecycle; rebinding is additive and idempotent | — ([planning.md §2.2](planning.md#22-question-kinds-and-shape) makes a non-canonical question kind a contract violation rather than a permissible deviation; no axis-1 partial is defined) | A reason code outside `ClarificationReasonCode` is emitted; a question uses a `kind` outside the canonical four (per [planning.md §2.2](planning.md#22-question-kinds-and-shape) a planner that cannot express its ambiguity through the typed kinds MUST escalate to `LowConfidence` instead); a `questionId` is reused; rebinding removes a previously resolved field | [planning.md §2.1, §2.2, §2.4, §2.6](planning.md#2-clarification-and-elicitation-semantics) |
| 2. AssumptionPolicy behavior | Non-suppressible reason codes always surface regardless of policy; suppressed reason codes bake resolved values into plan step `inputs` (the authoritative record per [planning.md §2.3](planning.md#23-assumptionpolicy-behavior)); when the upstream submission envelope supports the compact assumption audit carrier, the planner additionally hands one audit string per suppressed reason code across the boundary | The compact assumption audit is attached in a forward-compatible shape before the upstream carrier field is formally defined (SHOULD over-delivery permitted per [planning.md §2.3](planning.md#23-assumptionpolicy-behavior) and [§5.4](planning.md#54-boundary-crossing-fields)); baked step inputs remain the authoritative record in either case | `DestructiveAction`, `PublishAction`, or `PolicyBoundary` is suppressed under any policy; a suppressed reason code fails to bake the resolved value into plan step `inputs`; the submission envelope defines the audit carrier field and the planner omits the compact assumption audit string | [planning.md §2.3](planning.md#23-assumptionpolicy-behavior) |
| 3. Plan validity | Every step kind is in the per-family set; each `Geoprocess` step binds a `ProcessDefinition`; every entry in `requestedOutputs` has at least one producing step; `BuilderPlan` ordering holds (`select_template` first; `generate_project` after all required `bind_*` / `compose_*`) | A plan includes a warning-level condition permitted by [planning.md §4](planning.md#4-per-family-planning-behavior) but no structural rule is violated | A step kind outside the family set appears; an unbound `Geoprocess` step is emitted; a requested output has no producing step; `BuilderPlan` ordering is violated | [planning.md §4](planning.md#4-per-family-planning-behavior) |
| 4. Handoff correctness | Only the fields in [planning.md §5.4](planning.md#54-boundary-crossing-fields) cross the boundary; MCP does not retry `execute_plan`; Publish Data post-handoff state is not surfaced as an MCP resource in v1 (`PipelineService`-owned execution state is not expressible as a `resource_projection`); when the scenario asserts post-handoff state, it uses a deferred-shape fixture per §2.4 bound to `PublishedService` or `PublishingResultPackage`; when the audit carrier fields are not yet defined upstream, resolved values baked into plan step inputs serve as the authoritative record per [planning.md §2.3](planning.md#23-assumptionpolicy-behavior) and [§5.2](planning.md#52-handoff-operation) | The handoff attaches clarification or assumption audit strings in a forward-compatible shape before the upstream carrier field is frozen (over-delivery of the SHOULD in [planning.md §5.2](planning.md#52-handoff-operation), revisited when upstream lands the carrier) | MCP synthesizes a shared `ExecutionJob` shape for Publish Data; MCP retries `execute_plan` on its own initiative; a non-boundary field leaves the MCP plane; a `resource_projection` fixture asserts a non-MCP `PipelineService`-owned surface | [planning.md §5](planning.md#5-plan-handoff-semantics) |
| 5. Result projection | Result, asset, promotion-surface, and workspace resources render the read-only projection defined in [resources.md](resources.md): concrete fields where that document enumerates them, and responsibility-level projections where that document intentionally leaves field spellings upstream-owned (for example `MapPackage`, `AppPackage`, `PublishedService`). Identifiers and `honua://` URIs follow the stable form defined for that resource family, including families with no MCP-local prefix convention | A reserved or otherwise deferred route surfaces only the canonical object name or responsibility list permitted by [resources.md](resources.md) while upstream finalizes the constructible field set | A resource projection exposes a mutation path; a resource introduces a field or identifier convention outside the per-family inspection contract; a URI uses a scheme other than `honua://` | [resources.md §Resource URI Conventions, §Result Package Resources, §Asset Resources, §Promotion-Surface Resources](resources.md) |
| 6. Error envelope | Failures use the canonical `GeoprocessingError` envelope verbatim; `kind` values are drawn from `GeoprocessingErrorKind`; `violations[]` carries `code`, `message`, `fieldPath` as specified | A deferred upstream kind is surfaced by name without local redefinition | An MCP-local error code, envelope, or `kind` value is introduced | [resources.md §Error Model](resources.md#error-model) |
| 7. Non-goal containment | Every declared out-of-scope guard (§3.3) is observed to hold across the scenario run | A guard is observed to hold but telemetry for that guard category is absent | Any guard fails; no guards are declared; the scenario emits a protocol-specific (GeoServices / OGC / OData) tool path; an AI data-mutation path is taken | [taxonomy.md §Non-Goals](taxonomy.md#non-goals), [resources.md §Non-Goals](resources.md#non-goals) |

### 4.2 Rubric Application

- A scenario passes when every axis it exercises scores `pass`. A
  scenario passes with deviations when at least one axis scores
  `partial` and no axis scores `fail`.
- A scenario that carries a deferred-shape fixture (§2.4) is still
  scored on every axis that can be evaluated from stable identifiers,
  ownership rules, URI grammar, or responsibility-level projections.
  The harness marks only the axes that depend on an unsettled upstream
  field set `not_applicable`.
- Scenarios under `scenarios/deploy/` remain fully deferred in v1 and
  MUST NOT be scored until their upstream execution shapes land.
- Rubric outcomes are reported per axis and per scenario. Aggregate
  numeric scores across implementations are out of scope at v1 (§7
  Non-Goals).

## 5. Runtime Portability Guidance

A runtime is "MCP-conformant" when the scenarios it runs score the rubric
correctly, regardless of the model, SDK, or transport used to host them.
The four target runtimes below share the typed MCP primitives; portability
notes describe only the seams where host integration must adapt.

Host-integration guidance is non-normative: these sections specify what
"green" looks like for a first integration run and name known seams. They
do not standardize adapter implementations or SDK surfaces.

### 5.1 Claude

- Tool-call and elicitation surface: Claude's tool use and typed
  elicitation map directly onto MCP tool invocation and
  `ClarificationRequest` / `ClarificationResponse`. No protocol
  variant is required.
- Known seams: model-side tool discovery may be eager; harnesses that
  pre-seed discovery MUST NOT inject MCP-local tool names.
- Smoke floor: at least one scenario per v1 family runs under
  `AskWhenMaterial`. A green first run scores `pass` on axes 1, 3, 4,
  and 5 for every v1 family. Deferred scenarios (Automate / Deploy,
  Publish Data refresh monitoring) do not contribute to the smoke floor.

### 5.2 Codex

- Tool-call and elicitation surface: Codex invocation maps onto MCP tool
  calls; `ClarificationRequest` is presented as a typed elicitation turn.
- Known seams: Codex environments may not surface prompts as a native
  primitive; harnesses resolve prompt fixtures against the prompts
  directory explicitly before planner invocation.
- Smoke floor: at least one Analyze and one Build App scenario pass
  rubric axes 1, 3, 4, and 5.

### 5.3 Microsoft Agent Framework

- Tool-call and elicitation surface: framework tool invocation maps onto
  MCP tools; elicitation maps onto typed agent responses bound to
  `questionId`.
- Known seams: framework-level agent composition may schedule multiple
  tool calls in one turn; harnesses MUST preserve `questionId` identity
  across batched turns ([planning.md §2.6](planning.md#26-mcp-elicitation-mapping)).
- Smoke floor: one scenario per v1 family passes rubric axes 1, 3, 4, 5,
  and 7.

### 5.4 Local Llama-class

- Tool-call and elicitation surface: a self-hosted, non-proprietary
  planner hosts the MCP tools through an adapter; elicitation is
  rendered as typed output and parsed back into `ClarificationResponse`.
- Known seams: local planners may produce lower `LowConfidence`
  discrimination; harnesses SHOULD run these targets under `AskAlways` so
  non-suppressible reason codes still surface deterministically
  ([planning.md §2.3](planning.md#23-assumptionpolicy-behavior)).
- Smoke floor (minimum viable v1): at least one scenario passes per
  workflow family (Analyze, Publish Data, Build App) under `AskAlways`.
  Automate / Deploy is deferred; no Llama-class floor is set for it.

The Llama-class smoke floor is intentionally the lowest of the four
targets so the harness stays runnable against a self-hosted planner and
does not depend on any specific vendor model.

## 6. Scenario Coverage Matrix

Coverage status (`v1`, `deferred`, `--`, `excluded`) is single-sourced in
[taxonomy.md §v1 Capability Matrix](taxonomy.md#v1-capability-matrix) and
the per-family step and resource sets in
[planning.md §2.1, §3, §4](planning.md#4-per-family-planning-behavior).
This matrix is a scenario-to-capability grouping; it does not republish
coverage columns or introduce a parallel matrix.

| Scenario directory | Workflow family | Scenario coverage target | Status source |
|---|---|---|---|
| `scenarios/analyze/discovery` | Analyze | `ground_candidates` resolves candidate set from `CapabilityCatalog` | taxonomy matrix, row Analyze / Intent capture |
| `scenarios/analyze/planning` | Analyze | `plan_analysis` + `clarify_intent` + `validate_plan` loop reaches planning readiness | taxonomy matrix, row Analyze / Plan validation |
| `scenarios/analyze/execution` | Analyze | `execute_plan` handoff produces `ExecutionJob` with canonical field set | taxonomy matrix, row Analyze / Plan execution |
| `scenarios/analyze/map_refinement` | Analyze | `refine_map_package` and `apply_style_preset` update `MapPackage` composition without new canonical nouns | taxonomy matrix, row Analyze / Map composition |
| `scenarios/analyze/promotion` | Analyze | Result-rooted and workspace-rooted artifact reads align per [resources.md §Artifact Addressing Rule](resources.md#artifact-addressing-rule) | resources.md |
| `scenarios/publish/source_inspection` | Publish Data | `ground_candidates` + `inspect_source` surface source without mutation | taxonomy matrix, row Publish Data / Intent capture |
| `scenarios/publish/schema_quality_review` | Publish Data | `infer_schema`, `map_schema`, and `quality_check` surface schema and quality findings without emitting `DestructiveAction`; `DestructiveAction` is asserted only when the plan also includes one of the mutating steps (`clean_records`, `dedupe`, `enrich`, `normalize_crs`) per [planning.md §4.2](planning.md#42-publish-data) | planning.md §4.2 |
| `scenarios/publish/publish` | Publish Data | `publish_service` drives `PublishAction` clarification before handoff; scenario terminates at the `PipelineService` handoff boundary with no MCP-owned return object, and any post-handoff verification uses deferred-shape fixtures per §2.4 | planning.md §5.3, resources.md §Publishing Result |
| `scenarios/publish/refresh_monitoring` | Publish Data (deferred shape) | `PublishedService` refresh state surfaced read-only; fixture marked `deferred: true` until `honua-server#730` | resources.md §Promotion-Surface Resources |
| `scenarios/publish/deployment_inspection` | Publish Data | `honua://deployments/{id}` read surfaces target binding without control paths | resources.md §Promotion-Surface Resources |
| `scenarios/build/app_generation` | Build App | `create_app_package` consumes `BuilderIntent` and returns an `AppPackage` projection | taxonomy matrix, row Build App / App composition |
| `scenarios/build/package_inspection` | Build App | `honua://apps/{id}` read exposes responsibilities enumerated in [resources.md §`honua://apps/{app_package_id}`](resources.md#honuaappsapp_package_id) | resources.md |
| `scenarios/build/hosted_publication` | Build App | `preview_app_package` + `honua://deployments/{id}` reads align without exposing deployment control | resources.md §Promotion-Surface Resources |
| `scenarios/deploy/**` | Automate / Deploy | deferred; all scenarios carry `deferred: true` and are shape-only | taxonomy matrix, Automate / Deploy column |

Fifth-family (Edit Data) scenarios are excluded per ADR-0028 and
[taxonomy.md §Edit Data (Excluded)](taxonomy.md#edit-data-excluded).
Any cell's coverage state (`v1`, `deferred`, `--`, `excluded`) is read
from the taxonomy matrix; when coverage changes, the taxonomy matrix is
the single edit point and this table's status references update by
pointer.

## 7. Non-Goals

These items are explicitly out of scope for the conformance surface and
align with the non-goals in
[taxonomy.md §Non-Goals](taxonomy.md#non-goals) and
[resources.md §Non-Goals](resources.md#non-goals). The conformance
document inherits those non-goals verbatim and adds the following
rubric-scoped non-goals so scoring stays inside MCP ownership boundaries.

### 1. No Execution-Outcome Scoring

The rubric does not score whether an `ExecutionJob` actually produced
correct data, whether a `PublishedService` actually served a query, or
whether a `Deployment` actually routed traffic. Execution correctness is
owned by the family-owning gRPC services (`ProcessService`,
`PipelineService`, `BuilderService`, `DeploymentService`) and by
`WorkspaceService` for artifact lifecycle. See
[planning.md §6 Non-Goals — Runtime Scheduling and Provisioning](planning.md#1-runtime-scheduling-and-provisioning).

### 2. No Approval-Enforcement Scoring

The rubric does not score whether an approval verdict was granted or
denied. `DestructiveAction`, `PublishAction`, and `PolicyBoundary` are
scored only for clarification firing and policy behavior
([planning.md §2.3](planning.md#23-assumptionpolicy-behavior)), not for
downstream authorization outcomes.

### 3. No gRPC Wire-Behavior Scoring

The rubric does not score retry policy, streaming modes, connection
management, or service-level transport behavior. Those are owned by
`geospatial-grpc` per
[taxonomy.md §Non-Goals — Replacing gRPC Contracts](taxonomy.md#2-replacing-grpc-contracts)
and [planning.md §6 Non-Goals — gRPC Execution Transport Semantics](planning.md#6-grpc-execution-transport-semantics).

### 4. No Planner-Algorithm Prescription

Every rubric axis references externally observable behavior (emitted
plan shape, question kind, reason-code firing, provenance field
population). The rubric does not prescribe a planner algorithm, a
confidence-score formula, or a `LowConfidence` numeric threshold
([planning.md §2.7](planning.md#27-lowconfidence-threshold)).

### 5. No Aggregate Numeric Benchmarking

v1 outcomes are reported per axis and per scenario. No aggregate score,
cross-implementation leaderboard, or weighted benchmark is defined. A
harness MAY compute aggregate metrics locally but MUST NOT claim them
as conformance outcomes of this standard.

### 6. No Reference Harness In This Repository

The conformance strategy is specification-only. A runnable harness, a
committed fixture tree, or host-specific scenario runners are downstream
consumer concerns (see §Downstream Coordination). This repository does
not ship executable conformance code.

### 7. No Parallel Taxonomy, URI Scheme, or Error Envelope

Family names, the capability matrix, the `honua://` URI scheme, the
`GeoprocessingError` envelope, and `ClarificationReasonCode` values stay
single-sourced in `taxonomy.md`, `resources.md`, and `planning.md`. This
document references them and MUST NOT introduce alternatives.

### 8. No Inlined Canonical Shapes

Canonical shapes (`AnalysisResultPackage`, `MapPackage`, `AppPackage`,
`Deployment`, `PublishedService`, `ProvenanceRecord`, `ArtifactRef`,
`WorkspaceRef`, `GeoprocessingError`, `ClarificationRequest`,
`ClarificationResponse`, `AnalysisPlan`, `PublishingPlan`, `BuilderPlan`,
`DeploymentPlan`, `PlanValidationResult`) are referenced by name only. Fixtures that need a
shape whose concrete fields are deferred upstream MUST use the
deferred-shape convention in §2.4, matching
[resources.md §Non-Goals — No Inlined Canonical Shapes](resources.md#6-no-inlined-canonical-shapes).

## 8. Observable Signals

Implementations should emit conformance-plane signals that extend the
signal sets in [taxonomy.md §Observable Signals](taxonomy.md#observable-signals)
and [planning.md §7 Observable Signals](planning.md#7-observable-signals).
These are signal categories; specific metric names and instrumentation
frameworks are implementation choices.

- **Scenario pass rate.** Per workflow family and per rubric axis, the
  rate of `pass`, `partial`, `fail`, and `not_applicable` outcomes.
- **Reason-code coverage per run.** Which `ClarificationReasonCode`
  values fired across scenarios in a run, extending the
  reason-code-coverage signal in
  [planning.md §7](planning.md#7-observable-signals).
- **Non-goal assertion rate.** For each out-of-scope guard category in
  §3.3, the rate at which a scenario observed the guard fail
  (source-data mutation attempted, protocol-specific tool path attempted,
  server-internal field surfaced, MCP-local error code introduced). This
  extends the `Non-goal assertions` signal in
  [resources.md §Observable Signals](resources.md#observable-signals)
  and the cross-reference in
  [taxonomy.md §Observable Signals](taxonomy.md#observable-signals).
- **Runtime coverage.** For each of the four named runtimes in §5, the
  number of scenarios that achieved the runtime's smoke floor in a given
  run.
- **Deferred-shape exclusion rate.** The fraction of rubric axes marked
  `not_applicable` due to deferred upstream shapes (§2.4); tracks
  conformance coverage growth as upstream shapes land.
- **Conformance spec identifier per run.** A deterministic document
  identifier for the conformance spec a run was evaluated against, for
  traceability during spec churn. The identifier is the document `Date`
  header (see the title block of this document) and the repository
  commit SHA of `spec/conformance.md` at evaluation time; this document
  does not define a `specVersion` field of its own. `specVersion` on
  canonical plan objects (`AnalysisPlan`, `PublishingPlan`,
  `BuilderPlan`, `DeploymentPlan`) is a plan-object field per
  [planning.md §5.4](planning.md#54-boundary-crossing-fields) and is
  not a document-level identifier for this spec.

Adding a new scenario family, rubric axis, or out-of-scope guard in
future changes to this document MUST include a corresponding signal
category here so coverage tracking remains complete.

## Downstream Coordination

This document standardizes the conformance surface. Downstream
consumers own their own harness implementations, fixture trees, and
scenario runners; they are not co-designed here.

| Consumer | Role |
|---|---|
| [`honua-server`](https://github.com/honua-io/honua-server) | Hosts server-side conformance tests against its MCP implementation of the spec |
| [`honua-sdk-js`](https://github.com/honua-io/honua-sdk-js) | Hosts SDK-side scenario runners for Analyze and Build App families |
| [`honua-devops#29`](https://github.com/honua-io/honua-devops/issues/29) | Orchestrator-side scenario runners; submits plans through `execute_plan` against the same handoff model |
| [`honua-devops#31`](https://github.com/honua-io/honua-devops/issues/31) | Reference fixture publication and eval-harness packaging (if adopted) |
| [`geospatial-grpc#3`](https://github.com/honua-io/geospatial-grpc/issues/3) | Aligns gRPC conformance surface with the MCP boundary rubric without duplicating axes |

Sequencing: the fixture layout (§2), scenario model (§3), rubric (§4),
runtime portability seams (§5), and coverage matrix (§6) above are the
stable interface. Downstream tickets finalize runnable harness code,
concrete fixture trees, and host-specific scenario runners. The
conformance spec absorbs upstream shape finalization (for example
`honua-server#730`/`#731`/`#732`) by reference without local
redefinition.
