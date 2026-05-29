# AGENTS.md

## Overview

`geospatial-mcp` is the **open geospatial MCP (Model Context Protocol) standard**
for analyst, map, and app-builder workflows. It defines the *agent interaction
plane* for geospatial operator workflows: the semantic operations agents use to
discover data, gather requirements, plan work, execute analysis, compose maps,
build applications, and publish results.

This is a **specification / documentation repository, not a runtime
implementation.** There is no code, no build system, and no executable tests.
The deliverables are Markdown spec documents. MCP sits *above* the execution
layer; typed deterministic execution lives in the sibling
[`geospatial-grpc`](https://github.com/honua-io/geospatial-grpc) repo, and
upstream contracts/ADRs live in
[`honua-server`](https://github.com/honua-io/honua-server).

**Status:** Draft. Covers vocabulary baseline, per-family resource contracts,
planning/handoff semantics, canonical corpus + scenario-pack taxonomy, and
conformance strategy.

## Tech Stack

- **Markdown** only. No programming language, package manager, or compiled
  artifact in this repo.
- Git for version control.
- No CI workflows, Dockerfile, Makefile, or dependency manifests present.

## Setup

No install or build step. Clone the repo and read/edit the Markdown files
directly. No toolchain or runtime dependencies are required.

## Commands

There are **no build, test, run, or lint commands** in this repository (no
`Makefile`, `package.json`, `pyproject.toml`, CI config, or scripts). Work is
purely editing Markdown.

Suggested local checks when editing (not enforced by the repo, install
separately if desired):

- Spell/style review of prose by hand.
- Verify internal relative links between `spec/*.md` and `docs/` resolve.

## Architecture

The standard covers four operator workflow families (a fifth, *Edit Data*, is
explicitly **excluded** per upstream ADR-0028 — AI agents must not directly
mutate geospatial records):

| Family | Status |
|---|---|
| Analyze | v1 |
| Publish Data | v1 |
| Build App | v1 |
| Automate / Deploy | deferred |
| Edit Data | excluded |

Layer boundary the spec enforces:

- **MCP** — agent interaction and orchestration (tools, resources, prompts,
  elicitation). Read-only inspection projections; never mutates server state.
- **gRPC** (`geospatial-grpc`) — typed deterministic execution.
- **Server internals** (`honua-server`) — private runtime (worker routing,
  queues, provider adapters, storage). Must not leak into MCP or gRPC surfaces.

Canonical object field shapes are owned upstream by `honua-server` and
referenced by name in these specs, not redefined here.

## Directory Layout

```
.
├── README.md                 # Repo intro, spec index, workflow families, related repos
├── LICENSE
├── docs/
│   └── features/
│       └── README.md         # Geospatial MCP feature map / capability families
└── spec/                     # The normative specification (single source of truth)
    ├── taxonomy.md           # Vocabulary baseline, v1 capability matrix, MCP-vs-gRPC boundary, non-goals
    ├── resources.md          # Per-family resource URIs (honua:// grammar), inspection fields, lifecycle, relationship graph
    ├── planning.md           # Clarification, elicitation, planning, and handoff semantics
    ├── corpus.md             # Canonical dataset corpus, fixture conventions, scenario-pack taxonomy
    └── conformance.md        # Conformance fixtures, evaluation rubric, pass/fail, runtime portability
```

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
- Edit Data workflows are out of scope by design (ADR-0028). Do not add agent
  data-mutation capabilities.
- Downstream consumer work (harnesses, fixtures, runners) is tracked in other
  repos (`honua-server`, `honua-devops`), not here.

## Shared dev-environment rules (multi-agent WSL)

This machine runs many agents concurrently (**Codex + Claude**, often via agentflow with multiple tabs/agents). To prevent host lockups and lost work, every agent MUST follow these:

1. **Heavy builds/tests are throttled by a shared lock.** `dotnet` and `npm` are PATH-shimmed, so their build/test/publish/pack and ci/install/test/run-build/run-test subcommands automatically run under a global semaphore (default 1 concurrent, `HONUA_BUILD_SLOTS`). For other heavy tools, call the wrapper explicitly: `with-build-lock pytest ...`, `with-build-lock cargo build`, `with-build-lock make build`. The lock is shared across ALL of this user's processes (every Codex/Claude tab, agentflow children). Do not bypass it for compiles or test suites. Long-running servers (`dotnet run`, `npm run dev`) are intentionally NOT locked — never wrap those.

2. **Commit and push when you finish a task** so your worktree can be reclaimed. An hourly job (`honua-clean`) removes a worktree ONLY when it is clean AND fully pushed (merged, remote-gone, or idle >=2d). Dirty or unpushed worktrees are NEVER touched — but uncommitted/unpushed work blocks reclamation and is at risk if the instance is reset. Build artifacts (bin/obj and untracked node_modules) are reclaimed automatically and safely.

3. **Commit hygiene — no agent attribution.** Author every commit as the repo owner only (git identity: Mike McDougall <mike@honua.io>). Do **NOT** add any agent/tool attribution to commits: no `Co-Authored-By: Claude ...`, no `Co-Authored-By: Codex ...` (or other bot co-authors), and no "Generated with Claude Code" / "Generated with Codex" / "🤖" lines in the message or PR body. Write a plain, descriptive commit message and stop.
