# ADR-0028: Governed Feature Mutation Belongs in the Standard (Mutation Profile)

## Status

Accepted (2026-07-06) as an **optional** standard profile, but see the
**[Addendum (2026-07-06)](#addendum-2026-07-06-the-reference-implementation-does-not-implement-the-mutation-profile)**:
the reference implementation (Honua) does **not** implement the `mutation`
profile. The attempt to reconcile
[honua-server ADR-0028: AI-Driven Data Editing Is Not Allowed](https://github.com/honua-io/honua-server/blob/trunk/docs/internal/contributor/adr/0028-ai-data-editing-not-allowed.md)
by having the reference serve governed mutation was rejected by the founder the
same day; honua-server ADR-0028 stands unreconciled. The profile remains in the
standard as an optional capability for other adopters. Relates to
[geospatial-mcp#47](https://github.com/honua-io/geospatial-mcp/issues/47).

## Context

The standard's v1 workflow families deliberately excluded a fifth family,
*Edit Data*, and prose across `taxonomy.md`, `conformance.md`, `corpus.md`, and
`resources.md` cited honua-server ADR-0028 for the rule that "AI agents must not
directly mutate geospatial records."

Meanwhile the reference implementation ships a real, in-use transactional
editing tool, `honua_edit_features`
(`src/Honua.Ai/Features/Protocols/Mcp/Mcp/MapTools/EditFeaturesTool.cs`). Its
input contract was hand-vendored into the reference schema tree as
`edit_features.schema.json` — a schema that existed in **no** published standard
revision. This is precisely the divergence the standard strategy is meant to
prevent: the reference certified against a private, hand-edited fork of the
vocabulary.

Two things had to be reconciled:

1. **Is the reference tool the kind of mutation ADR-0028 forbids?** No.
   honua-server ADR-0028's concern is *autonomous, unapproved* AI mutation:
   an agent reshaping or deleting authoritative data on its own initiative,
   where the trust story depends on inspectability and non-destructive
   defaults. `honua_edit_features` is the opposite of autonomous:

   - It is a **discrete, explicit tool call** — never a side effect of analysis
     or planning. The agent (and the operator behind it) asks for the edit by name.
   - It requires an **authenticated, authorized caller** and enforces the same
     standard MCP write-authorization gate every write tool clears, then
     authorizes **each edit type independently** — insert for `adds`, update for
     `updates`, delete for `deletes` — rejecting the whole request before any
     edit is applied if a required permission is missing.
   - It routes through the shared server edit/transaction pipeline (validation,
     optimistic concurrency, telemetry); it reimplements none of it.
   - It is **all-or-nothing by default** (`rollbackOnFailure=true`): a failed
     edit rolls the whole transaction back and leaves the layer unchanged.
   - It is advertised with honest MCP annotations: a **write** tool that is
     **destructive** (deletes remove state) and **non-idempotent** (a replayed
     add inserts again).

2. **Where should such a capability live?** The standard-first doctrine says the
   vocabulary is owned here, not in a downstream vendor fork. A capability the
   reference ships and agents can call must be describable by the standard, or
   the standard is a mirror of the reference rather than its source.

## Decision

Governed feature mutation is **admitted into the standard** as a first-class,
opt-in capability, expressed through a new **conformance profile** rather than a
new mandatory tool.

### The `mutation` conformance profile

The standard defines two profiles:

- **`base`** — the read-only floor. Every tool outside the mutation profile.
  An implementation that never mutates feature records conforms to `base` and
  can still reach the **FULL** conformance level. This preserves the v1 posture:
  read-only inspection projections, never mutating server state, is a complete,
  conformant implementation.
- **`mutation`** — additive. Its sole v1 member is `edit_features`. An
  implementation conforms to `mutation` by advertising `edit_features` **and**
  honoring the authorization and transaction contract below. A manifest declares
  the profile via `implementation.profiles` (default `["base"]`); the mutation
  member is required for FULL only when the manifest declares `mutation`.

Read-only adopters are unaffected: they neither declare `mutation` nor advertise
`edit_features`, and remain FULL on `base`.

### `edit_features` contract (normative for the mutation profile)

- **Input** (`spec/schemas/tools/edit_features.schema.json`): `serviceId` +
  `layerId` identify one published editable layer; `adds` / `updates` / `deletes`
  carry the edits; geometry is RFC 7946 GeoJSON; attributes are a flat name/value
  map; `srid` defaults to 4326; `rollbackOnFailure` and `returnEditResults`
  default to `true`.
- **Per-edit-type authorization**: an implementation MUST authorize `adds`
  (insert), `updates` (update), and `deletes` (delete) independently and MUST
  reject the entire request before applying any edit if a required permission is
  missing.
- **Rollback contract**: with `rollbackOnFailure=true` (default) the edits are
  one all-or-nothing transaction — any failure rolls the whole set back and the
  layer is left unchanged. With `rollbackOnFailure=false`, successful edits
  commit independently and per-edit failures are reported.
- **Result**: per-edit results (index, success, objectId, error) plus a
  transaction summary (applied, failed, rolledBack).
- **Annotations**: advertised as a write tool that is destructive and
  non-idempotent.

### Honua-specific fields are pushed to extension surfaces

The advertised name `honua_edit_features` stays in `index.json.referenceToolName`
and the manifest's `advertisedName`, not in the schema. The concrete
`objectId` / `globalId` / `attributes` spellings track the reference pipeline and
are marked `x-honua-reference-shape`, consistent with the sibling
reference-shaped tools; a non-Honua implementation MAY carry its own object-key
spelling under the same reference-shape convention.

## Consequences

- The hand-vendored `edit_features.schema.json` in honua-server is no longer a
  private fork: it is re-vendored byte-identically from this repo like every
  other schema, and the honua-server copy of ADR-0028 is annotated to point here
  for the reconciliation.
- `taxonomy.md`, `conformance.md`, `corpus.md`, `resources.md`, `AGENTS.md`, and
  `CONFORMANCE.md` are updated: *Edit Data* is no longer an unconditional
  exclusion but the `mutation` profile, scoped to governed, authorized,
  transactional editing. Autonomous unapproved mutation remains excluded — that
  is the part of honua-server ADR-0028 the standard keeps.
- `check_manifest.py` gains profile-aware coverage: base FULL is unchanged for
  read-only adopters; declaring `mutation` makes `edit_features` load-bearing for
  FULL, and dropping it on the reference fails CI under `--strict`.
- The standard now owns a decision the reference had been making unilaterally.
  Future mutation members (e.g. schema/topology edits) are added to the profile
  through the same ADR + schema + fixture process, not by vendor hand-edit.

## Addendum (2026-07-06): the reference implementation does not implement the mutation profile

The reconciliation above proposed that the reference implementation (Honua)
declare and serve the `mutation` profile. That reconciliation was **rejected by
the Honua founder the same day**: Honua does not support AI operational data
editing — the prohibition in
[honua-server ADR-0028](https://github.com/honua-io/honua-server/blob/trunk/docs/internal/contributor/adr/0028-ai-data-editing-not-allowed.md)
stands unreconciled, and a "governed mutation profile" is not an accepted
exception to it. Accordingly:

- The reference implementation (Honua) **does NOT implement the `mutation`
  profile.** Honua removed `honua_edit_features` from its MCP surface; its
  reference manifest declares `["base"]` only, and `edit_features` is marked
  `known-gap` with a null `referenceToolName` in
  [`spec/schemas/index.json`](../../spec/schemas/index.json).
- The `mutation` **profile, its schema
  (`spec/schemas/tools/edit_features.schema.json`), and the profile-aware
  conformance machinery remain in the standard** as an **optional** capability.
  They are available to any *other* adopter that makes a different, governed
  trust decision and chooses to offer authenticated, per-edit-type authorized,
  transactional feature editing. Such an adopter declares `mutation` in its
  manifest and must advertise `edit_features` to stay FULL.
- The reference therefore serves as an example of a **base-only** FULL
  implementation. The standard is deliberately broader than its reference here:
  it *describes* a capability the reference chooses not to *serve*.

*Autonomous* AI mutation of source data was never sanctioned by any profile and
remains excluded. This addendum narrows the reference's posture further: it does
not offer even *governed* AI-facing feature mutation.
