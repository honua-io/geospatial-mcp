# Contributing to geospatial-mcp

`geospatial-mcp` is a **specification** repository: the single source of truth
for the open geospatial MCP vocabulary, its JSON Schemas, and its conformance
model. Downstream implementations (the Honua reference and any other adopter)
vendor these artifacts byte-for-byte; they never hand-edit their vendored copy.
That makes changes here high-leverage, so the process is deliberate.

## The proposal process

Every normative change follows the same three steps. Small editorial fixes
(typos, dead links, clarifying prose that changes no contract) can skip step 1.

1. **Issue.** Open an issue describing the capability or change and the problem
   it solves. Say which workflow family and conformance profile it touches, and
   whether the reference implementation already ships something like it. For a
   new or changed tool/resource *contract*, this is where the shape is debated.

2. **ADR.** A change to the vocabulary, the conformance model, a profile
   boundary, or a non-goal is recorded as a standard-level ADR under
   [`docs/adr/`](docs/adr/) (see [GOVERNANCE.md](GOVERNANCE.md) for who decides
   and [`docs/adr/README.md`](docs/adr/README.md) for the format). The ADR
   states the decision and its consequences before any schema lands. Purely
   additive, uncontroversial fields may fold the rationale into the PR instead;
   anything that reconciles or supersedes an existing decision needs an ADR.

3. **Schema PR with conformance fixtures.** Implement the decision:
   - add or edit the JSON Schema under [`spec/schemas/`](spec/schemas/) and the
     matching entry in [`spec/schemas/index.json`](spec/schemas/index.json)
     (including its `profile`, if not `base`);
   - add at least one conformance fixture under
     [`conformance/fixtures/`](conformance/fixtures/) exercising the new shape;
   - update the reference manifest
     ([`conformance/manifests/honua.manifest.json`](conformance/manifests/honua.manifest.json))
     and the affected spec prose (`spec/*.md`, `CONFORMANCE.md`);
   - reference the issue and ADR in the PR description.

## Local checks (what CI runs)

```sh
python3 -m pip install -r conformance/requirements.txt   # one-time
python3 conformance/fixtures/validate.py --strict         # schemas + fixtures
python3 conformance/check_manifest.py --strict            # reference manifest coverage
python3 conformance/test_check_manifest.py                # checker regression tests
python3 tools/check_links.py                              # relative links + anchors
```

Markdown is linted by `markdownlint-cli2` (config `.markdownlint-cli2.yaml`).
A change is ready when all of the above pass locally; CI (`.github/workflows/`)
runs the same set.

## Extension fields (`x-`)

Vendor-specific shape lives behind `x-` keys, never in the bare contract — see
the extension-namespace policy in [GOVERNANCE.md](GOVERNANCE.md#extension-namespace-policy).
`x-honua-reference-shape` marks a field spelling that tracks the reference
implementation; a different vendor uses its own `x-<vendor>-…` namespace.

## Commit hygiene

Author commits as the repository owner. Do **not** add AI/agent attribution
(`Co-Authored-By: …`, "Generated with …", or 🤖 lines) to commit messages or PR
bodies — the `attribution` workflow and the `commit-msg` hook
(`tools/hooks/install.sh`) reject it. Use clear, conventional commit subjects.
