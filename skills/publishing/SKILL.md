---
name: publishing
description: "Use when an agent must decide whether a geospatial result is ready to share or promote it from private preview to a published endpoint with explicit rights, privacy, visibility, provenance, and verification gates."
---

# Publishing

Publishing changes who can rely on a result. Treat it as a governed promotion,
not as the final rendering step.

## Define the release contract

Before creating or promoting anything, record:

- intended audience, owner, destination, `targetKind`, and `visibility`;
- a stable `routePrefix` only when `targetKind` is `deployment`; omit it when
  `targetKind` is `published_service`;
- stable source and package identifiers, source revision or timestamps, query
  predicates, transformations, styles, CRS, and software revision;
- redistribution rights, attribution, privacy review, retention, accessibility,
  and freshness expectations;
- an independent verification method and the operator authorized to approve
  publication.

Missing rights, audience, visibility, stable identity, or approval is a stop
condition. A successful preview is not publication authorization.

## Private-to-public promotion

1. Discover the live operation schemas with `tools/list`.
2. Create or retain a private, immutable candidate with `create_map_package`
   only when its advertised schema can bind the intended sources and view.
3. Use `preview_map_package`; inspect the full extent, representative edge and
   no-data cases, attribution, legend, keyboard access, text alternatives,
   target dimensions, and performance.
4. Reconcile the candidate against its release contract. Record validation
   results and obtain explicit human approval for the exact destination,
  visibility, and deployment route when applicable.
5. Call `publish_result` once with the approved `sourceId`, `targetKind`, and
   `visibility`. Include `routePrefix` only for a `deployment`; omit it for a
   `published_service`. Do not retry blindly after an ambiguous timeout;
   inspect whether the target already exists first.
6. Verify the published endpoint independently: identity, accessibility,
   visibility, content revision, extent, feature or aggregate counts, style,
   attribution, and health. If verification fails, do not announce success.

## Collision, rollback, and audit rules

Check destination collisions before publication, and route collisions for a
deployment. Never overwrite an unrelated target because its title or route is
convenient. Preserve the private
candidate and previous published revision until verification and the rollback
window complete. Record who approved, what was published, when, where, from
which immutable inputs, and the verification result.

If publication is rejected or verification fails, keep the candidate private,
report the exact failed gate, and use the platform's governed rollback process.
Do not delete or mutate source data to make a release appear successful.

## Shareability checklist

A service or package is shareable only when it has stable identity, bounded and
reproducible data derivation, explicit CRS and units, useful title and summary,
legend and no-data semantics, source date, provenance, attribution, rights,
privacy review, accessible alternatives, owner and support path, target
visibility, verification evidence, and a rollback path.

## Anti-patterns

- Publishing directly from an exploratory or mutable working state.
- Treating preview success as approval or endpoint verification.
- Choosing a route before `targetKind`, or adding deployment-only
  `routePrefix` to a `published_service`.
- Publishing when rights say verify-before-redistribution.
- Omitting query predicates, transformations, source revision, or CRS from provenance.
- Blindly retrying `publish_result` after an ambiguous timeout.
- Overwriting a colliding route or unrelated target.
- Announcing success without independently reading the published endpoint.
- Deleting the previous revision before the verification window closes.

## Completion check

Report candidate identity, target kind, destination, visibility, applicable deployment route, provenance, rights,
privacy and accessibility decisions, approval identity, preview evidence,
publication response, independent verification, collision result, rollback
state, and any gate that remains blocked.
