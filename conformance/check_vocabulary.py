#!/usr/bin/env python3
"""Retired-vocabulary guard for the geospatial-mcp standard.

Scans the tracked spec, schemas, fixtures, skills and docs for names that the
Honua vocabulary retires (canonical glossary: honua-server
docs/concepts/domain/README.md; shared policy: honua-server
scripts/ci/retired-terms.v1.json). A finding names the file, line, rule and
replacement.

Wire literals the reference implementation still serves (for example
``honua://map-packages/{map_package_id}``) are not findings; their rename
follows the server migration. Deprecated aliases and historical records are
declared in ``conformance/retired-terms-allowlist.json`` with a reason; an
exception names the literal path, rule id and exact (stripped) line, so changing
the line invalidates it.

Usage:
    python3 conformance/check_vocabulary.py

Exit code 0 = clean, 1 = findings.
"""
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, ".."))
ALLOWLIST_PATH = os.path.join(HERE, "retired-terms-allowlist.json")
SCANNED_SUFFIXES = (".md", ".json", ".py", ".mjs", ".yaml", ".yml")

RETIRED_TOOL_NAMES = (
    "create_map_package", "refine_map_package", "preview_map_package",
    "create_app_package", "preview_app_package", "validate_package", "preview_package",
)

RULES = [
    ("map-envelope", r"\bMapPackages?\b", "Map"),
    ("app-envelope", r"\bAppPackages?\b", "App"),
    ("studio-package-prose", r"(?i)\b(?:map|app)[ /-]packages?\b", "Map or App"),
    ("retired-tool-name",
     r"(?<![A-Za-z0-9_])(?:" + "|".join(RETIRED_TOOL_NAMES) + r")(?![A-Za-z0-9_])",
     "the current standard name (see deprecatedAliases in spec/schemas/index.json)"),
    ("composition-document", r"(?i)\bcomposition documents?\b", "Map or App document"),
    ("composition-profile", r"(?i)\bcomposition profile\b", "interactivity profile"),
    ("hosted-layer", r"(?i)\bhosted layers?\b", "Layer"),
    ("serving-target", r"(?i)\bserving targets?\b", "Layer"),
    ("content-item", r"(?i)\bcontent items?\b", "the actual kind (Map, App, ...)"),
    ("portal-item", r"(?i)\bportal items?\b", "the actual kind (Map, App, ...)"),
    ("web-map", r"(?i)\bweb maps?\b", "Map"),
    ("vendor-type-name", r"(?i)\besri-feature-(?:service|layer)\b", "feature-service or feature-layer"),
    ("hosted-map", r"\bHostedMap\b", "Map"),
    ("api-key", r"\bHonuaApiToken\b", "API key"),
    ("graph-resource", r"\bMetadataV2Resource\b", "the actual kind; Dataset for data"),
    ("graph-publication", r"\bMetadataV2Publication\b", "Layer"),
    ("layer-membership", r"\bpublicationIds\b", "layerIds"),
    ("layer-type", r"\bpublicationType\b", "layerType"),
    ("workspace-grouping", r"(?i)\bworkspace grouping\b", "Folder"),
]
COMPILED_RULES = [(rule_id, re.compile(pattern), replacement)
                  for rule_id, pattern, replacement in RULES]

# Served wire literals (the resource URI segments), removed before matching so the
# prose around them is still checked.
WIRE_LITERALS = re.compile(r"(?:honua://)?\b(?:map|app)-packages\b")


def load_allowlist(path=ALLOWLIST_PATH):
    with open(path, "r", encoding="utf-8") as fh:
        allowlist = json.load(fh)
    for entry in allowlist.get("excludedPaths", []) + allowlist.get("exceptions", []):
        if not entry.get("reason"):
            raise ValueError(f"allowlist entry without a reason: {entry}")
        if "*" in entry["path"]:
            raise ValueError(f"allowlist paths are literal, not wildcards: {entry['path']}")
    return allowlist


def tracked_files(repo=REPO):
    listing = subprocess.run(["git", "-C", repo, "ls-files", "-z"], check=True,
                             capture_output=True).stdout.decode("utf-8")
    return [path for path in listing.split("\0") if path.endswith(SCANNED_SUFFIXES)]


def is_excluded(path, allowlist):
    return any(path == entry["path"] or path.startswith(entry["path"].rstrip("/") + "/")
               for entry in allowlist.get("excludedPaths", []))


def scan_text(path, text, allowlist):
    """Return findings for one file's text as (path, line number, rule id, replacement, line)."""
    excepted = {(entry["rule"], entry["line"])
                for entry in allowlist.get("exceptions", []) if entry["path"] == path}
    findings = []
    for number, line in enumerate(text.splitlines(), start=1):
        checked = WIRE_LITERALS.sub("", line)
        for rule_id, pattern, replacement in COMPILED_RULES:
            if (rule_id, line.strip()) not in excepted and pattern.search(checked):
                findings.append((path, number, rule_id, replacement, line.strip()))
    return findings


def scan_repo(repo=REPO, allowlist=None):
    allowlist = load_allowlist() if allowlist is None else allowlist
    findings = []
    for path in tracked_files(repo):
        if is_excluded(path, allowlist):
            continue
        full = os.path.join(repo, path)
        if not os.path.isfile(full):
            continue
        with open(full, "r", encoding="utf-8") as fh:
            findings.extend(scan_text(path, fh.read(), allowlist))
    return findings


def main():
    findings = scan_repo()
    for path, number, rule_id, replacement, line in findings:
        print(f"{path}:{number}: [{rule_id}] use {replacement}: {line[:160]}", file=sys.stderr)
    if findings:
        print(f"FAIL: {len(findings)} retired-vocabulary finding(s)", file=sys.stderr)
        return 1
    print("OK: no retired vocabulary outside declared exceptions")
    return 0


if __name__ == "__main__":
    sys.exit(main())
