---
name: layer-composition
description: "Use when an agent must combine geospatial layers into a legible map or decide which layers to omit, including mixed-protocol sources, basemap pairing, draw order, labels, and safe preview."
---

# Layer Composition

Compose around one intended takeaway. A layer earns space only when it supplies
primary evidence, necessary context, or orientation that the other layers do
not provide.

## Establish the composition contract

1. State the takeaway, audience, viewing scale, and primary evidence layer.
2. Discover MCP operation schemas with `tools/list`; use `list_layers` only to
   inspect layer identity, geometry, extent, CRS, fields, and source protocol.
3. Assign every candidate one role: primary evidence, comparison, reference,
   labels, or background. Drop candidates with no distinct role.
4. Record source order, opacity, scale range, label priority, and the condition
   under which each non-primary layer disappears.

## Build the visual hierarchy

Use this bottom-to-top order unless the evidence requires a documented change:

| Role | Treatment |
|---|---|
| Background | Quiet, low-contrast context; avoid imagery or terrain that competes with thematic color. |
| Area context | Administrative or environmental fills with restrained saturation. |
| Primary polygons or rasters | Strongest ordered lightness or contrast; preserve the intended comparison. |
| Lines | Distinguish by width, dash, or casing as well as hue. |
| Points | Reserve size and saturation for the primary point evidence. |
| Labels and boundaries | Sparse, scale-gated, and ordered by importance. |

- Do not reuse the same hue and lightness range for adjacent thematic layers.
- Do not use opacity as the only way to separate stacked evidence; overlap
  changes perceived color and can invent a third pattern.
- Keep reference boundaries quieter than the evidence they frame.
- Suppress parcel outlines, minor roads, and dense labels at overview scales.
- Require text, pattern, shape, or boundary cues when color alone is ambiguous.

## Mixed sources and package paths

Keep stable source identity and CRS explicit for every binding. Use
`compose_mixed_protocol_map` when advertised source bindings span protocols.
Otherwise use `create_map_package` or `refine_map_package` only for properties
their live schemas advertise. Never silently substitute a similarly titled
layer or assume every source shares the first layer's CRS, extent, freshness,
visibility, or access policy.

Prefer server-side or package-level composition. Do not download full layers
to manufacture a local overlay when a bounded preview or configured rendering
path is available.

## Preview and removal test

Use `preview_map_package` for an isolated package. Use `render_map` only for
already configured layers; it accepts layers and an extent, not invented
palette or class-break inputs.

Inspect the full extent and representative dense, sparse, overlap, edge, and
label-collision areas. Test the target display size, grayscale, common
color-vision deficiencies, and the highest expected layer count. For each
secondary layer, compare the preview with and without it. Drop the layer when
the takeaway survives, the layer duplicates an encoding, its source cannot be
verified, or it cannot remain legible at the target scale.

## Anti-patterns

- Keeping every available layer and compensating with opacity or tiny labels.
- Pairing a saturated thematic layer with a competing imagery or terrain base.
- Stacking similarly colored fills whose overlap creates a false category.
- Drawing dense boundaries or labels at every scale.
- Treating `list_layers` as MCP tool-schema discovery.
- Assuming mixed-protocol sources share CRS, freshness, rights, or visibility.
- Sending palette or class-break properties to `render_map`.
- Mutating a hosted layer solely to obtain a composition preview.

## Completion check

Report the takeaway, role and order of every retained layer, omitted layers and
reasons, scale rules, color and non-color separation, source/CRS bindings,
preview path, inspected extents, accessibility results, and unresolved risks.
