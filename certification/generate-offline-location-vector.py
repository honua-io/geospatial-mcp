#!/usr/bin/env python3
"""Generate protected-source offline controls; never candidate/client evidence."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("location_source", ROOT / "fetch-location-validation.py")
SOURCE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SOURCE)
SUPPORT = ("mcp_location_validation_controls.py", "mcp_map_package_validation_controls.py",
           "mcp_render_validation_controls.py", "mcp_render_bootstrap.py", "regression.py", "oracles.py")


def main():
    pins = json.loads((ROOT / "location-validation-pins.json").read_bytes())
    with tempfile.TemporaryDirectory(prefix="mcp-location-offline-") as work:
        directory = Path(work)
        SOURCE.fetch(pins, directory)
        paths = SOURCE.PATHS + tuple("certification/installed-clients/" + name for name in SUPPORT)
        retained = SOURCE.SOURCE.immutable_files(SOURCE.SOURCE.REPOSITORY, pins["sourceSha"], paths)
        for path, (data, digest, _) in retained.items():
            if path in pins["sha256"] and digest != pins["sha256"][path]:
                raise ValueError("offline generator differs from production pins")
            (directory / Path(path).name).write_bytes(data)
        program = '''import base64,hashlib,json
from mcp_location_validation_controls import observations,bootstrap,FIXTURE
from mcp_location_validation import judge,OPERATIONS
raw=json.dumps(bootstrap()).encode()
proofs={}
for operation in OPERATIONS:
 observed=observations(operation)
 proofs[operation]={"judged":judge(FIXTURE,bootstrap(),observed,operation),"observations":observed}
print(json.dumps({"proofs":proofs,"bootstrapBase64":base64.b64encode(raw).decode(),
 "bootstrapBytesSha256":hashlib.sha256(raw).hexdigest()}))
'''
        result = subprocess.run([sys.executable, "-B", "-c", program], cwd=directory,
                                check=True, capture_output=True, text=True, timeout=60)
        value = json.loads(result.stdout)
        proofs = {operation: {**item["judged"], "schema": "honua.mcp-location-proof/v1",
                  "helperSourceSha": pins["sourceSha"],
                  "helperSha256": "sha256:" + pins["sha256"]["certification/installed-clients/mcp_location_validation.py"],
                  "observations": item["observations"]} for operation, item in value.pop("proofs").items()}
        vector = {"meaning": "Protected release-owned offline vectors; no actual installed-client or candidate qualification",
                  "generatorBinding": {"sourceSha": pins["sourceSha"], "files": {
                      path: {"sha256": digest, "gitBlob": blob} for path, (_, digest, blob) in retained.items()}},
                  **value, "proofs": proofs}
        target = ROOT / "test/fixtures/offline-location-oracle-vector.json"
        target.write_text(json.dumps(vector, indent=2) + "\n")
        print("Generated explicitly offline location vectors from protected source", pins["sourceSha"])


if __name__ == "__main__":
    main()
