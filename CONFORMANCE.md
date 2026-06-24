# Conformance and the Reference Implementation

**Status:** Draft
**Date:** 2026-06-23
**Scope:** How an implementation demonstrates conformance to the geospatial-mcp
standard, and which implementation is the reference.

This document is the entry point for conformance. The normative conformance
*strategy* — fixture layout, operator-workflow scenario model, pass/fail
rubric, and runtime-portability guidance — lives in
[`spec/conformance.md`](spec/conformance.md). This document adds the two pieces
that make the standard checkable from its own published artifacts today:

1. a **machine-readable conformance check** an implementer can run against the
   published [JSON Schemas](spec/schemas/README.md) and the vocabulary
   [`index.json`](spec/schemas/index.json), and
2. the named **reference implementation** that the standard tracks.

## Reference Implementation

[**Honua** (`honua-server`)](https://github.com/honua-io/honua-server) is the
reference implementation of the geospatial-mcp standard. Honua's `/mcp` surface
advertises the standard tool and resource vocabulary, and where the prose
intentionally leaves a concrete field spelling upstream-owned (`MapPackage`,
`AppPackage`, `PublishedService`, `Deployment`), the published schemas adopt the
shape Honua emits and annotate it `x-honua-reference-shape` (see
[`spec/schemas/README.md`](spec/schemas/README.md)).

The reference surface is captured as a **conformance manifest** at
[`conformance/manifests/honua.manifest.json`](conformance/manifests/honua.manifest.json):
a static declaration of the tools and resource families Honua advertises, with
each advertised tool mapped to its bare standard name. Honua's manifest is
expected to reach conformance level **FULL** (below). Honua-side server tests
that pin this roster live in `honua-server` (`McpTaxonomyAlignmentTests`) per the
[Downstream Coordination](spec/conformance.md#downstream-coordination) table.

## What This Repository Checks (and What It Does Not)

This repository is specification-only for *live behavior*: a runnable scenario
harness, host-specific eval runners, and the operator-workflow scenario tree are
**downstream consumer concerns** per
[`spec/conformance.md` §6](spec/conformance.md#6-no-reference-harness-in-this-repository)
and the [Downstream Coordination](spec/conformance.md#downstream-coordination)
table.

What it *does* ship are two static, from-the-artifacts checks any implementer
can run with no live server:

| Check | Validates | Runner |
|---|---|---|
| **Schema self-check** | Example tool-call inputs and resource payloads conform to the published JSON Schemas | [`conformance/fixtures/validate.py`](conformance/fixtures/validate.py) |
| **Manifest conformance** | A server's advertised tool/resource surface maps onto — and covers — the standard vocabulary | [`conformance/check_manifest.py`](conformance/check_manifest.py) |

Neither check runs a server or scores operator-workflow behavior; both validate
*declared shape and vocabulary coverage* against the standard's own published
artifacts.

## Conformance Levels

The manifest checker reports a level per implementation manifest:

| Level | Meaning |
|---|---|
| **MAPPED** | Every tool and resource family the implementation advertises maps onto standard vocabulary (a `standardName` in [`index.json`](spec/schemas/index.json)) and uses the standard `honua://` URI form. No invented standard names. This is the floor a conformant implementation must clear. |
| **FULL** | MAPPED, and the implementation advertises every standard tool and resource family the index marks `implemented`. |
| **FAIL** | An advertised tool or resource maps to vocabulary the standard does not define, or a resource uses a non-standard URI form. |

Standard tools the index marks `known-gap` (a standard family with no discrete
reference tool yet — e.g. the map/app composition and publish families) are
reported as informational notes and **do not** reduce an implementation's level:
they describe the standard's own roadmap, not a defect in the implementation.

## Producing and Checking a Manifest

A conformant server produces its manifest from its `tools/list` and
`resources/templates/list` capability advertisement, conforming to
[`spec/schemas/conformance/manifest.schema.json`](spec/schemas/conformance/manifest.schema.json).
Each advertised tool maps to its bare standard name; vendor-prefixed advertised
names (e.g. `honua_plan_analysis`) are expected and carried alongside the
standard name.

Check it:

```sh
# Check the bundled reference manifest (Honua):
python3 conformance/check_manifest.py

# Check your own implementation's manifest:
python3 conformance/check_manifest.py path/to/your.manifest.json
```

The checker is pure-stdlib; if the optional `jsonschema` package is installed it
additionally validates the manifest document against the manifest schema.
Exit code `0` means every checked manifest is at least **MAPPED**.

## Relationship to the Scenario Rubric

The manifest check is a **necessary, not sufficient** condition for conformance.
It proves an implementation's advertised vocabulary aligns with the standard;
it does not score clarification quality, plan validity, handoff correctness,
result projection, error envelopes, or non-goal containment. Those seven axes
are scored by a downstream scenario harness against the rubric in
[`spec/conformance.md` §4](spec/conformance.md#4-passfail-rubric). An
implementation that reaches **FULL** here is ready to be scored against that
rubric; reaching **FULL** does not by itself certify rubric conformance.
