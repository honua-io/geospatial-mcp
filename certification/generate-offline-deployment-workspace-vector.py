#!/usr/bin/env python3
"""Generate release-owned offline controls, never actual candidate evidence."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("deployment-workspace_source", ROOT / "fetch-deployment-workspace-validation.py")
SOURCE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SOURCE)
SUPPORT = ('mcp_deployment_workspace_full_controls.py', 'mcp_deployment_workspace_validation_controls.py', 'mcp_deployment_identity_role_controls.py', 'mcp_managed_identity_fixture_controls.py', 'mcp_map_package_validation_controls.py', 'mcp_render_validation_controls.py', 'mcp_render_bootstrap.py', 'regression.py', 'oracles.py')


def verified_sources(pins, directory, *, get=SOURCE.SOURCE.api):
    # One invocation shares an authenticated response snapshot. Both existing
    # validators still rejudge complete protected history, pin shape and every
    # blob hash; immutable dependency bytes are not downloaded twice.
    responses = {}
    def once(path):
        if path not in responses:
            responses[path] = get(path)
        return responses[path]
    SOURCE.fetch(pins, directory, get=once)
    paths = SOURCE.PATHS + tuple("certification/installed-clients/" + name for name in SUPPORT)
    return SOURCE.SOURCE.immutable_files(SOURCE.SOURCE.REPOSITORY, pins["sourceSha"], paths, get=once)


def main():
    pins = json.loads((ROOT / "deployment-workspace-validation-pins.json").read_bytes())
    # Reuse full production pin-shape and protected-history validation first.
    with tempfile.TemporaryDirectory(prefix="mcp-deployment-workspace-offline-") as work:
        directory = Path(work)
        retained = verified_sources(pins, directory)
        for path, (data, digest, _) in retained.items():
            if path in pins["sha256"] and digest != pins["sha256"][path]:
                raise ValueError("offline generator differs from production pins")
            (directory / Path(path).name).write_bytes(data)
        program = '''import base64,hashlib,json
from mcp_deployment_workspace_full_controls import full_controls,bootstrap,FIXTURE
import mcp_deployment_workspace_cohort as full
vector=full_controls(); raw=json.dumps(bootstrap()).encode()
proofs={}
for key in ['sdk','inspector']:
 observed=vector['members'][key]
 judged=full.judge(FIXTURE,bootstrap(),observed,vector['terminal'])
 proofs[key]={**judged,'observations':observed,'identityCohort':vector['terminal']}
print(json.dumps({'proofs':proofs,'bootstrapBase64':base64.b64encode(raw).decode(),'bootstrapBytesSha256':hashlib.sha256(raw).hexdigest()}))
'''
        result = subprocess.run([sys.executable, "-B", "-c", program], cwd=directory,
                                check=True, capture_output=True, text=True, timeout=60)
        value = json.loads(result.stdout)
        proofs = value.pop("proofs")
        for proof in proofs.values():
            proof.update(schema="honua.mcp-deployment-workspace-proof/v2", helperSourceSha=pins["sourceSha"],
                         helperSha256="sha256:" + pins["sha256"]["certification/installed-clients/mcp_deployment_workspace_cohort.py"])
        vector = {"meaning": "Complete release-owned OFFLINE two-client oracle vectors; no candidate credit",
                  "generatorSourceSha": pins["sourceSha"],
                  "generatorBinding": {"sourceSha": pins["sourceSha"], "files": {
                      path: {"sha256": digest, "gitBlob": blob} for path, (_, digest, blob) in retained.items()}},
                  **value, "proof": proofs["sdk"], "inspectorProof": proofs["inspector"]}
        target = ROOT / "test/fixtures/offline-deployment-workspace-oracle-vector.json"
        target.write_text(json.dumps(vector, indent=2) + "\n")
        print("Generated explicitly offline vector from complete protected release source", pins["sourceSha"])


if __name__ == "__main__":
    main()
