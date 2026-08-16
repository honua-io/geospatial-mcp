# ADR-0030: Declarative Interactions and Layout for Composition Documents

## Status

Proposed (2026-08-11). Standalone standard decision (the reference
implementation phase is tracked in honua-server; see
[Reference implementation status](#reference-implementation-status)).

## Context

The standard's composition documents — `MapPackage` and `AppPackage`
([`resources/map-package.schema.json`](../../spec/schemas/resources/map-package.schema.json),
[`resources/app-package.schema.json`](../../spec/schemas/resources/app-package.schema.json))
— describe *static* composition: layers bound to sources, styling, an initial
view, widgets. Nothing in the vocabulary lets an agent wire those components
together: "when a feature is selected on this layer, filter that chart",
"when this control changes, update that layer's filter", "when a chart row is
selected, move the map". Without that, an agent can compose a map but not an
*application* — the wiring between components is what separates the two.

Adopters are already filling the gap privately. The reference implementation's
client SDK ships imperative binding helpers (selection-to-exploration,
chart-to-exploration, filter-controls-to-exploration), and its composition
tools accept widget objects with free-form `config`. If the standard cannot
describe interaction wiring, each adopter will invent a divergent private
spelling — the exact failure ADR-0028 corrected for `edit_features` and
ADR-0029 corrected for direct geoprocessing verbs.

The same gap exists for **layout**: widgets have no standard notion of
placement, so a multi-widget composition (a dashboard) cannot be expressed
portably — only generated whole by a vendor surface.

Three constraints shape the design:

1. **Bindings must be data, never code.** An agent-authored interaction that
   embeds an expression language (or worse, script) cannot be statically
   validated, budgeted, or safely replayed. The standard's planning and
   safety posture (plans and packages are inspectable, dry-runnable
   documents) requires interactions to be declarative.
2. **No event cycles by construction.** A binding graph that lets actions
   trigger further bindings needs cycle detection, budget accounting, and
   re-entrancy semantics. Ruling that out at the vocabulary level keeps
   validation trivial for every implementer.
3. **Vocabulary collision.** `sourceBindings` already means layer↔datasource
   binding in `create_map_package` and the composition resources, and
   `operate_events` / `alert_events` already occupy "events" in the tool
   namespace. The new concept needs a name that collides with neither.

## Decision

Composition documents gain two standard-owned, optional blocks —
**`interactions`** and **`layout`** — defined once in
[`common/interactions.schema.json`](../../spec/schemas/common/interactions.schema.json)
and referenced from both the map-package and app-package resource schemas.
Two new composition tools — **`bind_interaction`** and
**`remove_interaction`** — mutate the `interactions` block. Both tools are
gated by a new additive **`composition` conformance profile**.

### The interaction model (normative)

An interaction is a single declarative event→action binding:

```json
{
  "id": "select-parcel-filters-chart",
  "on": { "ref": "layer:parcels", "event": "featureSelect" },
  "do": {
    "ref": "widget:area-chart",
    "verb": "setFilter",
    "args": { "field": "parcelId", "value": "$event.featureId" }
  }
}
```

- **Component references** (`ref`) address components already declared in the
  same composition document: `map` (the map itself), `layer:{id}`,
  `widget:{id}`, `control:{id}`. Reference resolution is a validation-gate
  responsibility, not a schema one: an implementation MUST reject a binding
  whose `ref` does not resolve within the document.
- **Event sources** are a closed set per source kind: `featureSelect` and
  `featureHover` (layers), `selection` (widgets), `change` (controls),
  `viewportChange` (map). Extending the set requires a standard ADR.
- **Action verbs** are a closed set drawn from the existing composition
  vocabulary: `setFilter`, `setViewport`, `selectFeature`, `runWidgetQuery`,
  `setVisibility`. An interaction grants no capability the composition
  surface does not already have — verbs mutate presentation/exploration
  state only, never source records (ADR-0028 is unaffected).
- **Arguments are static JSON plus `$event.*` path substitution.** A string
  value that begins with `$event.` is replaced at dispatch time by the value
  at that path in the event payload (e.g. `$event.featureId`,
  `$event.value`, `$event.bbox`). There is **no expression language** — no
  arithmetic, no conditionals, no function calls. This is the whole of the
  dynamic surface, which is what keeps interactions statically validatable
  and dry-runnable.
- **Actions never emit events.** Only user gestures produce events;
  verb-driven state changes MUST NOT re-enter the interaction dispatcher.
  This rules out cycles by construction — no graph solver, no re-entrancy
  budget, no ordering semantics between bindings.
- **Fan-out cap.** An implementation MUST bound the number of interactions
  sharing the same (`on.ref`, `on.event`) pair; the cap is
  implementation-defined, and a cap of 8 is RECOMMENDED. Validation rejects
  documents over the cap rather than truncating.

### The layout model (normative)

`layout` places widgets on a grid:

```json
{
  "grid": { "columns": 12 },
  "items": [
    { "ref": "widget:area-chart", "x": 0, "y": 0, "w": 6, "h": 4 }
  ]
}
```

Grid columns default to 12; items reference widgets by the same `ref`
grammar and carry integer `x`/`y`/`w`/`h` cell placement. Layout is
presentation metadata only. A composition with widgets and no `layout` is
valid (hosts choose a default flow); an `items` entry whose `ref` does not
resolve is rejected by the same validation gate as interactions.

### The `composition` conformance profile

`bind_interaction` and `remove_interaction` join the vocabulary as
Build-App-family tools under a new additive **`composition` profile**, for
the reason ADR-0029 established: placing new tools in `base` and later
flipping them `implemented` would retroactively demote every base-only
adopter from FULL to MAPPED. An implementation that never offers interactive
composition remains a complete, conformant `base` implementation.

The `composition` profile is also the intended landing zone for the wider
interactive-composition tool family the reference implementation already
ships under vendor names (draft lifecycle and per-component composition
verbs, advertised as `honua_studio_*`). Formalizing those names is a
separate, larger upstreaming tracked outside this ADR; admitting them to the
standard requires its own ADR and joins them to this profile.

### Tool contract

- **`bind_interaction`** — adds or replaces (by `id`) one interaction in a
  composition document. Input: a document reference plus one `interaction`
  object conforming to
  [`common/interactions.schema.json`](../../spec/schemas/common/interactions.schema.json).
- **`remove_interaction`** — removes one interaction by `id`.
- **Document reference.** The standard-level target is a composition
  document: `{ "mapPackageId": … }` or `{ "appPackageId": … }`. The
  reference implementation authors compositions through a draft lifecycle
  (optimistic-concurrency `draftId` + `generation`); that spelling is
  admitted as `x-honua-reference-shape`, consistent with how ADR-0029
  admitted the reference's `LayerRef`/`ArtifactRef` spellings.
- Both tools are advertised `readOnlyHint: false` but mutate presentation
  wiring only; neither is a `mutation`-profile tool (no source records are
  touched).
- Layout is authored through the existing document-update surface (widgets
  and layout travel with the composition body); the standard does not add a
  dedicated layout tool in this ADR.

### Reference implementation status

The reference does **not** ship the standard-named tools yet. Both members
land with `implementationStatus: "known-gap"` in `index.json` and are *not*
added to the reference manifest — honest, and informational in
`check_manifest.py`. The reference declares `["base"]` and continues to
reach FULL on `base` unchanged. When the server-side implementation lands
(tracked in honua-server), the reference manifest declares `composition`
and advertises the tools, and the `index.json` entries flip to
`implemented`.

## Consequences

- A new additive profile (`composition`) plus two `known-gap` tools plus two
  optional, additively-registered document blocks is a **MINOR**
  `SPEC_VERSION` change: no existing base-, mutation-, or
  analysis-conformant implementation becomes non-conformant
  ([GOVERNANCE.md §Semantic change classes](../../GOVERNANCE.md)).
- `check_manifest.py` needs **no code change**: profile gating is already
  generic over the `profile` field and `implementation.profiles`.
- The map-package and app-package resource schemas gain `interactions` and
  `layout` properties by `$ref` — their `additionalProperties: true`
  posture means existing documents remain valid.
- Client runtimes implement dispatch by compiling bindings onto whatever
  imperative primitives they already have; the standard constrains the
  document, not the dispatcher.
- Agent-safety implications are deliberately small: because arguments are
  static-plus-`$event.*` and actions cannot cascade, validating a document's
  interactions is ref-resolution plus a fan-out count — no cycle detection
  and no budget model. Implementations that dry-run compositions extend
  their validators with exactly those two checks.
- Future event sources or verbs (e.g. `featureHoverEnd`, `setBasemap`) join
  the closed sets through the issue → ADR → schema + fixture process, never
  by vendor hand-edit.
