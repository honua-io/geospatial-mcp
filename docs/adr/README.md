# Architecture Decision Records (standard-level)

This directory records **standard-level** decisions for `geospatial-mcp` — how
the vocabulary, conformance model, and profile boundaries evolve. It is distinct
from the reference implementation's contributor ADRs, which live in
[`honua-server`](https://github.com/honua-io/honua-server) under
`docs/internal/contributor/adr/` and govern how Honua *builds* the reference,
not what the *standard* requires.

Numbering aligns with the honua-server contributor ADR a decision adopts or
reconciles where one exists (so this repo's `0028` reconciles honua-server's
`ADR-0028`); standalone standard decisions continue the sequence.

Each ADR follows the same shape as the honua-server records: `Status`,
`Context`, `Decision`, `Consequences`. The process that produces them is in
[`../../GOVERNANCE.md`](../../GOVERNANCE.md) and
[`../../CONTRIBUTING.md`](../../CONTRIBUTING.md).

## Index

| ADR | Title | Status |
|---|---|---|
| [0028](0028-governed-feature-mutation.md) | Governed feature mutation belongs in the standard (mutation profile) | Accepted |
| [0029](0029-direct-geoprocessing-verbs.md) | Direct geoprocessing verbs belong in the standard (analysis profile) | Accepted |
