#!/usr/bin/env python3
"""Generate release-owned offline controls, never actual candidate evidence."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("ops_events_source", ROOT / "fetch-ops-events-validation.py")
SOURCE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SOURCE)
SUPPORT = ("mcp_ops_events_journey_controls.py", "mcp_ops_events_validation_controls.py",
           "mcp_ops_events_config_controls.py", "mcp_ops_events_state_controls.py", "mcp_ops_events_setup_controls.py",
           "mcp_map_package_validation_controls.py", "mcp_render_validation_controls.py",
           "mcp_render_bootstrap.py", "regression.py", "oracles.py")


def main():
    pins = json.loads((ROOT / "ops-events-validation-pins.json").read_bytes())
    # Reuse full production pin-shape and protected-history validation first.
    with tempfile.TemporaryDirectory(prefix="mcp-ops-events-offline-") as work:
        directory = Path(work)
        SOURCE.fetch(pins, directory)
        paths = SOURCE.PATHS + tuple("certification/installed-clients/" + name for name in SUPPORT)
        retained = SOURCE.SOURCE.immutable_files(SOURCE.SOURCE.REPOSITORY, pins["sourceSha"], paths)
        for path, (data, digest, _) in retained.items():
            if path in pins["sha256"] and digest != pins["sha256"][path]:
                raise ValueError("offline generator differs from production pins")
            (directory / Path(path).name).write_bytes(data)
        program = '''import base64,hashlib,json,yaml
from mcp_ops_events_journey_controls import journey,judge,scenario_inputs,configuration_manifest,bootstrap
setup,declaration=scenario_inputs()
manifest=configuration_manifest()
manifest['candidate']['ref']=setup['runtimeBinding']['candidateSourceSha']
manifest['components']['honua-server'].update(sha=setup['runtimeBinding']['candidateSourceSha'],digest='sha256:'+'c'*64)
manifest_raw=yaml.safe_dump(manifest).encode()
bootstrap_raw=json.dumps(bootstrap()).encode()
setup_raw=json.dumps(setup).encode()
observed=journey(); inspector=journey(inspector=True)
print(json.dumps({'judged':judge(observed),'observations':observed,
 'inspectorJudged':judge(inspector),'inspectorObservations':inspector,
 'bootstrapBase64':base64.b64encode(bootstrap_raw).decode(),
 'bootstrapBytesSha256':hashlib.sha256(bootstrap_raw).hexdigest(),
 'setupBase64':base64.b64encode(setup_raw).decode(),
 'setupBytesSha256':hashlib.sha256(setup_raw).hexdigest(),
 'manifestBase64':base64.b64encode(manifest_raw).decode(),
 'manifestBinding':{'schema':'honua.mcp-ops-events-manifest/v1','repository':'honua-io/honua-release',
 'sourceSha':declaration['releaseSourceSha'],'path':'platform-manifest.yaml',
 'sha256':hashlib.sha256(manifest_raw).hexdigest(),
 'gitBlob':hashlib.sha1(b'blob '+str(len(manifest_raw)).encode()+b'\\0'+manifest_raw).hexdigest()}}))
'''
        result = subprocess.run([sys.executable, "-B", "-c", program], cwd=directory,
                                check=True, capture_output=True, text=True, timeout=60)
        value = json.loads(result.stdout)
        proof = {**value.pop("judged"), "schema": "honua.mcp-ops-events-proof/v1",
                 "helperSourceSha": pins["sourceSha"],
                 "helperSha256": "sha256:" + pins["sha256"]["certification/installed-clients/mcp_ops_events_validation.py"],
                 "observations": value.pop("observations")}
        inspector_proof = {**value.pop("inspectorJudged"), "schema": "honua.mcp-ops-events-proof/v1",
                 "helperSourceSha": pins["sourceSha"],
                 "helperSha256": "sha256:" + pins["sha256"]["certification/installed-clients/mcp_ops_events_validation.py"],
                 "observations": value.pop("inspectorObservations")}
        vector = {"meaning": "Complete release-owned offline oracle vector with synthetic manifest, callers and candidate; no actual installed-client or candidate credit",
                  "generatorSourceSha": pins["sourceSha"],
                  "generatorBinding": {"sourceSha": pins["sourceSha"], "files": {
                      path: {"sha256": digest, "gitBlob": blob} for path, (_, digest, blob) in retained.items()}},
                  **value, "proof": proof, "inspectorProof": inspector_proof}
        target = ROOT / "test/fixtures/offline-ops-events-oracle-vector.json"
        target.write_text(json.dumps(vector, indent=2) + "\n")
        print("Generated explicitly offline vector from complete protected release source", pins["sourceSha"])


if __name__ == "__main__":
    main()
