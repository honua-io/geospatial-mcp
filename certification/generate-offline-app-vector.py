#!/usr/bin/env python3
"""Generate release-owned offline controls, never actual candidate evidence."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("app_source", ROOT / "fetch-app-validation.py")
SOURCE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SOURCE)
SUPPORT = ("mcp_app_package_validation_controls.py", "mcp_execute_plan_validation_controls.py",
           "mcp_map_package_validation_controls.py", "mcp_render_validation_controls.py",
           "mcp_render_bootstrap.py", "mcp_execute_plan_state.py", "mcp_style_state.py", "regression.py", "oracles.py")


def main():
    pins = json.loads((ROOT / "app-validation-pins.json").read_bytes())
    # Reuse full production pin-shape and protected-history validation first.
    with tempfile.TemporaryDirectory(prefix="mcp-app-offline-") as work:
        directory = Path(work)
        SOURCE.fetch(pins, directory)
        paths = SOURCE.PATHS + tuple("certification/installed-clients/" + name for name in SUPPORT)
        retained = SOURCE.SOURCE.immutable_files(SOURCE.SOURCE.REPOSITORY, pins["sourceSha"], paths)
        for path, (data, digest, _) in retained.items():
            if path in pins["sha256"] and digest != pins["sha256"][path]:
                raise ValueError("offline generator differs from production pins")
            (directory / Path(path).name).write_bytes(data)
        program = '''import base64,hashlib,json
from pathlib import Path
from mcp_app_package_validation_controls import controls,bootstrap,FIXTURE
from mcp_app_package_validation import judge
observed=controls()
raw=json.dumps(bootstrap()).encode()
print(json.dumps({"judged":judge(FIXTURE,bootstrap(),observed),"observations":observed,
 "bootstrapBase64":base64.b64encode(raw).decode(),"bootstrapBytesSha256":hashlib.sha256(raw).hexdigest()}))
'''
        result = subprocess.run([sys.executable, "-B", "-c", program], cwd=directory,
                                check=True, capture_output=True, text=True, timeout=60)
        value = json.loads(result.stdout)
        proof = {**value.pop("judged"), "schema": "honua.mcp-app-package-proof/v1",
                 "helperSourceSha": pins["sourceSha"],
                 "helperSha256": "sha256:" + pins["sha256"]["certification/installed-clients/mcp_app_package_validation.py"],
                 "observations": value.pop("observations")}
        vector = {"meaning": "Complete release-owned offline oracle vector; no actual installed-client or candidate credit",
                  "generatorSourceSha": pins["sourceSha"],
                  "generatorBinding": {"sourceSha": pins["sourceSha"], "files": {
                      path: {"sha256": digest, "gitBlob": blob} for path, (_, digest, blob) in retained.items()}},
                  **value, "proof": proof}
        target = ROOT / "test/fixtures/offline-app-oracle-vector.json"
        target.write_text(json.dumps(vector, indent=2) + "\n")
        print("Generated explicitly offline vector from complete protected release source", pins["sourceSha"])


if __name__ == "__main__":
    main()
