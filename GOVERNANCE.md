# Governance

This document says how decisions are made for the `geospatial-mcp` standard, how
it is versioned, and how vendors extend it without forking it.

## Principle: standard-first

The specification in this repository is the **single source of truth**. Every
implementation — including the Honua reference — vendors the schemas and index
byte-for-byte from a pinned commit of this repo and is expected to prove that
byte-identity in its own CI (a sync gate). A capability is not part of the
standard because the reference ships it; it is part of the standard because it is
recorded here. When the reference and the standard disagree, the standard is
authoritative and the reference is brought back into line — never the reverse.

## How decisions are made

- **Maintainers** own the normative content (`spec/`, `spec/schemas/`,
  `CONFORMANCE.md`, the conformance checkers). They review and merge changes and
  are the deciders of record on ADRs.
- **Decisions are recorded as ADRs** under [`docs/adr/`](docs/adr/). Anything
  that adds, removes, renames, or re-scopes vocabulary; changes the conformance
  model; moves a capability between `v1` / `deferred` / `excluded` / a profile;
  or reconciles a decision made in a downstream repo, requires an ADR. The
  process that produces one is in [CONTRIBUTING.md](CONTRIBUTING.md).
- **Reference-implementation ADRs stay in honua-server.** Decisions about how
  Honua *builds* the reference live in that repo's contributor ADRs. Standard
  ADRs here reconcile them where the two meet (e.g. this repo's ADR-0028
  reconciles honua-server's ADR-0028).
- **Consensus, then maintainer call.** Proposals are discussed on the issue and
  ADR. Maintainers seek consensus; where it is not reached, the maintainers
  decide and the ADR records the rationale.

## Versioning and revision policy

The standard is versioned by a single monotonic `SPEC_VERSION` (`MAJOR.MINOR`),
defined in [`spec/taxonomy.md` §Standard Version](spec/taxonomy.md#standard-version):

- **MINOR** — backward-compatible additions: new tools, resource families,
  reason codes, optional fields, or moving a capability from `deferred` to `v1`.
  A new additive profile (like `mutation`) is a MINOR change: existing adopters
  keep conforming to the profiles they already declared.
- **MAJOR** — backward-incompatible changes: removing or renaming vocabulary,
  tightening an optional contract into a required one, or moving a published
  capability to `excluded`. Consumers must re-pin and migrate.

While `SPEC_VERSION` carries `Status: Draft`, it may change without these
guarantees. Each spec document's `Date:` header is editorial provenance, not an
independent version; consumers pin against `SPEC_VERSION`.

## Conformance profiles

Conformance is scoped by profile (see
[CONFORMANCE.md §Conformance Profiles](CONFORMANCE.md#conformance-profiles)).
`base` is the read-only floor; additive profiles (`mutation`, `analysis`,
`composition`) gate only
against implementations that declare them. A new profile is introduced by ADR,
carries at least one tool with a `profile` tag in
[`index.json`](spec/schemas/index.json), and must not make an existing
base-conformant implementation non-conformant.

## Extension namespace policy

The bare contract is vendor-neutral. Vendor- or reference-specific shape is
carried in `x-`-prefixed keys, never in the standard fields:

- `x-<vendor>-…` — a vendor's own extension fields (e.g. `x-honua-extension`
  for a capability a vendor ships ahead of standardization).
- `x-honua-reference-shape: true` — marks a field spelling in a published schema
  that tracks the Honua reference implementation where the standard intentionally
  leaves a concrete spelling upstream-owned. Other implementations MAY diverge
  in that spelling under their own reference-shape convention.

Extension keys are non-normative: a conformance checker ignores unknown `x-`
keys, and their presence never changes an implementation's level. A capability
that graduates from a vendor extension into the standard drops its
`x-<vendor>-extension` marker and gains a real `index.json` entry (and a profile,
if it is not `base`) through the ADR process — as `edit_features` did.
