#!/usr/bin/env python3
"""Fetch the shared authored scenario only from reviewed protected release history."""
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("protected_release_source", ROOT / "fetch-certification-requirements.py")
SOURCE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SOURCE)
PATHS = ("certification/installed-clients/mcp_plan_validation.py", "certification/installed-clients/fixture.v1.json")
SCHEMA = "honua.mcp-plan-validation-source/v1"


def fetch(pins, destination, *, get=SOURCE.api):
    if (set(pins) != {"repository", "sourceSha", "sha256"} or pins["repository"] != SOURCE.REPOSITORY
            or not isinstance(pins["sha256"], dict) or set(pins["sha256"]) != set(PATHS)
            or any(not re.fullmatch(r"[0-9a-f]{64}", value or "") for value in pins["sha256"].values())):
        raise ValueError("shared scenario pins must identify both canonical release files")
    retained = SOURCE.immutable_files(SOURCE.REPOSITORY, pins["sourceSha"], PATHS, get=get)
    if any(retained[path][1] != pins["sha256"][path] for path in PATHS):
        raise ValueError("shared scenario source differs from reviewed file pins")
    destination.mkdir(parents=True, exist_ok=True)
    for path, (data, _, _) in retained.items():
        (destination / Path(path).name).write_bytes(data)
    binding = {"schema": SCHEMA, "repository": SOURCE.REPOSITORY, "sourceSha": pins["sourceSha"],
               "files": {path: {"sha256": digest, "gitBlob": blob} for path, (_, digest, blob) in retained.items()}}
    (destination / "source-binding.json").write_text(json.dumps(binding, indent=2) + "\n")
    return binding


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pins", type=Path, default=ROOT / "plan-validation-pins.json")
    parser.add_argument("--destination", type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(fetch(json.loads(args.pins.read_text()), args.destination)))
    except (ValueError, OSError, SOURCE.subprocess.CalledProcessError) as exc:
        parser.exit(1, f"shared plan source refused: {type(exc).__name__}\n")


if __name__ == "__main__":
    main()
