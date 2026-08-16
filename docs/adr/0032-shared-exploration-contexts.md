# ADR-0032: Shared Exploration Contexts as the Composition Interaction Model

## Status

Proposed (2026-08-15). Standalone standard decision that **amends
[ADR-0030](0030-declarative-interactions-and-layout.md) and
[ADR-0031](0031-composition-controls.md)**: it replaces
pairwise `interactions` as the *primary* interaction model with a shared-state
model, and retains a narrowed `interactions` block for one-shot gestures.
ADR-0031 is amended because two of its normative statements are false once a
control can join an exploration context: that the dynamic surface is exactly
interaction arguments, and that a control without an interaction is inert. A
context-bound filter control changes peer state with no interaction at all.
Both statements defer to this ADR. The reference implementation phase is tracked in honua-server;
see [Reference implementation status](#reference-implementation-status).

## Context

ADR-0030 rests on a premise stated in its own Consequences:

> Client runtimes implement dispatch by compiling bindings onto whatever
> imperative primitives they already have; the standard constrains the
> document, not the dispatcher.

That premise does not hold for the reference client, and the mismatch is
structural rather than cosmetic.

ADR-0030's Context describes the reference SDK as shipping "imperative binding
helpers (selection-to-exploration, chart-to-exploration,
filter-controls-to-exploration)". Those are not helpers that wire components
*to each other*. As their names say, each one binds a component **to a single
shared context**. The primitive underneath is `ExplorationContext` — a
protocol-neutral shared-state hub. Views attach with `bind`/`connectView`,
mutate shared state through `dispatch(intent)`, and subscribe per state slice.
The reducer enforces structural equality per slice, listeners fire on a
microtask so intent bursts coalesce into one notification, and bound views
ignore their own notifications by default so imperative UI callbacks cannot
feed back on themselves.

Its shared state (`ExplorationState`) has ten slices: `filters`,
`spatialFilter`, `extent`, `selection`, `sort`, `page`, `visibleFields`,
`grouping`, `aggregation`, `preset`. Propagation between views is governed by
a `LinkedViewPolicy` keyed on a coarse `ViewRole` (`map`, `grid`, `chart`,
`filter`, `detail`, `form`, `custom`) and summarized by five named presets:
`globalLinked`, `mapDriven`, `gridDriven`, `chartDriven`, `decoupled`.

Compiling ADR-0030's pairwise bindings onto that hub is lossy in six concrete
ways.

1. **The hub's defining property has no pairwise spelling.** Shared state is
   n-way by construction. A map, a table, and a chart on one filter context is
   *one* fact about the document. Expressed as event→action edges it is six
   directed bindings for a single shared slice, each of which must stay
   mutually consistent, and the edge set grows with the square of the
   component count for every slice that is shared.

2. **The fan-out cap mis-fires.** ADR-0030 RECOMMENDs bounding interactions per
   (`on.ref`, `on.event`) pair at 8. That is well calibrated for gesture wiring
   and wrong for shared state: a four-view globally-linked dashboard exceeds it
   on `selection` alone. The cap would reject documents describing the most
   ordinary dashboard in the category.

3. **Cycle-freedom is bought by prohibition instead of arbitration.**
   ADR-0030 forbids actions from emitting events, which does rule out cycles —
   at the cost of ruling out cycle-free chains too. A filter control that
   narrows a chart that re-scopes a map is acyclic and undescribable. The hub
   reaches the same safety property by different means (single reducer,
   per-slice structural equality, microtask coalescing, self-origin
   suppression) without forbidding propagation. The standard is paying real
   expressiveness for a hazard the runtime already handles.

4. **The verb set is strictly narrower than the runtime surface.** ADR-0030
   admits five verbs (`setFilter`, `setViewport`, `selectFeature`,
   `runWidgetQuery`, `setVisibility`). A bound view exposes twelve mutators
   across the ten slices, including `setSort`, `setPage`, `setVisibleFields`,
   `setGrouping`, `setAggregation`, `setSpatialFilter`, `clearFilter`, and
   `deselect`. Grouping and aggregation are precisely what chart-bearing
   dashboards need, and neither has a document spelling.

5. **The presets are unreachable.** Five correct-by-construction linked-view
   behaviors already exist and are already implemented. A document cannot say
   `globalLinked`; an agent must instead hand-author an edge set that
   approximates it, and any omission is a silently half-linked dashboard.

6. **Authoring economics.** For an agent composing an application at
   conversational latency, a linked dashboard costs O(V²) authoring
   operations under the pairwise model and O(V) under the shared-state model.
   Each operation is a model turn and a validation round, and each additional
   edge is another chance to emit an inconsistent binding. This is the
   difference between a dashboard appearing as the user describes it and a
   dashboard assembled over many turns.

None of this makes pairwise bindings useless. A button that flies the map to a
fixed extent, or a toggle that hides a layer, genuinely *is* a one-shot command
from one component to another, with no shared state involved. ADR-0030's model
is the right shape for those and the wrong shape for everything else.

## Decision

Composition documents gain a fourth standard-owned optional block —
**`explorationContexts`** — defined in
[`common/exploration.schema.json`](../../spec/schemas/common/exploration.schema.json)
and referenced from both the map-package and app-package resource schemas.
Components gain an optional binding to a context. Shared-state interaction
becomes context membership; `interactions` is retained and narrowed to
gestures.

### Exploration contexts (normative)

```json
{
  "explorationContexts": [
    {
      "id": "parcels-workspace",
      "sourceIds": ["parcels", "permits"],
      "preset": "globalLinked"
    }
  ]
}
```

- **`id`** is unique within the document's `explorationContexts` block.
- **`sourceIds`** lists the sources whose records the context's shared state
  addresses. Each MUST resolve against the document's declared sources; this
  is a validation-gate responsibility, as in ADR-0030.
- **`preset`** is a member of the closed set `globalLinked`, `mapDriven`,
  `gridDriven`, `chartDriven`, `decoupled`. It defaults to `globalLinked`.
  Extending the set requires a standard ADR.
- **`initialState`** is OPTIONAL and, when present, is a versioned snapshot of
  the shared state slices (`filters`, `spatialFilter`, `extent`, `selection`,
  `sort`, `page`, `visibleFields`, `grouping`, `aggregation`). It MUST carry a
  `version`. It is static JSON — the same data-never-code posture ADR-0030
  established, with no expression language and no `$event.*` substitution,
  because a context's initial state is not produced by an event.

Per-role propagation `rules` are deliberately **not** admitted in this ADR.
Presets are sufficient for the authoring cases that motivate it, and defining
only presets keeps validation to set membership. Explicit rules can join
through the issue → ADR → schema process if a real case demands them.

### Component binding (normative)

`map`, and each entry in `layers`, `widgets`, and `controls`, MAY carry:

```json
{ "explorationContextId": "parcels-workspace", "role": "chart" }
```

- **`explorationContextId`** MUST resolve to a declared context.
- **`role`** is a member of the closed set `map`, `grid`, `chart`, `filter`,
  `detail`, `form`, `custom`. It informs the preset's propagation policy.
- **Cross-filtering is identity of `explorationContextId`, not an edge.** Two
  components share state because they name the same context. There is no
  fan-out to cap, no ordering between bindings, and no edge set to keep
  consistent.
- A declared context with no bound components is valid; implementations
  SHOULD warn.

This also completes ADR-0031's `controls` collection in the direction it was
already headed: a filter dropdown becomes a `filter`-role component bound to a
context rather than the origin of a `change` → `setFilter` edge per target.

### Narrowed `interactions` (normative)

The `interactions` block from ADR-0030 is retained unchanged in shape, with two
normative narrowings:

- **Shared-state verbs are redundant inside a context.** When an interaction's
  `on.ref` and `do.ref` are bound to the same exploration context and its
  `do.verb` is `setFilter` or `selectFeature`, implementations MUST reject the
  document. Two writers to one slice — the context and the edge — is an
  ambiguity with no correct resolution, and the context already expresses the
  intent.
- **Gesture verbs remain unrestricted.** `setViewport`, `setVisibility`, and
  `runWidgetQuery` stay available regardless of context membership.
  `setVisibility` is presentation state rather than exploration state, and
  viewport and widget-query commands are meaningful as one-shot gestures even
  between bound components.

The per-(`on.ref`, `on.event`) fan-out cap is retained for `interactions`,
where it is correctly calibrated, and does not apply to context membership.

### Tool contract

`bind_interaction` and `remove_interaction` are unchanged. Three tools join the
existing additive **`composition`** profile established by ADR-0030:

- **`create_exploration_context`** — adds or replaces (by `id`) one context in
  a composition document.
- **`remove_exploration_context`** — removes one context by `id`. Implementations
  MUST reject removal while components remain bound, or clear those bindings
  atomically; silently orphaning a binding is not permitted.
- **`bind_component_context`** — sets or clears `explorationContextId` and
  `role` on one component, addressed by the ADR-0030 `ref` grammar.

A context's `preset` is changed through `create_exploration_context` replacing
the context by `id`; this ADR does not add a separate preset tool.

Document reference follows ADR-0030 exactly: the standard-level target is
`{ "mapPackageId": … }` or `{ "appPackageId": … }`, with the reference
implementation's draft-lifecycle spelling (`draftId` + `generation`) admitted
as `x-honua-reference-shape`.

### Reference implementation status

The reference implementation is **ahead of the standard and on the superseded
model**. honua-server trunk already ships `StudioInteraction` /
`StudioInteractionEvent` / `StudioInteractionAction`, the closed event and verb
sets, the layout and controls blocks, and the vendor-named
`honua_studio_bind_interaction` / `honua_studio_remove_interaction` tools —
while `docs/adr/0030` and `spec/schemas/common/interactions.schema.json` have
not merged to this repository's `trunk`.

Consequently the migration is entirely implementation-side. The three new tools
land with `implementationStatus: "known-gap"` in `index.json` and are not added
to the reference manifest. The reference continues to declare `["base"]` and
reaches FULL on `base` unchanged.

## Migration

Because the standard has not published ADR-0030, **the schema does not need a
deprecation cycle**: the corrected model can land in the ADR-0030/0031 schema
stack directly, and no adopter has an ADR-0030-shaped document to migrate. The
work is in the reference implementation.

- **Additive at the document level.** `explorationContexts` and
  `explorationContextId` / `role` are new optional properties. Documents that
  use only `interactions` remain schema-valid; the one new rejection is the
  redundant-writer case above, which no existing document can hit because no
  existing document declares a context.
- **Assisted upgrade for the motivating pattern — not a lossless rewrite.** A
  document whose interactions form a connected component over
  (`featureSelect` | `selection`) → (`setFilter` | `selectFeature`) among
  components sharing a source can be rewritten as one context with those
  components bound. **`globalLinked` is deliberately not prescribed here**: a
  single directed edge becomes bidirectional under it, and every other shared
  slice — selection, sort, page, extent, grouping, aggregation — starts
  propagating too. That broadens behaviour rather than preserving it.
  Implementations MAY offer the rewrite as an assisted migration, but it MUST
  be surfaced for review rather than applied silently, and the preset MUST be
  chosen to match the original edge direction (`mapDriven`, `gridDriven`, or
  `chartDriven`, per the source component's role). Only a complete, symmetric
  edge set across every shared slice is equivalent to `globalLinked`.
- **Reference implementation surface** to change in honua-server:
  `StudioCompositionModels.cs`, `StudioJsonContext.cs`,
  `StudioCompositionBodyEditor.cs`, `StudioPackageValidator.cs`,
  `StudioCompositionTools.cs`, `StudioMcpModels.cs`, `StudioMcpSchemas.cs`,
  `StudioMcpJsonContext.cs`, and `McpServiceCollectionExtensions.cs`; plus
  `studio/types.ts`, `studio/validate.ts`, and `studio/validation.ts` in
  honua-sdk-js.

## Consequences

- A new optional document block, two new optional component properties, and
  three new tools in an existing additive profile is a **MINOR**
  `SPEC_VERSION` change: no base-, mutation-, or analysis-conformant
  implementation becomes non-conformant
  ([GOVERNANCE.md §Semantic change classes](../../GOVERNANCE.md)).
- `check_manifest.py` needs no code change; profile gating is already generic
  over the `profile` field and `implementation.profiles`.
- **Validation gets simpler for the common case.** Context-membership
  validation is reference resolution plus two set-membership checks. It
  replaces edge-set consistency checking and, for shared state, retires the
  fan-out count entirely.
- **The document becomes a direct serialization of the runtime.** A live
  linked workspace can round-trip to a composition document and back without
  loss, which the pairwise model cannot do — today a globally-linked
  workspace has no faithful saved form.
- **Agent authoring for a linked dashboard drops from O(V²) to O(V)
  operations**, which is the change that makes prompt-latency dashboard
  authoring viable rather than merely expressible.
- **Two interaction concepts now coexist** — contexts for shared state,
  interactions for gestures. This is accepted deliberately. They model
  genuinely different things, and collapsing them into one pairwise
  vocabulary is what produced the defect this ADR corrects.
- **`initialState` is a serialization risk.** It pins a snapshot shape into
  the standard, so it REQUIRES a `version` field and is OPTIONAL; adopters
  that omit it are unaffected by future slice additions.
- Adding a state slice remains a coordinated change (slice union, reducer diff
  logic, preset table) and therefore a standard ADR, exactly as adding an
  event or verb is under ADR-0030.

## Non-goals

- **Explicit per-role propagation rules.** Presets only, in this ADR.
- **A component contract registry.** Widget `kind` remains a free string with
  an opaque `config`, so an agent authoring a chart still has no machine
  readable prop schema to author against. That is a real and separate gap; it
  is not addressed here.
- **Multiple contexts per document** need no new machinery — a document may
  declare several, and components bind to at most one — but coordinating
  *between* contexts is out of scope.
