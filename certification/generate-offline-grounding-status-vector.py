#!/usr/bin/env python3
"""Generate protected-source synthetic controls without candidate/client credit."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("grounding_source", ROOT / "fetch-grounding-status-validation.py")
SOURCE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SOURCE)
SUPPORT = (
    "mcp_grounding_status_journey_controls.py", "mcp_grounding_status_validation_controls.py",
    "mcp_ops_events_journey_controls.py", "mcp_ops_events_validation_controls.py",
    "mcp_ops_events_config_controls.py", "mcp_ops_events_state_controls.py",
    "mcp_ops_events_setup_controls.py", "mcp_ops_events_data_read.py",
    "mcp_ops_events_validation.py", "mcp_ops_events_state.py", "mcp_ops_events_setup.py",
    "mcp_map_package_validation_controls.py",
    "mcp_render_validation_controls.py", "mcp_render_bootstrap.py", "regression.py", "oracles.py",
)


def main():
    pins = json.loads((ROOT / "grounding-status-validation-pins.json").read_bytes())
    with tempfile.TemporaryDirectory(prefix="mcp-grounding-offline-") as work:
        directory = Path(work)
        SOURCE.fetch(pins, directory)
        paths = SOURCE.PATHS + tuple("certification/installed-clients/" + name for name in SUPPORT)
        retained = SOURCE.SOURCE.immutable_files(SOURCE.SOURCE.REPOSITORY, pins["sourceSha"], paths)
        for path, (data, digest, _) in retained.items():
            if path in pins["sha256"] and digest != pins["sha256"][path]:
                raise ValueError("offline grounding source differs from production pins")
            (directory / Path(path).name).write_bytes(data)
        program = '''import base64,hashlib,json
from mcp_grounding_status_journey_controls import vector
from mcp_grounding_status_validation import judge
from mcp_render_validation_controls import FIXTURE
out={}
for name,inspector in [('sdk',False),('inspector',True)]:
    owned,raw,declaration,observed=vector(inspector=inspector)
    boot=json.dumps(owned).encode()
    out[name]={'judged':judge(FIXTURE,owned,raw,declaration,observed),'observations':observed,
               'bootstrapBase64':base64.b64encode(boot).decode(),
               'manifestBase64':base64.b64encode(raw).decode(),
               'manifestSourceSha':declaration['releaseSourceSha']}
print(json.dumps(out,allow_nan=False))
'''
        result = subprocess.run([sys.executable, "-B", "-c", program], cwd=directory,
                                check=True, capture_output=True, text=True, timeout=90)
        generated = json.loads(result.stdout)
        cases = {}
        for name, value in generated.items():
            proof = {**value.pop("judged"), "schema": "honua.mcp-grounding-status-proof/v1",
                     "helperSourceSha": pins["sourceSha"],
                     "helperSha256": "sha256:" + pins["sha256"]["certification/installed-clients/mcp_grounding_status_validation.py"],
                     "observations": value.pop("observations")}
            cases[name] = {**value, "proof": proof}
        vector = {"meaning": "Synthetic release-owned grounding/status vectors; no actual candidate or installed-client credit",
                  "generatorSourceSha": pins["sourceSha"],
                  "generatorBinding": {"sourceSha": pins["sourceSha"], "files": {
                      path: {"sha256": digest, "gitBlob": blob} for path, (_, digest, blob) in retained.items()}},
                  **cases}
        target = ROOT / "test/fixtures/offline-grounding-status-oracle-vector.json"
        target.write_text(json.dumps(vector, indent=2) + "\n")
        print("Generated offline grounding/status vector from protected source", pins["sourceSha"])


if __name__ == "__main__":
    main()
