#!/usr/bin/env python3
"""Fetch the complete render execution/setup dependency set from protected history."""
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("protected_render_source", ROOT / "fetch-certification-requirements.py")
SOURCE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SOURCE)
PATHS = tuple("certification/installed-clients/" + name for name in (
    "mcp_render_bootstrap.py", "regression.py", "oracles.py", "mcp_plan_validation.py", "render_png.py",
    "fixture.v1.json", "mcp_render_validation.py", "mcp_render_validation.mjs",
    "mcp_map_package_validation.py", "mcp_map_package_validation.mjs", "mcp_candidate_wire.mjs",
    "mcp_fixed_client_launcher.mjs", "mcp_fixed_sdk_runner.mjs", "mcp_fixed_client_manifest.v1.json",
    "mcp_ingest_publish_validation.py", "mcp_ingest_publish_state.py", "mcp_ingest_publish_validation.mjs"))
SCHEMA = "honua.mcp-render-source/v1"


def fetch(pins, destination, *, get=SOURCE.api):
    if (not isinstance(pins, dict) or set(pins) != {"repository", "sourceSha", "sha256"}
            or pins["repository"] != SOURCE.REPOSITORY or not isinstance(pins["sha256"], dict)
            or set(pins["sha256"]) != set(PATHS)
            or any(not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value) for value in pins["sha256"].values())):
        raise ValueError("render pins must identify all canonical release dependencies")
    retained = SOURCE.immutable_files(SOURCE.REPOSITORY, pins["sourceSha"], PATHS, get=get)
    if any(retained[path][1] != pins["sha256"][path] for path in PATHS):
        raise ValueError("render source differs from reviewed file pins")
    destination.mkdir(parents=True, exist_ok=True)
    for path, (data, _, _) in retained.items():
        (destination / Path(path).name).write_bytes(data)
    binding = {"schema": SCHEMA, "repository": SOURCE.REPOSITORY, "sourceSha": pins["sourceSha"],
               "files": {path: {"sha256": digest, "gitBlob": blob} for path, (_, digest, blob) in retained.items()}}
    (destination / "source-binding.json").write_text(json.dumps(binding, indent=2) + "\n")
    return binding


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pins", type=Path, default=ROOT / "render-validation-pins.json")
    parser.add_argument("--destination", type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(fetch(json.loads(args.pins.read_text()), args.destination)))
    except (ValueError, OSError, SOURCE.subprocess.CalledProcessError) as exc:
        parser.exit(1, f"shared render source refused: {type(exc).__name__}\n")


if __name__ == "__main__":
    main()
