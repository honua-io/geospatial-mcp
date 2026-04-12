# geospatial-mcp

Open geospatial MCP standard for analyst, map, and app-builder workflows.

MCP is the **agent interaction plane** for geospatial operator workflows. It
presents semantic operations that agents use to discover data, gather
requirements, plan work, execute analysis, compose maps, build applications, and
publish results. MCP does not replace
[geospatial-grpc](https://github.com/honua-io/geospatial-grpc) or server
internals; it sits above the execution layer as the orchestration surface.

**Status:** Draft -- vocabulary baseline established, implementation tickets
pending.

## Spec

| Document | Contents |
|---|---|
| [Taxonomy, Capability Matrix, and Non-Goals](spec/taxonomy.md) | Vocabulary baseline, v1 coverage matrix, MCP vs gRPC boundary, explicit non-goals |

## Workflow Families

The standard covers four operator workflow families. A fifth (Edit Data) is
explicitly excluded per
[ADR-0028](https://github.com/honua-io/honua-server/blob/main/docs/contributor/adr/0028-ai-data-editing-not-allowed.md).

| Family | Status |
|---|---|
| Analyze | v1 |
| Publish Data | v1 |
| Build App | v1 |
| Automate / Deploy | deferred |
| Edit Data | excluded |

See `spec/taxonomy.md` for the full capability matrix and per-tool breakdown.

## Related Repositories

| Repository | Role |
|---|---|
| [geospatial-grpc](https://github.com/honua-io/geospatial-grpc) | Typed deterministic execution contracts (gRPC services) |
| [honua-server](https://github.com/honua-io/honua-server) | Upstream AI operator contract, architecture, and ADRs |
