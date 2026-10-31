#!/usr/bin/env python3
"""Retain reviewed immutable governance bytes; never resolve a mutable source ref."""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = "honua-io/honua-release"
PATHS = ("certification/protocol-certification-requirements.v1.json", "tools/check_protocol_certification.py")
AUTH_POLICY = "certification/sources/mcp-operation-auth-policy.v1.json"


def api(path):
    # Helper preparers and offline generators run in separate processes but
    # share gh's response cache. Cache only content-addressed Git objects;
    # repository identity, protected branch and ancestry checks remain fresh.
    cache = ["--cache", "24h"] if re.fullmatch(
        r"repos/[^/]+/[^/]+/git/(?:blobs/[a-f0-9]{40}|trees/[a-f0-9]{40}\?recursive=1)", path) else []
    result = subprocess.run(["gh", "api", path, *cache], stdin=subprocess.DEVNULL,
                            capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


def immutable_files(repository, source, paths, *, get=api):
    """Authenticate protected-trunk source and every retained immutable Git blob."""
    if not re.fullmatch(r"[0-9a-f]{40}", source or ""):
        raise ValueError("source must be an exact lowercase commit")
    repo = get(f"repos/{repository}")
    if repo.get("full_name") != repository or repo.get("default_branch") != "trunk":
        raise ValueError("governance repository identity or default branch differs")
    branch = get(f"repos/{repository}/branches/trunk")
    head = branch.get("commit", {}).get("sha")
    if branch.get("name") != "trunk" or branch.get("protected") is not True or not re.fullmatch(r"[0-9a-f]{40}", head or ""):
        raise ValueError("governance protected trunk readback failed")
    comparison = get(f"repos/{repository}/compare/{source}...{head}")
    if (comparison.get("status") not in {"ahead", "identical"}
            or comparison.get("base_commit", {}).get("sha") != source
            or comparison.get("merge_base_commit", {}).get("sha") != source):
        raise ValueError("governance source is not authenticated protected-trunk history")
    tree = get(f"repos/{repository}/git/trees/{source}?recursive=1")
    if tree.get("truncated") is not False or not isinstance(tree.get("tree"), list):
        raise ValueError("governance source tree is incomplete")
    retained = {}
    for path in paths:
        matches = [entry for entry in tree["tree"] if entry.get("path") == path]
        if len(matches) != 1 or matches[0].get("type") != "blob":
            raise ValueError("governance source file is missing or ambiguous")
        blob_sha = matches[0].get("sha")
        if not re.fullmatch(r"[0-9a-f]{40}", blob_sha or ""):
            raise ValueError("governance source blob identity is invalid")
        blob = get(f"repos/{repository}/git/blobs/{blob_sha}")
        if blob.get("sha") != blob_sha or blob.get("encoding") != "base64":
            raise ValueError("governance source blob readback differs")
        data = base64.b64decode("".join(blob.get("content", "").split()), validate=True)
        if not 0 < len(data) <= 32 * 1024 * 1024 or blob.get("size") != len(data):
            raise ValueError("governance source blob is missing or exceeds its bound")
        actual_blob = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
        if actual_blob != blob_sha:
            raise ValueError("governance source bytes differ from the immutable Git blob")
        digest = hashlib.sha256(data).hexdigest()
        retained[path] = (data, digest, blob_sha)
    return retained



def validate_auth_policy(policy, catalog):
    """Policy identity is governance input; it never substitutes for observed authority."""
    if (policy.get("schema") != "honua.mcp-operation-auth-policy/v1"
            or policy.get("revision") != "mcp-operation-auth-v1"
            or policy.get("owner_issue") != "https://github.com/honua-io/honua-release/issues/695"):
        raise ValueError("governed MCP authority policy identity differs")
    expected = {
        "anonymous-public-v1": ["anonymous-success", "fresh-anonymous-session", "no-credentials"],
        "mcp-protected-operation-v1": ["authenticated-success", "fresh-anonymous-refusal",
                                       "no-credential-forwarding", "no-authenticated-session-reuse", "caller-session-binding"],
    }
    if policy.get("required_observations") != expected:
        raise ValueError("governed MCP authority observations differ")
    decisions = {}
    for decision in policy.get("operations", []):
        operation = decision.get("operation")
        if not isinstance(operation, str) or not operation or operation in decisions:
            raise ValueError("governed MCP authority operation is missing or repeated")
        authority = decision.get("auth_policy_revision")
        if authority not in expected:
            raise ValueError("governed MCP authority decision is unknown")
        decisions[operation] = authority
    rows = [row for row in catalog.get("requirements", []) if row.get("surface") == "mcp"]
    if not rows or set(decisions) != {row.get("operation") for row in rows}:
        raise ValueError("governed MCP authority operation coverage differs")
    for row in rows:
        if (row.get("auth_policy_revision") != decisions[row["operation"]]
                or row.get("scenario_facets") != ["positive", "negative", "media-schema", "auth"]):
            raise ValueError("governed MCP authority requirement differs")


def fetch(pins, destination, *, source_sha=None, revision=None, get=api):
    if set(pins) != {"repository", "sourceSha", "requirementsRevision", "sha256"} or pins["repository"] != REPOSITORY:
        raise ValueError("governance pins must identify the canonical release repository")
    if bool(source_sha) != bool(revision):
        raise ValueError("source SHA and requirements revision overrides must be supplied together")
    source = source_sha or pins["sourceSha"]
    expected_revision = revision or pins["requirementsRevision"]
    if not isinstance(source, str) or not re.fullmatch(r"[0-9a-f]{40}", source):
        raise ValueError("governance source must be an exact lowercase commit")
    if not isinstance(expected_revision, str) or not expected_revision.strip():
        raise ValueError("governance requirements revision is required")
    if not isinstance(pins["sha256"], dict) or set(pins["sha256"]) != set(PATHS):
        raise ValueError("governance pins must bind both retained source files")
    if any(not re.fullmatch(r"[0-9a-f]{64}", value) for value in pins["sha256"].values()):
        raise ValueError("governance file pins must be SHA-256 digests")
    retained = immutable_files(REPOSITORY, source, (*PATHS, AUTH_POLICY), get=get)
    if source_sha is None and any(retained[path][1] != pins["sha256"][path] for path in PATHS):
        raise ValueError("governance source bytes differ from reviewed file pins")
    catalog = json.loads(retained[PATHS[0]][0])
    if (catalog.get("schema") != "honua.protocol-certification-requirements/v1"
            or catalog.get("receipt_schema_min") != "v2" or catalog.get("complete") is not True
            or catalog.get("revision") != expected_revision):
        raise ValueError("governance catalog is incomplete or differs from the expected revision")
    validate_auth_policy(json.loads(retained[AUTH_POLICY][0]), catalog)
    destination.mkdir(parents=True, exist_ok=True)
    for path, (data, _, _) in retained.items():
        (destination / Path(path).name).write_bytes(data)
    binding = {"repository": REPOSITORY, "sourceSha": source, "requirementsRevision": expected_revision,
               "files": {path: {"sha256": digest, "gitBlob": blob} for path, (_, digest, blob) in retained.items()}}
    (destination / "source-binding.json").write_text(json.dumps(binding, indent=2) + "\n")
    return binding


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pins", type=Path, default=ROOT / "certification/requirements-pins.json")
    parser.add_argument("--destination", type=Path, required=True)
    parser.add_argument("--source-sha")
    parser.add_argument("--requirements-revision")
    args = parser.parse_args()
    try:
        value = fetch(json.loads(args.pins.read_text()), args.destination,
                      source_sha=args.source_sha, revision=args.requirements_revision)
    except (ValueError, OSError, subprocess.CalledProcessError) as exc:
        parser.exit(1, f"governance source refused: {type(exc).__name__}\n")
    print(json.dumps(value))


if __name__ == "__main__":
    main()
