# geospatial-mcp

[![docs](https://github.com/honua-io/geospatial-mcp/actions/workflows/docs.yml/badge.svg)](https://github.com/honua-io/geospatial-mcp/actions/workflows/docs.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/honua-io/geospatial-mcp/badge)](https://scorecard.dev/viewer/?uri=github.com/honua-io/geospatial-mcp)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

An open, vendor-neutral **[MCP](https://modelcontextprotocol.io/) standard for
geospatial operator workflows**. Generic MCP gives an agent *a* tool surface;
this standard defines *which* tools and resources a geospatial server should
expose and what they mean: a shared vocabulary of tool names, JSON Schemas
(draft 2020-12) for every tool input and resource payload, resource URI and
lifecycle contracts, clarification/planning/handoff semantics, and a
machine-checkable conformance model. An agent written against this vocabulary
can discover data, plan and execute analysis, compose maps, build applications,
and publish results the same way on any conformant server.

**Status: Draft — `SPEC_VERSION 1.0`.** The vocabulary baseline, per-family
resource contracts, planning/handoff semantics, canonical corpus, and
conformance strategy are established, and the schemas are implemented by a
named reference implementation. While the status is Draft, the version may
change without compatibility guarantees (see
[versioning policy](GOVERNANCE.md#versioning-and-revision-policy)).

## Where things live

| Path | What it is |
|---|---|
| [`spec/`](spec/) | The normative specification (see [spec index](#the-specification) below) |
| [`spec/schemas/`](spec/schemas/README.md) | JSON Schemas for tool inputs and resource payloads, plus the [`index.json`](spec/schemas/index.json) vocabulary map |
| [`conformance/`](conformance/fixtures/README.md) | Static conformance checks: fixture validation, manifest scoring, the reference manifest |
| [`CONFORMANCE.md`](CONFORMANCE.md) | Conformance entry point: reference implementation, levels, profiles, how to check a manifest |
| [`ADOPTERS.md`](ADOPTERS.md) | Implementations of the standard and the objective bar for being listed |
| [`GOVERNANCE.md`](GOVERNANCE.md) | How decisions are made, versioning policy, vendor extension (`x-`) namespace rules |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | The issue → ADR → schema-PR proposal process and local checks |
| [`docs/adr/`](docs/adr/README.md) | Standard-level architecture decision records |

## Scope: workflow families and profiles

The standard covers four operator workflow families
([full capability matrix](spec/taxonomy.md)):

| Family | Status in the standard |
|---|---|
| Analyze | v1 |
| Publish Data | v1 |
| Build App | v1 |
| Automate / Deploy | deferred |
| Edit Data | opt-in `mutation` profile only |

Conformance is scoped by **profile** ([details](CONFORMANCE.md#conformance-profiles)):

- **`base`** — the read-only floor, including the full plan/validate/execute
  analysis surface. The default.
- **`analysis`** — additive: six direct geoprocessing verbs (`buffer_features`,
  `overlay_features`, `summarize_statistics`, `reproject_features`,
  `join_features`, `export_dataset`) layered over the plan/execute floor
  ([ADR-0029](docs/adr/0029-direct-geoprocessing-verbs.md)).
- **`mutation`** — additive: governed, authenticated, per-edit-type authorized,
  transactional `edit_features`
  ([ADR-0028](docs/adr/0028-governed-feature-mutation.md)). *Autonomous* agent
  editing of geospatial records is excluded by design and never sanctioned by
  any profile.

**`v1` means "specified in the v1 standard", not "shipped by the reference
implementation".** The authoritative per-tool and per-resource status is the
`implementationStatus` field in [`spec/schemas/index.json`](spec/schemas/index.json),
surfaced by the manifest checker.

MCP is the **agent interaction plane**: semantic, orchestration-level
operations. It sits above — and does not replace — typed deterministic
execution contracts, which live in the sibling
[geospatial-grpc](https://github.com/honua-io/geospatial-grpc) standard. The
boundary is normative ([taxonomy](spec/taxonomy.md)).

## The specification

| Document | Contents |
|---|---|
| [Taxonomy, Capability Matrix, and Non-Goals](spec/taxonomy.md) | Vocabulary baseline, `SPEC_VERSION`, v1 coverage matrix, MCP vs gRPC boundary, explicit non-goals |
| [MCP Resource Contracts](spec/resources.md) | Per-family resource URIs, inspection fields, lifecycle visibility, relationship graph for results, maps, apps, styles, themes, templates, and promotion surfaces |
| [Clarification, Elicitation, Planning, and Handoff Semantics](spec/planning.md) | Clarification and elicitation semantics, assumption policies, per-family planning step kinds, boundary-crossing handoff contract |
| [Canonical Dataset Corpus and Scenario Packs](spec/corpus.md) | Corpus layout, fixture descriptor conventions, canonical and dirty-data packs, scenario-pack taxonomy |
| [JSON Schemas](spec/schemas/README.md) | Machine-readable JSON Schema bindings for each tool `inputSchema` and resource payload, plus the `index.json` vocabulary map |
| [Conformance Fixtures and Evaluation](spec/conformance.md) | Fixture layout, operator-workflow scenario model, pass/fail rubric, runtime portability guidance |

## Implementing the standard

Implementations vendor the schemas and `index.json` byte-for-byte from a pinned
commit of this repo ([standard-first principle](GOVERNANCE.md#principle-standard-first)),
advertise the standard tool and resource vocabulary from their MCP
`tools/list` / `resources/templates/list` surface (vendor-prefixed advertised
names are fine — they map to bare standard names in the manifest), and declare
the profiles they claim.

Two static checks make the standard verifiable from its published artifacts
alone — no live server, no API tokens, no vendor software:

```sh
git clone https://github.com/honua-io/geospatial-mcp.git
cd geospatial-mcp
python3 -m pip install -r conformance/requirements.txt

# Self-check: example tool inputs and resource payloads conform to the schemas
python3 conformance/fixtures/validate.py --strict

# Score a manifest's tool/resource coverage against the vocabulary
python3 conformance/check_manifest.py --strict            # bundled reference manifest
python3 conformance/check_manifest.py path/to/your.manifest.json
```

The checkers are pure-stdlib Python 3; the pinned deps enable full JSON Schema
validation (`--strict` makes a missing dep a hard failure instead of a
structural-only pass). CI ([`.github/workflows/docs.yml`](.github/workflows/docs.yml))
runs the same commands plus markdownlint and a relative-link/anchor check
([`tools/check_links.py`](tools/check_links.py)).

The manifest checker reports a **conformance level**
([definitions](CONFORMANCE.md#conformance-levels)): **MAPPED** (every
advertised tool/resource maps onto standard vocabulary — the floor), **FULL**
(MAPPED, plus every `implemented` tool and resource family in the declared
profiles is advertised), or **FAIL**. The manifest check is necessary, not
sufficient: live operator-workflow behavior is scored downstream against the
rubric in [`spec/conformance.md`](spec/conformance.md).

## Reference implementation and adopters

[Honua (`honua-server`)](https://github.com/honua-io/honua-server) is the named
reference implementation: its `/mcp` surface is captured as the bundled
manifest at
[`conformance/manifests/honua.manifest.json`](conformance/manifests/honua.manifest.json),
scored **FULL** on the `base` profile in CI. The standard is authoritative over
the reference, never the reverse.

The standard is an open invitation, not a single-vendor interface. If you build
an MCP surface for geospatial workflows, [ADOPTERS.md](ADOPTERS.md) is the
on-ramp: emit a manifest, score it MAPPED or better, and open a PR adding your
row.

## Related repositories

| Repository | Role |
|---|---|
| [geospatial-grpc](https://github.com/honua-io/geospatial-grpc) | Sibling open standard: typed deterministic execution contracts (gRPC) below the MCP plane |
| [honua-server](https://github.com/honua-io/honua-server) | Reference implementation; upstream AI operator contract and ADRs |
| [honua-sdk-js](https://github.com/honua-io/honua-sdk-js) | JavaScript/TypeScript SDKs, including an MCP server for the reference implementation |
| [geobench](https://github.com/honua-io/geobench) | Open, vendor-neutral benchmark suite for geospatial servers |

## Contributing, security, license

- **Contributing:** normative changes follow an issue → ADR → schema-PR process
  with conformance fixtures — see [CONTRIBUTING.md](CONTRIBUTING.md) and
  [GOVERNANCE.md](GOVERNANCE.md).
- **Security:** report vulnerabilities to <security@honua.io> (see the
  [org security policy](https://github.com/honua-io/.github/blob/main/SECURITY.md)).
- **License:** [Apache-2.0](LICENSE).
