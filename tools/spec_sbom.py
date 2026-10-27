#!/usr/bin/env python3
"""Write a CycloneDX SBOM for the published JSON Schema index.

The geospatial-mcp release artifact that downstream locks pin is
spec/schemas/index.json at an exact commit. It is a data artifact, so no
package-ecosystem cataloger applies (syft finds no packages in it). The honest
bill of materials is the index itself plus every schema document it maps, each
recorded with its path and the SHA-256 of its bytes at this commit. A schema
the index names that is missing from the tree is an error, never omitted.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys
import uuid

SPEC_VERSION = "1.6"


def referenced_schemas(index: object) -> set[str]:
    """Every relative *.schema.json path string the index names, at any depth."""
    found: set[str] = set()

    def walk(value: object) -> None:
        if isinstance(value, dict):
            for item in value.values():
                walk(item)
        elif isinstance(value, list):
            for item in value:
                walk(item)
        elif isinstance(value, str) and value.endswith(".json") and "://" not in value:
            found.add(value)

    walk(index)
    return found


def _file_component(root: Path, relative: str, repository: str, revision: str, repo_root: Path) -> dict:
    path = (root / relative).resolve()
    if root.resolve() not in path.parents or not path.is_file():
        raise ValueError(f"index names {relative!r}, which is not a file under {root}")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    location = path.relative_to(repo_root.resolve()).as_posix()
    return {
        "type": "file",
        "bom-ref": f"file:{location}",
        "name": location,
        "hashes": [{"alg": "SHA-256", "content": digest}],
        "externalReferences": [{"type": "distribution",
                                "url": f"https://github.com/{repository}/raw/{revision}/{location}"}],
    }


def build(index_path: Path, *, repository: str, revision: str, version: str,
          repo_root: Path = Path(".")) -> dict:
    root = index_path.parent
    index = json.loads(index_path.read_text(encoding="utf-8"))
    schemas = sorted(referenced_schemas(index))
    if not schemas:
        raise ValueError(f"{index_path} maps no schema documents")
    subject = _file_component(root, index_path.name, repository, revision, repo_root)
    components = [_file_component(root, name, repository, revision, repo_root) for name in schemas]
    return {
        "bomFormat": "CycloneDX",
        "specVersion": SPEC_VERSION,
        # Deterministic per commit: the same index bytes always yield the same BOM.
        "serialNumber": f"urn:uuid:{uuid.uuid5(uuid.NAMESPACE_URL, subject['externalReferences'][0]['url'])}",
        "version": 1,
        "metadata": {
            "tools": {"components": [{"type": "application", "name": "geospatial-mcp tools/spec_sbom.py"}]},
            "component": {**subject, "version": version},
        },
        "components": components,
        "dependencies": [{"ref": subject["bom-ref"], "dependsOn": [c["bom-ref"] for c in components]}],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--index", type=Path, default=Path("spec/schemas/index.json"))
    parser.add_argument("--repository", required=True)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        bom = build(args.index, repository=args.repository, revision=args.revision, version=args.version)
    except (OSError, ValueError) as exc:
        print(f"::error::{exc}", file=sys.stderr)
        return 1
    args.output.write_text(json.dumps(bom, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
