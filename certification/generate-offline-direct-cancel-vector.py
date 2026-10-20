#!/usr/bin/env python3
"""Generate protected-source synthetic controls, never candidate evidence."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("direct_cancel_source", ROOT / "fetch-direct-cancel-validation.py")
SOURCE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SOURCE)
SUPPORT = ('mcp_direct_cancel_validation_controls.py', 'mcp_map_package_validation_controls.py', 'mcp_ops_events_config.py', 'mcp_ops_events_config_controls.py', 'mcp_ops_events_data_read.py', 'mcp_ops_events_journey_controls.py', 'mcp_ops_events_setup.py', 'mcp_ops_events_setup_controls.py', 'mcp_ops_events_state.py', 'mcp_ops_events_state_controls.py', 'mcp_ops_events_validation.py', 'mcp_ops_events_validation_controls.py', 'mcp_render_bootstrap.py', 'mcp_render_validation_controls.py', 'oracles.py', 'regression.py')


def verified_sources(pins, *, get=SOURCE.SOURCE.api):
    SOURCE.validate_pins(pins)
    paths = SOURCE.PATHS + tuple("certification/installed-clients/" + name for name in SUPPORT)
    retained = SOURCE.SOURCE.immutable_files(SOURCE.SOURCE.REPOSITORY, pins["sourceSha"], paths, get=get)
    if any(retained[path][1] != pins["sha256"][path] for path in SOURCE.PATHS):
        raise ValueError("offline direct cancel source differs from reviewed production pins")
    return retained


def main():
    pins = json.loads((ROOT / "direct-cancel-validation-pins.json").read_bytes())
    retained = verified_sources(pins)
    with tempfile.TemporaryDirectory(prefix="mcp-direct-cancel-offline-") as work:
        directory = Path(work)
        for path, (data, _, _) in retained.items():
            (directory / Path(path).name).write_bytes(data)
        program = '''import base64,copy,hashlib,json
from mcp_direct_cancel_validation_controls import journey,judge,bootstrap,rebind,envelope
original=json.dumps(bootstrap()).encode()
value={"bootstrapBase64":base64.b64encode(original).decode(),
       "bootstrapBytesSha256":hashlib.sha256(original).hexdigest(),"coherentWrongJobAcknowledgements":{},
       "coherentWrongJobRequests":{}}
for key,inspector in [("sdk",False),("inspector",True)]:
 observed=journey(inspector=inspector)
 value[key]={"judged":judge(observed),"observations":observed}
 changed=copy.deepcopy(observed)
 entry=next(item for item in changed["calls"] if item["id"]=="owner-cancel")
 body=copy.deepcopy(entry["result"]["structuredContent"]);body["jobId"]="gp-"+"4"*24
 entry["result"]=envelope(body);changed=rebind(changed,inspector=inspector)
 try: judge(changed)
 except ValueError: pass
 else: raise ValueError("coherent acknowledgement for another job was accepted")
 # Retain only the fully rehashed changed call; the complete two originals are
 # already retained once. Full-builder controls apply all six negatives to
 # cloned originals without duplicating the large authored input per case.
 value["coherentWrongJobAcknowledgements"][key]=next(item for item in changed["calls"] if item["id"]=="owner-cancel")
 changed=copy.deepcopy(observed)
 entry=next(item for item in changed["calls"] if item["id"]=="repeat-cancel")
 entry["params"]["arguments"]["jobId"]="gp-"+"4"*24
 changed=rebind(changed,inspector=inspector)
 try: judge(changed)
 except ValueError: pass
 else: raise ValueError("coherent cancellation request for another job was accepted")
 value["coherentWrongJobRequests"][key]=next(item for item in changed["calls"] if item["id"]=="repeat-cancel")
print(json.dumps(value,allow_nan=False))
'''
        result = subprocess.run([sys.executable, "-B", "-c", program], cwd=directory,
                                check=True, capture_output=True, text=True, timeout=90)
        value = json.loads(result.stdout)
        for key in ("sdk", "inspector"):
            current = value.pop(key)
            value["proof" if key == "sdk" else "inspectorProof"] = {
                **current["judged"], "schema": "honua.mcp-direct-cancel-proof/v1",
                "observations": current["observations"], "helperSourceSha": pins["sourceSha"],
                "helperSha256": "sha256:" + pins["sha256"]["certification/installed-clients/mcp_direct_cancel_validation.py"]}
        vector = {"meaning": "Synthetic offline direct cancellation controls; no actual installed client, job or candidate credit",
                  "generatorSourceSha": pins["sourceSha"],
                  "generatorBinding": {"sourceSha": pins["sourceSha"], "files": {
                      path: {"sha256": digest, "gitBlob": blob} for path, (_, digest, blob) in retained.items()}}, **value}
        target = ROOT / "test/fixtures/offline-direct-cancel-oracle-vector.json"
        target.write_text(json.dumps(vector, indent=2) + "\n")
        print("Generated explicitly offline direct cancel vector from protected source", pins["sourceSha"])


if __name__ == "__main__":
    main()
