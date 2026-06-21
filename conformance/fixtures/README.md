# Conformance Fixture Tree

**Status:** Draft
**Date:** 2026-06-21
**Scope:** Self-check fixtures that validate against the published JSON Schemas

This is a small, runnable **self-check** fixture tree for the geospatial MCP
standard. It complements the specification-only conformance strategy in
[`spec/conformance.md`](../../spec/conformance.md) by giving implementers
concrete example tool-call inputs and resource payloads that **validate against
the published [JSON Schemas](../../spec/schemas/)**.

Per [`spec/conformance.md` §6 Non-Goals](../../spec/conformance.md#6-no-reference-harness-in-this-repository),
this repository does not ship an executable conformance *harness*. These
fixtures are not a harness: they are a static, schema-validatable corpus so an
implementer can confirm (a) the schemas load, and (b) example payloads conform,
before they wire up their own server. The runnable harness, scenario runners,
and host-specific eval code remain downstream consumer concerns.

## Layout

The layout mirrors [`spec/conformance.md` §2.1](../../spec/conformance.md#21-directory-structure):

```text
conformance/fixtures/
  tools/{tool_name}/        example tool-call input fixtures, one per case
  resources/{family}/       example resource payload fixtures, one per case
```

## Envelope

Each fixture carries the four-field envelope from
[`spec/conformance.md` §2.2](../../spec/conformance.md#22-fixture-envelope):

| Field | Role |
|---|---|
| `id` | Stable fixture identifier, unique within its primitive subdirectory |
| `inputs` | The tool arguments or resource payload, keyed by canonical field name |
| `expected` | One of the §2.3 expected-behavior shapes |
| `canonicalRefs[]` | Canonical objects bound by this fixture, by upstream name |

This self-check tree adds two convenience keys so a validator can run with no
out-of-band wiring:

- `schemaRef` — the schema (relative to `spec/schemas/`) that `inputs` validates
  against;
- `validates` — `"inputs"` (validate the `inputs` object against `schemaRef`).

These keys are a fixture-tree convenience, not new standard vocabulary.

## Validating

With [`check-jsonschema`](https://github.com/python-jsonschema/check-jsonschema)
or any draft 2020-12 validator, validate each fixture's `inputs` against its
`schemaRef`. A reference one-liner is provided in
[`validate.py`](validate.py) (pure-stdlib JSON load + structural checks;
optionally uses `jsonschema` if installed for full validation).
