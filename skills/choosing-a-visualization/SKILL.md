---
name: choosing-a-visualization
description: "Use this before symbolizing a data-bearing map layer — whenever you are about to choose a palette, color ramp, classification method, or renderer for a thematic layer, or call a map-composition tool (create_map_package, refine_map_package, apply_style_preset) or render a thematic map. It maps the variable you are mapping (nominal / ordinal / sequential / diverging / cyclic) to the right palette family and scale type, tells you when a choropleth is the wrong map, how to pick a classification method and where each one fails, and the cartographic anti-patterns that make an LLM-authored map wrong even when every tool call succeeds."
license: Apache-2.0
standard: geospatial-mcp
standard_version: "1.0"
---

# Choosing a Visualization

Encoded cartographic judgment for the moment a map layer stops being data and
becomes a picture. A correct tool call is not a correct map: `render_map` and
the map-composition tools will faithfully draw a rainbow ramp over unordered
categories, a choropleth of raw counts, or a diverging palette with no midpoint,
and each of those is wrong. This skill is the judgment that sits between "I have
a layer and an attribute" and "I call the tool."

It is written against the **geospatial-mcp** standard vocabulary, not any one
server's tool names, so it is portable to any conformant implementation.

## When to use this skill (trigger)

Use this skill when **all** of these are true:

- you are composing or refining a map of a real dataset, and
- at least one layer is symbolized **by a data attribute** (a thematic layer),
  not drawn as a single flat color, and
