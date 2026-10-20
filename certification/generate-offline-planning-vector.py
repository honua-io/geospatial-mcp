#!/usr/bin/env python3
"""Generate release-owned offline controls, never actual candidate evidence."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("planning_source", ROOT / "fetch-planning-validation.py")
SOURCE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SOURCE)
SUPPORT = ('mcp_map_package_validation_controls.py', 'mcp_ops_events_config.py', 'mcp_ops_events_config_controls.py', 'mcp_ops_events_data_read.py', 'mcp_ops_events_journey_controls.py', 'mcp_ops_events_setup.py', 'mcp_ops_events_setup_controls.py', 'mcp_ops_events_state.py', 'mcp_ops_events_state_controls.py', 'mcp_ops_events_validation.py', 'mcp_ops_events_validation_controls.py', 'mcp_planning_disclosure_controls.py', 'mcp_render_bootstrap.py', 'mcp_render_validation_controls.py', 'oracles.py', 'regression.py')


def main():
    pins = json.loads((ROOT / "planning-validation-pins.json").read_bytes())
    # Reuse full production pin-shape and protected-history validation first.
    with tempfile.TemporaryDirectory(prefix="mcp-planning-offline-") as work:
        directory = Path(work)
        SOURCE.fetch(pins, directory)
        paths = SOURCE.PATHS + tuple("certification/installed-clients/" + name for name in SUPPORT)
        retained = SOURCE.SOURCE.immutable_files(SOURCE.SOURCE.REPOSITORY, pins["sourceSha"], paths)
        for path, (data, digest, _) in retained.items():
            if path in pins["sha256"] and digest != pins["sha256"][path]:
                raise ValueError("offline generator differs from production pins")
            (directory / Path(path).name).write_bytes(data)
        program = '''import base64,hashlib,json
from mcp_planning_disclosure_controls import journey,judge,bootstrap,change_result
import copy
observed=journey(); inspector=journey(inspector=True)
raw=json.dumps(bootstrap()).encode()
mutants={}
for key,is_inspector in [('sdk',False),('inspector',True)]:
 mutants[key]={}
 for name,index,change in [('coherent-live-model',1,lambda b:b.update(engine='live')),
   ('coherent-filter',1,lambda b:b['plan']['steps'][0]['inputs'].update(where='1=1')),
   ('coherent-plan-field',1,lambda b:b['plan'].update(execute=True)),
   ('coherent-step-field',1,lambda b:b['plan']['steps'][0].update(execute=True)),
   ('coherent-warning',1,lambda b:b.update(warnings=[])),
   ('coherent-unmatched',3,lambda b:b.update(reason='No results')),
   ('coherent-validation',4,lambda b:b.update(isExecutable=False))]:
  mutants[key][name]=change_result(journey(inspector=is_inspector),index,change,is_inspector)

print(json.dumps({"judged":judge(observed),"observations":observed,
 "inspectorJudged":judge(inspector),"inspectorObservations":inspector,
 "mutants":mutants,"bootstrapBase64":base64.b64encode(raw).decode(),"bootstrapBytesSha256":hashlib.sha256(raw).hexdigest()}))
'''
        result = subprocess.run([sys.executable, "-B", "-c", program], cwd=directory,
                                check=True, capture_output=True, text=True, timeout=60)
        value = json.loads(result.stdout)
        proof = {**value.pop("judged"), "schema": "honua.mcp-planning-proof/v1",
                 "helperSourceSha": pins["sourceSha"],
                 "helperSha256": "sha256:" + pins["sha256"]["certification/installed-clients/mcp_planning_disclosure.py"],
                 "observations": value.pop("observations")}
        inspector_proof = {**value.pop("inspectorJudged"), "schema": "honua.mcp-planning-proof/v1",
                 "helperSourceSha": pins["sourceSha"],
                 "helperSha256": "sha256:" + pins["sha256"]["certification/installed-clients/mcp_planning_disclosure.py"],
                 "observations": value.pop("inspectorObservations")}
        vector = {"meaning": "Complete release-owned offline oracle vector; no actual installed-client or candidate credit",
                  "generatorSourceSha": pins["sourceSha"],
                  "generatorBinding": {"sourceSha": pins["sourceSha"], "files": {
                      path: {"sha256": digest, "gitBlob": blob} for path, (_, digest, blob) in retained.items()}},
                  **value, "proof": proof, "inspectorProof": inspector_proof}
        target = ROOT / "test/fixtures/offline-planning-oracle-vector.json"
        target.write_text(json.dumps(vector, indent=2) + "\n")
        print("Generated explicitly offline vector from complete protected release source", pins["sourceSha"])


if __name__ == "__main__":
    main()
