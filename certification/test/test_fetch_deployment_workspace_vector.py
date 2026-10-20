"""One protected source fetch preserves complete production pin validation."""
import base64
from copy import deepcopy
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
from test_fetch_deployment_workspace_validation import fixtures
SPEC = importlib.util.spec_from_file_location("deployment_vector", Path(__file__).resolve().parents[1] / "generate-offline-deployment-workspace-vector.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def complete():
    pins, responses = fixtures()
    tree = responses[f'repos/{pins["repository"]}/git/trees/{pins["sourceSha"]}?recursive=1']
    for index, name in enumerate(MODULE.SUPPORT):
        data = f"# offline support {index}; not executed\n".encode()
        blob = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
        tree["tree"].append({"path": "certification/installed-clients/" + name, "type": "blob", "sha": blob})
        responses[f'repos/{pins["repository"]}/git/blobs/{blob}'] = {"sha": blob, "encoding": "base64", "size": len(data), "content": base64.b64encode(data).decode()}
    return pins, responses


class OfflineSourceSnapshotTests(unittest.TestCase):
    def test_every_response_requested_once_with_complete_production_and_support_bindings(self):
        pins, responses = complete(); calls = []
        def get(path):
            calls.append(path)
            return responses[path]
        with tempfile.TemporaryDirectory() as work:
            retained = MODULE.verified_sources(pins, Path(work), get=get)
        self.assertEqual(len(calls), len(set(calls)))
        self.assertEqual(set(retained), set(MODULE.SOURCE.PATHS) | {"certification/installed-clients/" + name for name in MODULE.SUPPORT})
        for path in MODULE.SOURCE.PATHS:
            self.assertEqual(retained[path][1], pins["sha256"][path])

    def test_missing_or_corrupt_support_refuses(self):
        pins, responses = complete()
        tree_path = f'repos/{pins["repository"]}/git/trees/{pins["sourceSha"]}?recursive=1'
        for mode in ("missing", "corrupt"):
            changed = deepcopy(responses); entry = changed[tree_path]["tree"][-1]
            if mode == "missing": changed[tree_path]["tree"].pop()
            else: changed[f'repos/{pins["repository"]}/git/blobs/{entry["sha"]}']["content"] = base64.b64encode(b"wrong").decode()
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as work, self.assertRaises(ValueError):
                MODULE.verified_sources(pins, Path(work), get=changed.__getitem__)

    def test_single_fetch_preserves_production_pin_and_protected_history_refusals(self):
        pins, responses = complete()
        for mode in ("pin", "unprotected"):
            changed_pins, changed = deepcopy(pins), deepcopy(responses)
            if mode == "pin": changed_pins["sha256"][MODULE.SOURCE.PATHS[0]] = "0" * 64
            else: changed[f'repos/{pins["repository"]}/branches/trunk']["protected"] = False
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as work, self.assertRaises(ValueError):
                MODULE.verified_sources(changed_pins, Path(work), get=changed.__getitem__)


if __name__ == "__main__":
    unittest.main()