- you are about to decide the palette, color ramp, class breaks, classification
  method, or renderer — i.e. immediately before a
  [Map composition and styling](../../spec/taxonomy.md#tools) call
  (`create_map_package`, `refine_map_package`, `apply_style_preset`,
  `compose_mixed_protocol_map`) or a thematic `render_map`.

Do **not** reach for this skill for reference/basemap layers drawn in a single
color, for geometry-only display with no attribute driving the symbology, or for
choosing *which layers to stack* (that is layer composition, a separate concern).

## How this maps to the geospatial-mcp standard

This skill informs the inputs to the standard's map-composition surface. In
[taxonomy terms](../../spec/taxonomy.md#composition-and-styling) the decisions
below produce a `RendererSpec` (the thematic renderer: palette family, class
breaks, scale) that a `MapPackage` carries, optionally bound as a reusable
`StyleRef` through `apply_style_preset`, over a `ThemeSpec`'s token set.

| Standard object / tool | What this skill decides for it |
|---|---|
| `RendererSpec` | Palette family, scale type, classification method, class count |
| `StyleRef` (via `apply_style_preset`) | Whether a preset ramp actually fits the variable type before you bind it |
| `create_map_package` / `refine_map_package` | The symbology inputs to the composition |
| `render_map` (reference-shape) | The palette/breaks for a one-shot thematic render |

The workflow families this lands in are
[Analyze](../../spec/taxonomy.md#analyze) (map composition and styling is `v1`
for Analyze) and Build App. Nothing here mutates data — symbology is
presentation metadata authored on a published layer, consistent with the
standard's non-goals.

## Step 1 — Classify the variable

Before any color decision, name the measurement type of the attribute you are
mapping. This single choice drives everything downstream. Getting it wrong is
the most common cause of a misleading map.

| Variable type | Definition | Typical geospatial examples |
|---|---|---|
| **Nominal** | Named categories, **no** inherent order | land-use class, zoning code, soil type, owner category |
| **Ordinal** | Ordered categories, **unequal/unknown** spacing | low / medium / high risk, Likert survey, road class |
| **Sequential** | Continuous, one-directional low→high | population density, elevation, assessed value, rainfall |
| **Diverging** | Continuous with a **meaningful midpoint** or critical value | % change, temperature anomaly, profit/loss, above/below a threshold |
| **Cyclic** | Values wrap: the max is adjacent to the min | aspect/direction, hour of day, month, wind bearing |

Two questions resolve almost every case:

1. **Is there an order?** No → nominal. Yes → continue.
2. **Is there a meaningful zero/midpoint the reader should see either side of?**
   Yes → diverging. No, and it wraps around → cyclic. No, and it runs one way →
   sequential (or ordinal if the steps are discrete and unevenly spaced).

## Step 2 — Variable type to palette family and scale type

This is the core rubric. Map the variable type from Step 1 to a palette family
and a scale type.

| Variable type | Palette family | Scale type | Notes |
|---|---|---|---|
| **Nominal** | **Qualitative** (distinct hues, roughly equal lightness) | none (unordered) | Cap at ~7 legible classes; group the long tail into "Other". Never a light→dark ramp — it invents an order that isn't there. |
| **Ordinal** | **Sequential** (single- or multi-hue ramp), one swatch per class | ordered, **not** proportional | Use as many ramp steps as classes. The ramp shows order; it does **not** claim the spacing between classes is equal. |
| **Sequential** | **Sequential** single-hue (or a perceptually uniform multi-hue) | linear, log, or quantile — pick by distribution (Step 4) | Dark = high by convention. Avoid rainbow/spectral (see anti-patterns). |
| **Diverging** | **Diverging** two-hue, neutral midpoint | linear either side of the **critical value** | Anchor the midpoint at the value that matters (0, the mean, a regulatory line) — not at the data's median unless the median *is* the critical value. |
| **Cyclic** | **Cyclic** (endpoints share a hue) | linear around the wrap | A linear ramp on cyclic data puts a hard false edge where max meets min (e.g. 359° vs 1°). |

Palette-quality rules that hold across every family:

- **Colorblind-safe by default.** Prefer palettes that stay legible under
  deuteranopia/protanopia. Red↔green diverging without a lightness difference is
  the classic failure — pick a palette whose two arms also differ in lightness.
- **Perceptual uniformity for continuous data.** Equal steps in the data should
  look like equal steps in color. This is why single-hue and engineered
  multi-hue ramps beat rainbow/spectral.
- **Lightness carries magnitude.** For sequential data, order the ramp by
  lightness, not just hue, so it survives grayscale printing and low-vision
  readers.

## Step 3 — Is a choropleth even the right map?

A **choropleth** fills each area (polygon) with a color from a class. It is the
default an unguided model reaches for, and it is frequently the wrong answer.
Before choosing choropleth symbology, rule out these disqualifiers.

**A choropleth is the wrong map when:**

- **The attribute is a raw count on unequal areas.** Coloring counties by
  *number of permits* just redraws the population/area map — big or populous
  units dominate regardless of the phenomenon. **Normalize** to a rate, density,
  or ratio (permits per 1,000 people, per km²), **or** switch to graduated /
  proportional symbols or a dot-density map, which are honest ways to show
  counts.
- **The enumeration units are arbitrary for the phenomenon.** Aggregating a
  point process into whatever admin polygons happen to exist invites the
  **Modifiable Areal Unit Problem** (MAUP): the pattern changes with the
  boundaries. If the polygons don't mean anything for the variable, don't fill
  them.
- **The geometry isn't areal.** Roads, rivers, routes, and flows are lines;
  symbolize the line (width/color), don't force the value into a containing
  polygon.
- **The polygons are wildly unequal in size and the story is in the small
  ones.** Large low-value areas visually swamp small high-value areas. Consider
  proportional symbols, a cartogram, or an inset.
- **There are too few features to read**, or many polygons are sub-pixel at the
  intended zoom.

**Alternatives, and when each fits:**

| Instead of a choropleth… | Use when |
|---|---|
| Graduated / proportional symbols | Mapping **counts or totals** (population, sales) — symbol area encodes magnitude honestly regardless of polygon size |
| Dot density | Showing **count and spatial spread** together; density reads without normalization |
| Heatmap / kernel density | Dense **point** phenomena where individual points don't matter |
| Line symbology (width/color) | The feature is a **network or flow** |
| Unclassed continuous fill | A rate/ratio where you want to preserve **all** variation and reading exact class values matters less |

If, after this, you have a **normalized areal rate/ratio on meaningful units**,
a choropleth is appropriate — continue to Step 4.

## Step 4 — Choose a classification method (and know how it fails)

Classification cuts a continuous variable into classes. The method changes the
map's message, so choose deliberately — and never present the choice as neutral.

| Method | Good for | How it fails (watch for) |
|---|---|---|
| **Equal interval** | Evenly spread data; legends readers can predict (0–10, 10–20…) | **Skewed data**: nearly every feature lands in one class and the map goes flat. |
| **Quantile** | Maximizing visible contrast; ordinal ranking | Puts **near-identical values in different classes** and dissimilar values together; **hides outliers**; break values look arbitrary. Do not read quantile classes as magnitudes. |
| **Natural breaks (Jenks)** | Clustered data with natural groupings | **Data-dependent breaks** — not comparable across maps or time; legend isn't reproducible; can over-fit noise. |
| **Standard deviation** | Roughly **normal** data; showing distance from the mean (pairs with a diverging palette) | Meaningless on non-normal/skewed data; legend is in SD units, harder for lay readers. |
| **Manual / meaningful breaks** | A **domain threshold exists** (flood elevation, regulatory limit, price band) | Only as good as the chosen thresholds; document why each break sits where it does. |
| **Head/tail breaks** | **Heavy-tailed** (power-law-ish) data — many small, few huge | Unfamiliar to most readers; needs a clear legend. |
| **Unclassed (continuous)** | Preserving every value; rates/ratios | Harder to read exact values; weaker for a discrete legend or precise comparison. |

Cross-cutting classification judgment:

- **Class count: 3–7.** Fewer than 3 says almost nothing; more than ~7 exceeds
  what most readers can distinguish by color.
- **Match the method to the distribution.** Look at the histogram first.
  Skewed/heavy-tailed → log scale, quantile, or head/tail — *not* equal
  interval. Normal-ish around a meaningful center → standard deviation +
  diverging palette. A known threshold → manual breaks.
- **Comparability requires fixed breaks.** For a **time series, small multiples,
  or before/after** maps, freeze the class breaks across all frames. Jenks or
  quantile recomputed per frame shifts the breaks and makes the maps
  un-comparable — a change in color can be pure reclassification, not a change
  in the world.
- **Log scale vs. log classification.** When values span orders of magnitude,
  either transform the variable (log) before classifying, or use a
  rank/quantile method — an untransformed linear equal-interval ramp will waste
  every class on the sparse high tail.

## Anti-patterns (read this first)

The highest-signal part of this skill. Each of these produces a map that is
*technically rendered* and *substantively wrong*. If you catch yourself doing
one, stop and re-derive from Step 1.

1. **Sequential ramp on nominal data.** A light→dark ramp over land-use classes
   invents an order and a magnitude that do not exist. Nominal → qualitative
   palette, always.
2. **Choropleth of raw counts.** Filling polygons by an un-normalized count maps
   area/population, not the phenomenon. Normalize to a rate/density, or use
   proportional symbols / dot density.
3. **Diverging palette with no meaningful midpoint** — or with the midpoint set
   to the data median instead of the value that actually matters (0, a mean, a
   threshold). A diverging scheme *asserts* "either side of here matters"; only
   use it when that is true, and anchor it at the true critical value.
4. **Rainbow / spectral ramp for sequential data.** Perceptually non-uniform,
   not colorblind-safe, and it manufactures false class boundaries where hue
   changes fastest. Use a single-hue or engineered multi-hue sequential ramp.
5. **Reading quantile classes as magnitudes.** Quantile equalizes *counts*, not
   values; a quantile map can make a nearly-uniform variable look dramatic.
   Don't infer spread from a quantile legend.
6. **Too many classes or too many hues.** More than ~7 classes, or a qualitative
   palette with more than ~7–8 hues, exceeds what readers can tell apart. Bin
   the tail into "Other".
7. **Linear ramp on cyclic data.** Direction, hour, and month wrap; a linear
   ramp cuts the cycle with a false hard edge (359° looks maximally different
   from 1°). Use a cyclic palette.
8. **Data-dependent breaks across a comparison set.** Jenks/quantile recomputed
   per frame in a time series or small-multiple set breaks comparability. Freeze
   breaks across frames.
9. **Not colorblind-safe.** Red/green with equal lightness is invisible to the
   most common color-vision deficiency. Ensure the palette also varies in
   lightness, and prefer known colorblind-safe schemes.
10. **Ignoring MAUP / arbitrary units.** Aggregating into whatever polygons exist
    and treating the resulting pattern as real. If the units aren't meaningful
    for the variable, the pattern is an artifact of the boundaries.
11. **Equal-interval classification on skewed data.** One class swallows almost
    every feature and the map goes flat. Inspect the histogram; switch to
    quantile, log, or head/tail.
12. **Binding a style preset without checking variable-type fit.** A preset
    `StyleRef` applied through `apply_style_preset` carries a palette family and
    a scale; a "population" preset ramp on a nominal field is still a sequential
    ramp on nominal data (anti-pattern 1). Verify the preset's family matches
    Step 1 before you bind it.

## Worked example — Maui parcels (end-to-end judgment)

A parcel layer with the fields below shows how the rubric changes the answer
field by field. This is the intended cold-model validation substrate: given only
this skill and the MCP endpoint, an agent should reach these decisions without
further prompting.

**`land_use` — nominal** (Residential, Agricultural, Conservation, Commercial,
Industrial, …).

- Step 1: no order → nominal.
- Step 2: **qualitative** palette, no scale. Cap distinct hues at ~7; fold rare
  classes into "Other".
- Failure avoided: a sequential green ramp over land-use codes (anti-pattern 1)
  would imply Industrial > Residential in some magnitude sense. It doesn't.

**`assessed_value` — sequential, heavy-tailed** (a few very high-value parcels,
many modest ones, spanning orders of magnitude).

- Step 1: one-directional low→high, no meaningful midpoint → sequential.
- Step 2: **single-hue sequential** ramp, dark = high.
- Step 4: the histogram is right-skewed across orders of magnitude → **quantile
  or log**, not equal interval (equal interval would drop ~all parcels into the
  lowest class — anti-pattern 11). If you use quantile, label the legend as
  ranks, not dollars (anti-pattern 5).
- Choropleth check (Step 3): value is a per-parcel attribute on the parcel
  polygons themselves — it is not a count and the units are meaningful, so a
  choropleth is appropriate here.

**`parcels_per_district` — a count** (if you aggregate parcels up to districts).

- Step 3 disqualifier: **raw count on unequal-area units.** A choropleth of the
  count maps district size, not parcel intensity. **Normalize** to parcels per
  km², or use **graduated symbols** sized by count. This is the clearest
  "choropleth is the wrong answer" case in the dataset.

**`value_vs_area_median` — diverging** (each parcel's assessed value minus the
area median, if you derive it).

- Step 1: meaningful midpoint (the median line) → diverging.
- Step 2: **diverging** palette anchored at **0** (at/above vs. below median),
  colorblind-safe with a lightness difference between the two arms.
- Step 4: **standard deviation** breaks pair naturally with the diverging palette
  if the differences are roughly symmetric.

Once the decision is made, express it through the standard surface: author the
`RendererSpec` on the layer via `create_map_package` / `refine_map_package`, or
bind a matching preset with `apply_style_preset` — after confirming the preset's
palette family matches the variable type (anti-pattern 12).

## Pre-flight checklist

Before you call the map-composition tool, confirm:

- [ ] I named the variable type (nominal / ordinal / sequential / diverging /
      cyclic) — Step 1.
- [ ] The palette family matches that type; nominal is **not** on a ramp;
      cyclic is **not** on a linear ramp — Step 2.
- [ ] For a diverging palette, the midpoint is the **critical value**, not just
      the data median — Step 2.
- [ ] If it's a choropleth, the attribute is a **normalized rate/ratio on
      meaningful units**, not a raw count — Step 3.
- [ ] I looked at the distribution and picked a classification method that fits
      it; class count is 3–7 — Step 4.
- [ ] If this is one of a comparison set (time series / small multiples), the
      class breaks are **frozen** across frames — Step 4.
- [ ] The palette is colorblind-safe and carries magnitude in lightness —
      Step 2.
- [ ] If binding a preset `StyleRef`, its family matches the variable type —
      anti-pattern 12.
