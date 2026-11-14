# AGENTS.md

## Overview

Draft geospatial MCP specification, not a runtime implementation. Markdown under `spec/`
owns taxonomy, resources, transport, planning, corpus and conformance; `docs/features/README.md`
is the feature map. Typed deterministic execution belongs in `geospatial-grpc`; upstream
field shapes belong in `honua-server` and are referenced rather than redefined.

Static Python checks live in `conformance/` and `tools/`. Full JSON Schema checks use the
pinned `jsonschema`/`referencing` dependencies in `conformance/requirements.txt`.
CI and lint configuration live in `.github/workflows/` and `.markdownlint-cli2.yaml`.

## Setup

No build step for the spec itself — clone and read/edit the Markdown directly.
To run the conformance checks with **full** schema validation (recommended, and
what CI does), install the optional deps:

```sh
python3 -m pip install -r conformance/requirements.txt
```

Without them the checkers still run in a degraded *structural-only* mode and say
so explicitly (they no longer claim full validation occurred).

## Commands

The repo ships pure-stdlib Python checks (the same ones CI runs):

```sh
# Validate every fixture's inputs against its JSON Schema (strict requires deps):
python3 conformance/fixtures/validate.py --strict

# Score the reference manifest's tool/resource coverage against the vocabulary:
python3 conformance/check_manifest.py --strict

# Verify internal relative links AND #anchor fragments resolve:
python3 tools/check_links.py

# Find retired vocabulary outside declared exceptions (also run by test_check_manifest.py):
python3 conformance/check_vocabulary.py
```

`--strict` (or `CONFORMANCE_STRICT=1`) turns a missing validation dependency
into a hard failure instead of a silent skip. Markdown is linted by
`markdownlint-cli2` in CI (config: `.markdownlint-cli2.yaml`).

## Architecture

The standard covers four operator workflow families. A fifth, *Edit Data*, is
admitted only as the opt-in **`mutation` conformance profile** (governed,
authenticated, per-edit-type authorized, transactional `edit_features`);
*autonomous* AI mutation of geospatial records remains excluded. See
[`docs/adr/0028-governed-feature-mutation.md`](docs/adr/0028-governed-feature-mutation.md).

| Family | Status |
|---|---|
| Analyze | v1 |
| Publish Data | v1 |
| Build App | v1 |
| Automate / Deploy | deferred |
| Edit Data | mutation profile (opt-in); autonomous editing excluded |

Layer boundary the spec enforces:

- **MCP** — agent interaction and orchestration (tools, resources, prompts,
  elicitation). Read-only inspection projections in the base profile; governed mutation is opt-in as above.
- **gRPC** (`geospatial-grpc`) — typed deterministic execution.
- **Server internals** (`honua-server`) — private runtime (worker routing,
  queues, provider adapters, storage). Must not leak into MCP or gRPC surfaces.

Canonical object field shapes are owned upstream by `honua-server` and
referenced by name in these specs, not redefined here.

## Conventions & Gotchas

- **`spec/taxonomy.md` is canonical** for vocabulary, primitives, the v1
  capability matrix, and non-goals. Other docs reference its terms by name and
  must not shadow or redefine them.
- **Single-source-of-truth discipline:** each spec doc owns a distinct concern
  and explicitly defers others. Do not duplicate definitions across docs —
  cross-reference instead (e.g. resources.md references taxonomy.md's boundary
  table rather than repeating it).
- **Resource URIs use the `honua://` scheme**; the grammar is defined in
  `spec/resources.md`.
- **Upstream contracts are authoritative for field shapes.** When a field shape
  is defined in `honua-server` contract docs, reference it by name; do not
  restate it here.
- Each spec doc carries a `**Status:**`, `**Date:**`, and `**Scope:**` header
  block — preserve this convention when adding or editing docs.
- *Autonomous* Edit Data workflows are out of scope by design (honua-server
  ADR-0028). Do not add autonomous agent data-mutation capabilities. *Governed*
  transactional editing is the opt-in `mutation` profile (`edit_features`);
  extending it requires a new standard ADR under `docs/adr/`.
- **Direct geoprocessing verbs are the opt-in `analysis` profile**
  (`buffer_features`, `overlay_features`, `summarize_statistics`,
  `reproject_features`, `join_features`, `export_dataset`; ADR-0029), layered
  over the base plan/execute analysis floor. Adding a verb to the profile
  requires a new standard ADR under `docs/adr/`.
- Downstream consumer work (harnesses, fixtures, runners) is tracked in other
  runtime implementation repos, not here.

