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
| `mapPackageId` | `mapId` | Map identity and App binding |
| `appPackageId` | `appId` | App identity |
| `mapPackageUri` | `mapUri` | Map reference |
| `appPackageUri` | `appUri` | App reference |
| `honua://map-packages/{map_package_id}` | `honua://maps/{mapId}` | resource URI |
| `honua://app-packages/{app_package_id}` | `honua://apps/{appId}` | resource URI |
| `composition` | `interactivity` | conformance profile |
| `resources/map-package.schema.json` | `resources/map.schema.json` | schema |
| `resources/app-package.schema.json` | `resources/app.schema.json` | schema |

Each renamed tool's schema moves with it (for example
`tools/create_map_package.schema.json` is now `tools/create_map.schema.json`).

### Control and interaction identifiers

Control and interaction identifiers must contain a non-whitespace character and
remain within 200 characters, including control source references and removal
inputs. The published schemas now enforce the same limits as the handlers.

### Service layer selector

The service-scoped layer selector is named for what it holds, a service-local
layer index, so it cannot be confused with an internal storage layer id. The
former name is rejected, including when both spellings are supplied.

| Former name | Current name | Where |
|---|---|---|
| `layerId` | `serviceLayerIndex` | `query_features`, `get_style` and `apply_style_preset` inputs; `render_map` layer references |
| `layerId` | `serviceLayerIndex` | `query_features`, `render_map`, `apply_style_preset`, `list_layers` and `resolve_entity` results |

The direct analysis verbs and `edit_features` keep `layerId` in their
`LayerRef` until the reference server migrates those wire fields; the value
is the same service-local index.

Reference-implementation advertised names (for example
`honua_create_map_package`), resource URIs and payload fields are wire literals
the reference server owns; they change when the server migrates them.
