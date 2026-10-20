#!/usr/bin/env python3
"""Retain the candidate manifest from the authenticated governance revision.

This fetch grants no candidate qualification. The release-owned configuration
declaration must separately bind these bytes to the actual selected image.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("ops_manifest_source", ROOT / "fetch-certification-requirements.py")
SOURCE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SOURCE)
PATH = "platform-manifest.yaml"


def fetch(governance_binding, destination, *, get=SOURCE.api):
    if (not isinstance(governance_binding, dict)
            or governance_binding.get("repository") != SOURCE.REPOSITORY):
        raise ValueError("original governance source binding missing")
    source = governance_binding.get("sourceSha")
    retained = SOURCE.immutable_files(SOURCE.REPOSITORY, source, (PATH,), get=get)
    raw, digest, blob = retained[PATH]
    binding = {"schema": "honua.mcp-ops-events-manifest/v1", "repository": SOURCE.REPOSITORY,
               "sourceSha": source, "path": PATH, "sha256": digest, "gitBlob": blob}
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "ops-events-platform-manifest.yaml").write_bytes(raw)
    (destination / "ops-events-manifest-binding.json").write_text(json.dumps(binding, indent=2) + "\n")
    return binding


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--governance-binding", type=Path, required=True)
    parser.add_argument("--destination", type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(fetch(json.loads(args.governance_binding.read_bytes()), args.destination)))
    except (ValueError, OSError, SOURCE.subprocess.CalledProcessError) as error:
        parser.exit(1, f"protected candidate manifest refused: {type(error).__name__}\n")


if __name__ == "__main__":
    main()
