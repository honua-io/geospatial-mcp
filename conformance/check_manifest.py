#!/usr/bin/env python3
"""Conformance manifest checker for the geospatial-mcp standard.

Validates a server-emitted **conformance manifest** (the static declaration of
the MCP tool/resource surface an implementation advertises) against the
published vocabulary in `spec/schemas/index.json` and the manifest schema in
`spec/schemas/conformance/manifest.schema.json`.

This is NOT a live scenario harness (those remain downstream consumer concerns
per `spec/conformance.md` §6 and §Downstream Coordination). It is a static
coverage check that answers, from the standard's own published artifacts:

  * Does every tool the implementation advertises map onto a standard tool name
    that exists in the index? (no unknown/invented standard names)
  * Does every advertised resource family map onto a standard resource family?
  * Which standard tool families does the implementation cover, and which
    standard tools (including known-gaps) does it not yet implement?

It then reports a conformance LEVEL:

  * MAPPED   — every advertised tool/resource maps onto standard vocabulary
               (no unknown standard names); this is the floor a conformant
               implementation must clear.
  * FULL     — MAPPED, and every standard tool family AND resource family
               marked `implemented` in the index is advertised by the manifest.
               Resource families marked `known-gap` (e.g. Style, Theme, Map
               template — not yet served by the reference) are reported as
               informational notes and do not reduce the level, exactly as for
               known-gap tools.

Honua's reference manifest lives at `conformance/manifests/honua.manifest.json`
and is expected to reach FULL — Honua is the reference implementation
(see /CONFORMANCE.md).

Usage:
    python3 conformance/check_manifest.py [--strict] [manifest.json ...]

With no argument it checks every manifest under `conformance/manifests/`.
Pure-stdlib; if the optional `jsonschema` package is installed it additionally
validates the manifest document against `manifest.schema.json`. Pass `--strict`
(or set CONFORMANCE_STRICT=1) to require `jsonschema` so a missing dependency is
a hard failure instead of a silently skipped schema check (install:
`pip install -r conformance/requirements.txt`).

`--strict` additionally hardens the reference implementation's gate (A5,
geospatial-mcp#41): for a manifest flagged `isReferenceImplementation`, any
coverage gap against the index's `implemented` surface (a served tool or
resource family the reference stops advertising — i.e. tool-count / served-family
drift) becomes a hard FAIL instead of a silent drop to MAPPED. Resource
`uriForm` drift from the standard already fails unconditionally, and `known-gap`
families stay informational. This makes the reference manifest un-driftable in
CI once it has been regenerated from the server surface (A4).

Exit code 0 = every checked manifest is at least MAPPED; non-zero otherwise.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, ".."))
INDEX_PATH = os.path.join(REPO, "spec", "schemas", "index.json")
MANIFEST_SCHEMA = os.path.join(REPO, "spec", "schemas", "conformance", "manifest.schema.json")
MANIFEST_DIR = os.path.join(HERE, "manifests")


def load_json(path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def maybe_schema_validate(manifest, errors, label):
    """Validate the manifest document against manifest.schema.json if jsonschema is present."""
    try:
        import jsonschema  # type: ignore
    except Exception:  # noqa: BLE001
        return False
    schema = load_json(MANIFEST_SCHEMA)
    try:
        jsonschema.Draft202012Validator(schema).validate(manifest)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"{label}: manifest failed schema validation: {exc}")
    return True


def check_manifest(path, index, strict=False):
    """Return (level, errors, warnings, stats) for one manifest.

    When ``strict`` is set and the manifest is the reference implementation,
    coverage gaps against the index's ``implemented`` surface are promoted from
    warnings to hard errors, so tool-count / served-family drift on the
    reference manifest fails CI instead of silently dropping to ``MAPPED`` (A5,
    geospatial-mcp#41). URI-template drift already errors unconditionally via
    the ``uriForm`` check below; ``known-gap`` families stay informational.
    """
    errors = []
    warnings = []
    label = os.path.relpath(path, REPO)

    manifest = load_json(path)
    schema_checked = maybe_schema_validate(manifest, errors, label)

    index_tools = {t["standardName"]: t for t in index.get("tools", [])}
    index_resources = {r["family"]: r for r in index.get("resources", [])}

    # Every advertised tool must map onto a standard name in the index.
    advertised_std_tools = set()
    for tool in manifest.get("tools", []):
        std = tool.get("standardName")
        adv = tool.get("advertisedName")
        if std not in index_tools:
            errors.append(f"{label}: tool '{adv}' maps to unknown standardName '{std}' "
                          f"(not in spec/schemas/index.json)")
            continue
        advertised_std_tools.add(std)

    # Every advertised resource family must map onto a standard family.
    advertised_families = set()
    for res in manifest.get("resources", []):
        fam = res.get("family")
        if fam not in index_resources:
            errors.append(f"{label}: resource family '{fam}' is not a standard family "
                          f"(not in spec/schemas/index.json)")
            continue
        advertised_families.add(fam)
        idx_uri = index_resources[fam].get("uriForm")
        if idx_uri and res.get("uriForm") != idx_uri:
            errors.append(f"{label}: resource family '{fam}' advertises uriForm "
                          f"'{res.get('uriForm')}' but the standard pins '{idx_uri}'")

    # Coverage of standard tools marked 'implemented' in the index, scoped to
    # the conformance profiles this manifest declares. A tool's 'profile'
    # (default 'base') assigns it to a conformance profile: 'base' tools are
    # always required for FULL; a tool in an additive profile (e.g. 'mutation')
    # is required only when the manifest declares that profile. This lets a
    # read-only implementation reach FULL on the base profile without
    # advertising governed-mutation tools (docs/adr/0028-governed-feature-mutation.md).
    def tool_profile(entry):
        return entry.get("profile", "base")

    declared_profiles = set(
        manifest.get("implementation", {}).get("profiles", ["base"])) | {"base"}

    implemented_std_tools = {n for n, t in index_tools.items()
                             if t.get("implementationStatus") == "implemented"
                             and tool_profile(t) in declared_profiles}
    undeclared_profile_tools = {n for n, t in index_tools.items()
                                if t.get("implementationStatus") == "implemented"
                                and tool_profile(t) not in declared_profiles}
    known_gap_std_tools = {n for n, t in index_tools.items()
                           if t.get("implementationStatus") == "known-gap"}
    is_reference = bool(manifest.get("implementation", {}).get("isReferenceImplementation"))
    strict_reference = strict and is_reference
    coverage_sink = errors if strict_reference else warnings
    missing_implemented = sorted(implemented_std_tools - advertised_std_tools)
    for n in missing_implemented:
        coverage_sink.append(f"{label}: standard tool '{n}' is marked 'implemented' in the index "
                             f"but is not advertised by this manifest")
    for n in sorted(undeclared_profile_tools - advertised_std_tools):
        warnings.append(f"{label}: standard tool '{n}' belongs to the "
                        f"'{tool_profile(index_tools[n])}' conformance profile, which this "
                        f"manifest does not declare (informational; not required for FULL)")
    for n in sorted(known_gap_std_tools - advertised_std_tools):
        warnings.append(f"{label}: standard tool '{n}' is a known gap (not yet implemented)")

    # Coverage of standard resource families marked 'implemented' in the index.
    # Mirrors the tool gate so the documented FULL definition (every standard
    # tool AND resource family marked implemented is advertised) is enforced.
    implemented_std_families = {f for f, r in index_resources.items()
                                if r.get("implementationStatus") == "implemented"}
    known_gap_std_families = {f for f, r in index_resources.items()
                              if r.get("implementationStatus") == "known-gap"}
    missing_implemented_families = sorted(implemented_std_families - advertised_families)
    for f in missing_implemented_families:
        coverage_sink.append(f"{label}: standard resource family '{f}' is marked 'implemented' "
                             f"in the index but is not advertised by this manifest")
    for f in sorted(known_gap_std_families - advertised_families):
        warnings.append(f"{label}: standard resource family '{f}' is a known gap "
                        f"(not yet implemented)")

    level = "FAIL"
    if not errors:
        fully_covered = not missing_implemented and not missing_implemented_families
        level = "FULL" if fully_covered else "MAPPED"

    return level, errors, warnings, {
        "schemaChecked": schema_checked,
        "tools": len(manifest.get("tools", [])),
        "resources": len(manifest.get("resources", [])),
        "coveredStandardTools": len(advertised_std_tools),
        "coveredStandardFamilies": len(advertised_families),
        "knownGaps": len(known_gap_std_tools) + len(known_gap_std_families),
        "isReference": is_reference,
        "profiles": sorted(declared_profiles),
    }


def main(argv):
    strict = "--strict" in argv or os.environ.get("CONFORMANCE_STRICT") == "1"
    argv = [a for a in argv if a != "--strict"]

    if strict:
        try:
            import jsonschema  # type: ignore # noqa: F401
        except Exception as exc:  # noqa: BLE001
            print("FAIL: --strict requires the 'jsonschema' package "
                  "(install: pip install -r conformance/requirements.txt); "
                  f"manifest schema validation did not run ({exc}).", file=sys.stderr)
            return 2

    if not os.path.exists(INDEX_PATH):
        print(f"FAIL: index not found at {INDEX_PATH}", file=sys.stderr)
        return 2
    index = load_json(INDEX_PATH)

    if argv:
        paths = [os.path.abspath(p) for p in argv]
    else:
        paths = [os.path.join(MANIFEST_DIR, n)
                 for n in sorted(os.listdir(MANIFEST_DIR))
                 if n.endswith(".json")] if os.path.isdir(MANIFEST_DIR) else []

    if not paths:
        print("FAIL: no manifests to check", file=sys.stderr)
        return 2

    rc = 0
    for path in paths:
        level, errors, warnings, stats = check_manifest(path, index, strict=strict)
        rel = os.path.relpath(path, REPO)
        mode = "schema+coverage" if stats["schemaChecked"] else "coverage (stdlib only)"
        ref = " [reference implementation]" if stats["isReference"] else ""
        profiles = "+".join(stats["profiles"])
        print(f"{rel}: {level}{ref} "
              f"({stats['coveredStandardTools']} standard tools, "
              f"{stats['resources']} resources, {stats['knownGaps']} known gaps; "
              f"profiles: {profiles}; {mode})")
        for w in warnings:
            print("  note:", w)
        for e in errors:
            print("  FAIL:", e, file=sys.stderr)
        if level == "FAIL":
            rc = 1
    return rc


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
