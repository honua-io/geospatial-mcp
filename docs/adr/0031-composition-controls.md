# ADR-0031: Composition Controls Collection

## Status

Proposed (2026-08-12). Standalone standard decision, and the direct follow-up
to [ADR-0030](0030-declarative-interactions-and-layout.md) (the reference
implementation phase is tracked in honua-server; see
[Reference implementation status](#reference-implementation-status)).

## Context

ADR-0030 admitted declarative `interactions` and `layout` blocks on the
composition documents. Its reference grammar reserves four component
spellings — `map`, `layer:{id}`, `widget:{id}`, `control:{id}` — and its closed
event set includes `change`, described there as "the event a control emits".

But **no `controls` collection exists in any composition document**. The
`MapPackage` and `AppPackage` bodies carry layers, view, and widgets only
([`resources/map-package.schema.json`](../../spec/schemas/resources/map-package.schema.json),
[`resources/app-package.schema.json`](../../spec/schemas/resources/app-package.schema.json)).
The consequence is concrete rather than theoretical: because reference
resolution is a validation-gate responsibility under ADR-0030, an
implementation MUST reject every `control:` ref as unresolvable — there is
nothing in the document for it to resolve against. Half of ADR-0030's ref
grammar and one of its five events are unreachable.

The interactions that matter most to an app builder are exactly the ones this
blocks: a filter dropdown narrowing a layer, a time slider moving the map, a
basemap switcher, an opacity slider. These are driven by *user input*, and user
input has no home in the vocabulary.

The product requirement behind this is that a natural-language agent can add
**all** standard app controls, not only layers and widgets. Left unspecified,
every adopter invents a private spelling for the most visible part of an
application's surface — the same divergence ADR-0028 corrected for
`edit_features`, ADR-0029 for direct geoprocessing verbs, and ADR-0030 for
interaction wiring.

## Decision

Composition documents gain a third standard-owned optional block —
**`controls`** — defined in
[`common/controls.schema.json`](../../spec/schemas/common/controls.schema.json)
and referenced from both the map-package and app-package resource schemas. Two
new tools — **`add_control`** and **`remove_control`** — mutate it, joining the
additive **`composition` conformance profile** ADR-0030 introduced.

### Controls are a collection, not a widget kind

Widgets and controls are both composition components, and the temptation is to
model a control as one more widget kind. The standard keeps them separate
because their direction of data flow is opposite:

- A **widget** is a data-bound *output* panel: it reads a source, renders a
  view of it, and (per ADR-0030) emits at most `selection` as a by-product of
  the user picking something in the rendered data. Its content is the data.
- A **control** is an *input affordance*: it renders no dataset, and its whole
  purpose is to emit `change` when the user operates it. Its content is a
  parameter — a value, a range, a toggle — that other components consume.

Two practical consequences follow from that split, and both would be lost by
folding controls into `widgets`:

1. **Placement.** Widgets are laid out on the `layout` grid (ADR-0030). Controls
   are chrome — docked to a map corner, a toolbar, a filter rail — and are
   deliberately *not* grid items. Keeping them in a separate collection avoids
   giving every host a rule for "which widget kinds are exempt from layout".
2. **Validation.** The event vocabulary is per source kind. With separate
   collections, "`change` comes from a control, `selection` comes from a
   widget" is a lookup in the right collection; with one merged collection it
   becomes a per-kind exception table.

A control is therefore a peer of a widget, with a deliberately identical entry
shape so agents author both the same way.

### The control model (normative)

```json
{
  "id": "year-built-filter",
  "kind": "filterSelect",
  "title": "Year built",
  "sourceId": "parcels",
  "config": { "field": "yearBuilt" }
}
```

- **Entry shape** mirrors the composition widget entry:
  `{ id, kind, title?, sourceId?, config? }`. `id` is unique within the
  document's `controls` collection; `title` is a host-rendered label;
  `sourceId` names the layer or datasource the control reads its domain from;
  `config` is per-kind, host-interpreted configuration.
- **The `kind` vocabulary is closed**: `navigation`, `scale`, `fullscreen`,
  `geolocate`, `search`, `measure`, `timeSlider`, `filterSelect`,
  `filterSlider`, `filterDateRange`, `bookmarks`, `opacity`, `attribution`,
  `basemapSwitcher`. A kind fixes the affordance's *semantics*, not its skin:
  hosts render each kind in their own idiom. Adding a kind requires a standard
  ADR, never a vendor hand-edit — the same discipline ADR-0030 applies to its
  event and verb sets.
- **`config` is data, not code.** It carries no expression language, and a
  control grants no capability the composition surface does not already have.
  The dynamic surface of a composition document remains exactly what ADR-0030
  defined: `$event.*` path substitution inside interaction arguments.
- **Controls emit `change` and nothing else.** A control that a host renders as
  interactive but that no interaction binds is inert-by-design (map chrome such
  as `navigation`, `scale`, `fullscreen`, `attribution` is typically exactly
  that, acting on the map directly through the host).

### `control:{id}` resolution (normative)

An implementation MUST resolve a `control:{id}` reference against the target
document's `controls` collection, by exact `id` match, exactly as it resolves
`layer:{id}` against layers and `widget:{id}` against widgets. A reference that
does not resolve is rejected by the ADR-0030 validation gate. This is the rule
that makes ADR-0030's reserved `control:` spelling and `change` event
operative.

Removal is the mirror obligation: removing a control that an interaction still
references would leave a dangling binding, so `remove_control` MUST either
reject the removal or remove the dependent bindings with it
(`cascadeInteractions`). Silently retaining an unresolvable binding is not
conformant.

### Exclusion: no feature-editing draw control

The vocabulary deliberately contains **no draw/edit control**. A draw control
that writes to a source dataset would put feature mutation behind an
agent-authored document, bypassing the governed, authenticated, per-edit-type
authorized `edit_features` surface that
[ADR-0028](0028-governed-feature-mutation.md) makes the *only* admitted path to
source records. Autonomous agent mutation of source data stays excluded, and no
control kind may become a side door to it.

An **annotation-only** draw control — one whose geometry lives in the
composition document or a separate annotation store and never touches a source
dataset — is a coherent future capability, but it needs its own decision on
where annotation geometry lives, how it is persisted, and how it interacts with
the mutation profile's boundary. It is therefore deferred to its own ADR rather
than smuggled in here. `measure` is admitted because it is transient and
computes on the client without persisting geometry anywhere.

### Schema placement

`controls` is defined in a **new sibling** `common/` schema
([`common/controls.schema.json`](../../spec/schemas/common/controls.schema.json))
rather than as a third block inside
[`common/interactions.schema.json`](../../spec/schemas/common/interactions.schema.json).
The two files then split along the concept boundary they actually have:
`controls.schema.json` declares *components that exist* in a document, and
`interactions.schema.json` declares *wiring between components* — including its
own `componentRef` grammar, which addresses layers and widgets defined nowhere
in that file either. Controls are usable without any interaction (map chrome is
the common case), so a document that declares controls should not have to
reference the interactions schema at all. Each file also earns its own
`index.json` `common[]` registration, which keeps the machine-readable index
honest about what the standard owns.

### Tool contract

- **`add_control`** — adds or replaces (by `id`) one control in a composition
  document. Input: a document reference plus one `control` object conforming to
  `common/controls.schema.json`.
- **`remove_control`** — removes one control by `id`, with the cascade
  obligation above.
- **Document reference.** Identical to ADR-0030's: the standard-level target is
  `{ "mapPackageId": … }` or `{ "appPackageId": … }`, and the reference
  implementation's draft-lifecycle spelling (optimistic-concurrency `draftId` +
  `generation`) is admitted as `x-honua-reference-shape`.
- Both tools are advertised `readOnlyHint: false` but mutate presentation
  wiring only; neither is a `mutation`-profile tool (no source records are
  touched).

### Reference implementation status

The reference does **not** ship the standard-named tools yet. Both land with
`implementationStatus: "known-gap"` in `index.json` and are *not* added to the
reference manifest — honest, and informational in `check_manifest.py`. The
reference declares `["base"]` and continues to reach FULL on `base` unchanged.
When the server-side implementation lands (tracked in honua-server, alongside
the ADR-0030 validator work), the reference manifest declares `composition`,
advertises the tools, and the `index.json` entries flip to `implemented`.

## Consequences

- Two `known-gap` tools in an existing additive profile plus one optional,
  additively-registered document block is a **MINOR** `SPEC_VERSION` change: no
  existing base-, mutation-, analysis-, or composition-conformant
  implementation becomes non-conformant
  ([GOVERNANCE.md §Semantic change classes](../../GOVERNANCE.md)).
- `check_manifest.py` needs **no code change**: `composition` profile gating
  already exists, and the new entries are ordinary `profile`-tagged tools.
- The map-package and app-package resource schemas gain a `controls` property
  by `$ref`; their `additionalProperties: true` posture means existing
  documents remain valid.
- ADR-0030's `control:{id}` refs and `change` event become resolvable and
  therefore usable; an implementation that shipped the ADR-0030 validator now
  has a collection to resolve against instead of a guaranteed rejection.
- Validation cost stays flat: control validation is an id-uniqueness check plus
  the same ref resolution interactions already perform. No cycle detection and
  no budget model are introduced.
- Hosts map the closed kind vocabulary onto whatever control primitives they
  already have (MapLibre `NavigationControl`, an Esri-style widget bar, a
  bespoke rail). The standard constrains the document, not the rendering.
- New control kinds (e.g. `legend`-style pickers, `print`, `swipe`) join the
  closed set through the issue → ADR → schema + fixture process. An
  annotation-only draw control follows the same route, with the ADR-0028
  boundary as its explicit subject.
