# Adopters

This page lists implementations of the geospatial MCP standard. The bar for
listing is objective: a published **conformance manifest** that the standard's
own checker scores at **MAPPED** or higher
(`python3 conformance/check_manifest.py path/to/your.manifest.json`), against a
named pinned revision of this repo.

| Implementation | Level | Profiles | Manifest | Notes |
|---|---|---|---|---|
| **Honua** (`honua-server` `/mcp`) | FULL | base, mutation | [`conformance/manifests/honua.manifest.json`](conformance/manifests/honua.manifest.json) | Reference implementation (see [CONFORMANCE.md](CONFORMANCE.md)). Vendors these schemas byte-for-byte and enforces byte-identity in CI. |

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
