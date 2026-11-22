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
import re

import yaml

ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("ops_manifest_source", ROOT / "fetch-certification-requirements.py")
SOURCE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SOURCE)
PATH = "platform-manifest.yaml"


def check_candidate(raw, source, image):
    """Reject a different selected candidate before retaining setup inputs.

    This preflight grants no evidence. The protected release declaration still
    validates the complete configuration and its deliberate skew independently.
    """
    if (not re.fullmatch(r"[a-f0-9]{40}", source or "")
            or not re.fullmatch(r"ghcr\.io/honua-io/honua-server@sha256:[a-f0-9]{64}", image or "")
            or len(raw) > 262144):
        raise ValueError("selected candidate requires exact source and immutable image")
    try:
        manifest = yaml.safe_load(raw)
    except yaml.YAMLError as error:
        raise ValueError("selected candidate manifest is malformed") from error
    components = manifest.get("components") if isinstance(manifest, dict) else None
    server = components.get("honua-server") if isinstance(components, dict) else None
    if (not isinstance(server, dict) or server.get("sha") != source
            or manifest.get("candidate") != {"ref": source, "refSource": "trunk"}
            or not isinstance(server.get("image"), str)
            or not re.fullmatch(r"ghcr\.io/honua-io/honua-server:[A-Za-z0-9_.-]+", server["image"])
            or image != "ghcr.io/honua-io/honua-server@" + str(server.get("digest"))):
        raise ValueError("protected ops manifest does not match selected candidate source/image; align requirements_ref with server_source_sha/server_image")


def fetch(governance_binding, destination, *, get=SOURCE.api, candidate_source_sha=None, candidate_image=None):
    if (not isinstance(governance_binding, dict)
            or governance_binding.get("repository") != SOURCE.REPOSITORY):
        raise ValueError("original governance source binding missing")
    source = governance_binding.get("sourceSha")
    retained = SOURCE.immutable_files(SOURCE.REPOSITORY, source, (PATH,), get=get)
    raw, digest, blob = retained[PATH]
    if candidate_source_sha is not None or candidate_image is not None:
        check_candidate(raw, candidate_source_sha, candidate_image)
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
    parser.add_argument("--candidate-source-sha")
    parser.add_argument("--candidate-image")
    args = parser.parse_args()
    try:
        print(json.dumps(fetch(json.loads(args.governance_binding.read_bytes()), args.destination,
                               candidate_source_sha=args.candidate_source_sha, candidate_image=args.candidate_image)))
    except (ValueError, OSError, SOURCE.subprocess.CalledProcessError) as error:
        message = str(error) if isinstance(error, ValueError) and str(error).startswith(("selected candidate", "protected ops manifest")) else type(error).__name__
        parser.exit(1, f"protected candidate manifest refused: {message}\n")


if __name__ == "__main__":
    main()
