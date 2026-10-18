#!/usr/bin/env python3
"""Fetch server-owned controls at the exact authenticated candidate source."""
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
import subprocess

SPEC = importlib.util.spec_from_file_location("immutable_source", Path(__file__).with_name("fetch-certification-requirements.py"))
SOURCE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SOURCE)
REPOSITORY = "honua-io/honua-server"
PREFIX = "tests/mcp-certification/"
PATHS = tuple(PREFIX + path for path in (
    "request-cancellation.mjs", "postgres-cancellation-observer.mjs",
    "test/cancellation-fixture.mjs", "test/postgres-observer.test.mjs",
    "test/request-cancellation-wire.test.mjs", "test/postgres-observer.integration.mjs",
    "inspector-pagination.mjs", "inspector-pagination.test.mjs",
))


def fetch(source_sha, destination, *, get=SOURCE.api):
    if destination.exists() and any(destination.iterdir()):
        raise ValueError("server harness destination must be empty; cached fallback is forbidden")
    retained = SOURCE.immutable_files(REPOSITORY, source_sha, PATHS, get=get)
    binding = {"schema": "honua.candidate-server-harness-binding/v1", "repository": REPOSITORY,
               "sourceSha": source_sha, "files": {path: {"sha256": digest, "gitBlob": blob}
                   for path, (_, digest, blob) in retained.items()}}
    destination.mkdir(parents=True, exist_ok=True)
    for path, (data, _, _) in retained.items():
        target = destination / path.removeprefix(PREFIX)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    (destination / "source-binding.json").write_text(json.dumps(binding, indent=2) + "\n")
    return binding


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--destination", type=Path, required=True)
    args = parser.parse_args()
    try:
        binding = fetch(args.source_sha, args.destination)
    except (ValueError, OSError, subprocess.CalledProcessError) as exc:
        parser.exit(1, f"candidate server harness refused: {type(exc).__name__}\n")
    print(json.dumps(binding))


if __name__ == "__main__":
    main()
