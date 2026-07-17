# Agent Skills Corpus

Encoded cartographic and geospatial judgment for agents that drive a
**geospatial-mcp**-conformant server. The MCP surface tells an agent *what tools
exist and how to call them*. This corpus tells it *what a good result looks
like* — the judgment that a correctly-formed tool call still doesn't supply.

Skills here are **client-side context** (the same shape popularized by
"agent skills"): each is a self-contained Markdown file an agent loads when a
trigger condition matches, then follows to make a better decision. They add no
tools and change no server behavior; they make the tools the server already
exposes usable by a model that doesn't know cartography.

## Why this lives in the standard repo

These skills are written against the **geospatial-mcp standard vocabulary**
(tool families, canonical objects, workflow families defined in
[`spec/taxonomy.md`](../spec/taxonomy.md)) — **not** against any single server's
tool names. That makes them portable to **any** conformant implementation: a
third party who adopts the standard inherits the judgment for free, and their
contributions strengthen the shared corpus rather than forking a vendor's.

The corpus is licensed under the repository's [Apache-2.0 license](../LICENSE),
so it is permissively reusable.

## How a skill is structured

Every skill states its **trigger condition** ("use this when…") as well as its
content — the prescriptive shape that gives measurable lift. Each `SKILL.md`
carries YAML frontmatter (`name`, `description` with the trigger, `license`,
`standard`, `standard_version`) and a body that:

1. states precisely when to use it (and when **not** to),
2. maps its decisions onto the geospatial-mcp standard objects and tools it
   feeds, and
3. ends with an explicit **anti-patterns** section — the highest-signal part,
   because it names the wrong outputs a tool call will otherwise produce
   without complaint.

## Skills

| Skill | Trigger | Standard surface it informs |
|---|---|---|
| [choosing-a-visualization](choosing-a-visualization/SKILL.md) | About to choose a palette / color ramp / classification / renderer for a thematic layer, or call a map-composition tool | [Map composition and styling](../spec/taxonomy.md#tools) — `RendererSpec`, `StyleRef`, `create_map_package`, `refine_map_package`, `apply_style_preset`, `render_map`; [Analyze](../spec/taxonomy.md#analyze) and Build App families |

## Status — first slice

This is deliberately **one skill**, not a full corpus. "Choosing a
visualization" ships first because it is where an unguided model most reliably
produces something that renders cleanly and still misleads — a rainbow ramp on
categories, a choropleth of raw counts, a diverging palette with no midpoint.
It is proven against real parcel data before the corpus expands: a corpus that
isn't validated is documentation, and documentation is not a moat.

Deferred to follow-on slices, once this one demonstrably changes output quality
(each maps to a family in [`spec/taxonomy.md`](../spec/taxonomy.md) and to the
scenario packs in [`spec/corpus.md`](../spec/corpus.md#83-pack-catalog)):

- **Layer composition** — basemap pairing, hue separability across stacked
  layers, label collision, when to drop a layer instead of restyling it.
- **Query shaping** — pushing predicates to the provider, bbox/CRS hygiene,
  when to sample vs. aggregate, the cost cliffs.
- **Publishing** — what a service/package needs before it is shareable; the
  dev→prod promotion path.

Tracking issue:
[honua-server#2858](https://github.com/honua-io/honua-server/issues/2858).
