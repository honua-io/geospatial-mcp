# Changelog

Changes to the geospatial-mcp standard: tool names, resource families,
conformance profiles and schemas. The standard is in Draft and unreleased, so
renames take effect outright, with no deprecated aliases.

## Unreleased

### Renamed

Standard names adopt the Honua vocabulary
([glossary](https://github.com/honua-io/honua-server/blob/trunk/docs/concepts/domain/README.md)):
saved Studio content is a Map or an App. The former names are no longer
accepted by `spec/schemas/index.json` or `conformance/check_manifest.py`, and
their schema files are removed.

| Former name | Current name | Kind |
|---|---|---|
| `create_map_package` | `create_map` | tool |
| `refine_map_package` | `refine_map` | tool |
| `preview_map_package` | `preview_map` | tool |
| `create_app_package` | `create_app` | tool |
| `preview_app_package` | `preview_app` | tool |
| `validate_package` | `validate_content` | tool |
| `preview_package` | `preview_content` | tool |
| `Map package` | `Map` | resource family |
| `App package` | `App` | resource family |
| `composition` | `interactivity` | conformance profile |
| `resources/map-package.schema.json` | `resources/map.schema.json` | schema |
| `resources/app-package.schema.json` | `resources/app.schema.json` | schema |

Each renamed tool's schema moves with it (for example
`tools/create_map_package.schema.json` is now `tools/create_map.schema.json`).

Reference-implementation advertised names (for example
`honua_create_map_package`), resource URIs and payload fields are wire literals
the reference server owns; they change when the server migrates them.
