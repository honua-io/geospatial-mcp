# Adopters

This page lists implementations of the geospatial MCP standard. The bar for
listing is objective: a published **conformance manifest** that the standard's
own checker scores at **MAPPED** or higher
(`python3 conformance/check_manifest.py path/to/your.manifest.json`), against a
named pinned revision of this repo.

| Implementation | Level | Profiles | Manifest | Notes |
|---|---|---|---|---|
| **Honua** (`honua-server` `/mcp`) | FULL | base | [`conformance/manifests/honua.manifest.json`](conformance/manifests/honua.manifest.json) | Reference implementation (see [CONFORMANCE.md](CONFORMANCE.md)). Vendors these schemas byte-for-byte and enforces byte-identity in CI. Declares `base` only: it does not implement the optional `mutation` profile — Honua does not support AI operational data editing (honua-server ADR-0028). |

## Reference skills corpus

The Apache-2.0 [`skills` corpus](skills/catalog.json) is the reference
client-side judgment layer for this standard. It uses bare taxonomy operation
names so any conformant implementation can adopt it. The catalog's
[`live-surface` contract](skills/contracts/live-surface.json) identifies every
tool-shape assumption made by a skill; adopters should evaluate those
assertions against their live advertised schemas, not only vendored docs.

Honua is the first implementation targeted by that downstream live-schema
check. The preserved Maui parcel cold evaluation demonstrates material lift for
the initial choosing-a-visualization skill; its scenario, pinned identities,
raw responses, rubric, judge result, and stricter review adjudication live under
[`skills/evals/choosing-a-visualization-maui-parcels`](skills/evals/choosing-a-visualization-maui-parcels/run-003/scenario.json).
The three follow-on skills also preserve independent per-skill lift gates and
audited evidence under
[`skills/evals/follow-on-skills`](skills/evals/follow-on-skills/run-001/scenario.json);
aggregate improvement cannot hide a skill that fails its own gate.

## An open invitation

The geospatial MCP standard is not a Honua-only interface. If you build an MCP
surface for geospatial operator workflows, you are invited to implement this
vocabulary and list yourself here. The conformance suite in this repository is
the bar and the on-ramp — it needs no live server, no API tokens, and no Honua
software:

1. Emit a manifest from your `tools/list` and `resources/templates/list`
   advertisement, conforming to
   [`spec/schemas/conformance/manifest.schema.json`](spec/schemas/conformance/manifest.schema.json).
   Declare the profiles you support (`base`, and `mutation` if you offer
   governed editing).
2. Validate your tool inputs against the published
   [JSON Schemas](spec/schemas/) with
   [`conformance/fixtures/validate.py`](conformance/fixtures/validate.py).
3. Score your manifest with
   [`conformance/check_manifest.py`](conformance/check_manifest.py). Reaching
   **MAPPED** means you invent no vocabulary; **FULL** means you cover every
   standard tool and resource family the index marks `implemented` for the
   profiles you declare.

Open a PR adding your row (and, if you like, your manifest under
`conformance/manifests/`). Reaching FULL here readies you for the downstream
scenario rubric in [`spec/conformance.md`](spec/conformance.md); it does not by
itself certify live-behavior conformance, which a scenario harness scores
separately.
