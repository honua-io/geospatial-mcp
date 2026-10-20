#!/usr/bin/env python3
"""Fetch the complete deployment-workspace execution/setup dependency set from protected history."""
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("protected_deployment-workspace_source", ROOT / "fetch-certification-requirements.py")
SOURCE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SOURCE)
PATHS = ('certification/installed-clients/mcp_deployment_workspace_cohort.mjs', 'certification/installed-clients/mcp_deployment_workspace_validation.py', 'certification/installed-clients/mcp_deployment_workspace_store_oracle.py', 'certification/installed-clients/mcp_deployment_workspace_state.py', 'certification/installed-clients/mcp_deployment_workspace_prerequisites.py', 'certification/installed-clients/mcp_execute_plan_state.py', 'certification/installed-clients/mcp_execute_plan_validation.py', 'certification/installed-clients/mcp_plan_validation.py', 'certification/installed-clients/mcp_style_validation.py', 'certification/installed-clients/mcp_ingest_publish_validation.py', 'certification/installed-clients/mcp_map_package_validation.py', 'certification/installed-clients/mcp_render_validation.py', 'certification/installed-clients/render_png.py', 'certification/installed-clients/mcp_style_state.py', 'certification/installed-clients/mcp_ingest_publish_state.py', 'certification/installed-clients/fixture.v1.json', 'certification/installed-clients/mcp_candidate_wire.mjs', 'certification/installed-clients/mcp_fixed_client_launcher.mjs', 'certification/installed-clients/mcp_fixed_sdk_runner.mjs', 'certification/installed-clients/mcp_fixed_client_manifest.v1.json', 'certification/installed-clients/mcp_deployment_workspace_validation.mjs', 'certification/installed-clients/mcp_deployment_workspace_authority.py', 'certification/installed-clients/mcp_deployment_workspace_cohort.py', 'certification/installed-clients/mcp_deployment_identity_fixture.py', 'certification/installed-clients/mcp_deployment_identity_validation.py', 'certification/installed-clients/mcp_deployment_identity_role.py', 'certification/installed-clients/mcp_deployment_identity_configuration.py', 'certification/installed-clients/mcp_managed_identity_fixture.py', 'certification/installed-clients/mcp_ops_events_data_read.py', 'certification/installed-clients/mcp_ops_events_state.py')
SCHEMA = "honua.mcp-deployment-workspace-source/v1"


def validate_pins(pins):
    if (not isinstance(pins, dict) or set(pins) != {"repository", "sourceSha", "sha256"}
            or pins["repository"] != SOURCE.REPOSITORY or not isinstance(pins["sha256"], dict)
            or set(pins["sha256"]) != set(PATHS)
            or any(not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value) for value in pins["sha256"].values())):
        raise ValueError("deployment-workspace pins must identify all canonical release dependencies")


def fetch(pins, destination, *, get=SOURCE.api):
    validate_pins(pins)
    retained = SOURCE.immutable_files(SOURCE.REPOSITORY, pins["sourceSha"], PATHS, get=get)
    if any(retained[path][1] != pins["sha256"][path] for path in PATHS):
        raise ValueError("deployment-workspace source differs from reviewed file pins")
    destination.mkdir(parents=True, exist_ok=True)
    for path, (data, _, _) in retained.items():
        (destination / Path(path).name).write_bytes(data)
    binding = {"schema": SCHEMA, "repository": SOURCE.REPOSITORY, "sourceSha": pins["sourceSha"],
               "files": {path: {"sha256": digest, "gitBlob": blob} for path, (_, digest, blob) in retained.items()}}
    (destination / "source-binding.json").write_text(json.dumps(binding, indent=2) + "\n")
    return binding


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pins", type=Path, default=ROOT / "deployment-workspace-validation-pins.json")
    parser.add_argument("--destination", type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(fetch(json.loads(args.pins.read_text()), args.destination)))
    except (ValueError, OSError, SOURCE.subprocess.CalledProcessError) as exc:
        parser.exit(1, f"shared deployment-workspace source refused: {type(exc).__name__}\n")


if __name__ == "__main__":
    main()
