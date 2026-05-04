# Geospatial MCP Feature Map

This repository defines the agent interaction plane for geospatial workflows. It is a spec repository, not a runtime implementation.

## Specified Capability Families

- Analyze workflows for dataset discovery, inspection, analysis planning, result review, and artifact handoff.
- Publish Data workflows for dataset intake, validation, transform planning, publication handoff, and result inspection.
- Build App workflows for requirements gathering, app planning, map/app package composition, and deployment handoff.
- Deferred Automate / Deploy workflows for operator automation beyond v1.
- Explicitly excluded Edit Data workflows, matching the upstream Honua ADR stance that AI agents should not directly mutate geospatial records.

## Source Evidence

- Vocabulary and capability matrix: `spec/taxonomy.md`
- Resource URI and lifecycle contracts: `spec/resources.md`
- Clarification, elicitation, planning, and handoff semantics: `spec/planning.md`
- Canonical corpus and scenario-pack taxonomy: `spec/corpus.md`
- Conformance fixtures and evaluation rubric: `spec/conformance.md`

## Boundary

MCP should stay semantic and agent-facing. Typed execution contracts remain in `geospatial-grpc`; server and operator implementations bind these MCP resources to concrete APIs.