Attribution CI uses `tools/check_attribution.py`; install its commit-message hook with
`tools/hooks/install.sh`. Existing published history is unchanged.

## Release component versions

`release/component-versions.json` declares this repository's contract and schema versions
(`geospatial-mcp` tracks `SPEC_VERSION` in `spec/taxonomy.md`). The honua-release nightly resolver
reads it at the exact selected commit and refuses the component when it is missing or invalid, so
any contract or schema version bump must change this file in the same PR.

## SDK capability baseline

`release/sdk-capability-baseline.json` uses honua-release's `honua.sdk-capability-baseline/v1` schema and `docs/SDK-SERVER-BASELINE-RULE.md`; the nightly resolver reads it with the selected `release/component-versions.json` commit.
Keep `minimumServerVersion` derived from required server capability keys, with exactly one introduction entry per requirement. Change requirements in the same PR that adds or removes the dependency.

## Review guidelines

Reviews (people, Codex, Claude) judge the lines a PR adds or changes by Robert C. Martin's *Clean Code*
and cite smell codes ([rubric](https://github.com/honua-io/.github/blob/main/clean-code/RUBRIC.md)). The
`Clean code` PR check enforces what a tool can decide; `quality-exception: <reason>` in the PR body is logged.

BLOCKING:

- G5 duplication: search first; reuse or consolidate, never copy a handler, parser or validator.
- C1 history, ticket/PR refs or reviewer notes in code; C2-C4 obsolete, redundant or rambling comments;
  C5 commented-out code. Comment only what the code cannot say.
- XML doc comments (`///`) in application code; published SDKs keep at most a one-line `<summary>`
  on public members.
- N1 names that hide intent; F1 more than 3 parameters; F2 output arguments; F3 boolean flag arguments.
- Over budget with no reason in the PR: functions ~40 lines or 2 nesting levels; classes, files ~400 lines.

- Vocabulary: names, schema titles, descriptions, spec prose and skills use the Honua vocabulary in the
  [canonical glossary](https://github.com/honua-io/honua-server/blob/trunk/docs/concepts/domain/README.md)
  and the shared policy (honua-server `scripts/ci/retired-terms.v1.json`): saved Studio content is a
  Map or an App, never a "package" or a "composition", and a served dataset is a Layer. Wire literals
  the reference server serves keep their spelling until the server migrates them. The standard is unreleased, so a
  standard tool, resource family or profile is renamed outright: no deprecated aliases, alias tables or shims; the
  former name goes only into the `docs/CHANGELOG.md` rename list and the retired-term guard.
  `conformance/check_vocabulary.py` enforces this; every exception in
  `conformance/retired-terms-allowlist.json` names an exact path, rule and line with a reason.

WARNING: the rubric's other smells (N2-N7, G6-G36, T1-T9), e.g. G25 magic numbers or G12
single-implementation interfaces.

<!-- fleet:begin v3 sha256=2c5c9896ef56430ddcee7221072ff5685b96d73f4c51561e4862a1a965218242 -->
## Fleet rules (all Honua repos)

Generated from the org fleet-rules source; do not edit this block. Start with org skill `honua-system-map`.

1. Author commits as the repository owner's configured git identity. No AI attribution in commits or PR bodies.
2. Use a separate worktree per task, off the default branch, on durable disk. Include current trunk before opening a PR. No shared-checkout edits or git stash; preserve work with commits.
3. Run .NET builds and tests only through the approved remote build-host shims. Never fall back to a local build. See org skill `honua-build-host`.
4. Commit and push completed work; keep existing branches, commits and worktrees until their retention rules permit cleanup.
5. Claim work before starting, reread the issue and current lane rulings, and release the claim after completion. See org skill `honua-dev-loop`.
6. Reserve PR capacity and bundle at least three issues, a plan row, or a permitted single-work reason. Current caps and exceptions come from current lane rulings.
7. Target the default branch with the repository's PR template and conventional title. Never force-push or use an admin merge.
8. Run pre-PR checks, obtain one independent review of the final head, and resolve every review thread. Merge on green required checks; arm auto-merge where enforced checks support it. See org skill `honua-pr-flow`.
9. Read failed required-check logs and fix in one push. For red trunk, fix forward or revert within the repository's current ruling deadline; see org skills `honua-red-pr` and `honua-trunk-red`.
10. Never commit secrets, deployment identifiers, private repository names or infrastructure details. Security findings belong in the private tracker. Archived repos get no issues or PRs; public instructions name org skills only.
<!-- fleet:end -->
