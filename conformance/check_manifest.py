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
  * FULL     — MAPPED, and every standard tool/resource family marked
               `implemented` in the index is advertised by the manifest.

Honua's reference manifest lives at `conformance/manifests/honua.manifest.json`
and is expected to reach FULL — Honua is the reference implementation
(see /CONFORMANCE.md).

Usage:
    python3 conformance/check_manifest.py [manifest.json ...]

With no argument it checks every manifest under `conformance/manifests/`.
Pure-stdlib; if the optional `jsonschema` package is installed it additionally
validates the manifest document against `manifest.schema.json`.

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


def check_manifest(path, index):
    """Return (level, errors, warnings) for one manifest."""
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

    # Coverage of standard tools marked 'implemented' in the index.
    implemented_std_tools = {n for n, t in index_tools.items()
                             if t.get("implementationStatus") == "implemented"}
    known_gap_std_tools = {n for n, t in index_tools.items()
                           if t.get("implementationStatus") == "known-gap"}
    missing_implemented = sorted(implemented_std_tools - advertised_std_tools)
    for n in missing_implemented:
        warnings.append(f"{label}: standard tool '{n}' is marked 'implemented' in the index "
                        f"but is not advertised by this manifest")
    for n in sorted(known_gap_std_tools - advertised_std_tools):
        warnings.append(f"{label}: standard tool '{n}' is a known gap (not yet implemented)")

    level = "FAIL"
    if not errors:
        level = "FULL" if not missing_implemented else "MAPPED"

    return level, errors, warnings, {
        "schemaChecked": schema_checked,
        "tools": len(manifest.get("tools", [])),
        "resources": len(manifest.get("resources", [])),
        "coveredStandardTools": len(advertised_std_tools),
        "knownGaps": len(known_gap_std_tools),
        "isReference": bool(manifest.get("implementation", {}).get("isReferenceImplementation")),
    }


def main(argv):
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
        level, errors, warnings, stats = check_manifest(path, index)
        rel = os.path.relpath(path, REPO)
        mode = "schema+coverage" if stats["schemaChecked"] else "coverage (stdlib only)"
        ref = " [reference implementation]" if stats["isReference"] else ""
        print(f"{rel}: {level}{ref} "
              f"({stats['coveredStandardTools']} standard tools, "
              f"{stats['resources']} resources, {stats['knownGaps']} known gaps; {mode})")
        for w in warnings:
            print("  note:", w)
        for e in errors:
            print("  FAIL:", e, file=sys.stderr)
        if level == "FAIL":
            rc = 1
    return rc


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
