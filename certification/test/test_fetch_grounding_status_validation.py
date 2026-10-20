"""Every grounding-status execution/setup dependency shares the protected-source floor."""
import base64
from copy import deepcopy
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest

from test_fetch_certification_requirements import fixtures as governance_fixtures

SPEC = importlib.util.spec_from_file_location("fetch_grounding_status", Path(__file__).resolve().parents[1] / "fetch-grounding-status-validation.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def fixtures():
    pins, responses = governance_fixtures()
    pins.pop("requirementsRevision")
    pins["sha256"] = {}
    tree = responses[f'repos/{pins["repository"]}/git/trees/{pins["sourceSha"]}?recursive=1']
    tree["tree"] = []
    for index, path in enumerate(MODULE.PATHS):
        data = f"# controlled offline dependency {index}; never executed\n".encode()
        blob = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
        pins["sha256"][path] = hashlib.sha256(data).hexdigest()
        tree["tree"].append({"path": path, "type": "blob", "sha": blob})
        responses[f'repos/{pins["repository"]}/git/blobs/{blob}'] = {
            "sha": blob, "encoding": "base64", "size": len(data), "content": base64.b64encode(data).decode()}
    return pins, responses


class GroundingStatusSourceTests(unittest.TestCase):
    def test_complete_setup_and_execution_files_retained_at_one_source(self):
        pins, responses = fixtures()
        with tempfile.TemporaryDirectory() as directory:
            binding = MODULE.fetch(pins, Path(directory), get=responses.__getitem__)
            self.assertEqual(pins["sourceSha"], binding["sourceSha"])
            self.assertEqual(set(MODULE.PATHS), set(binding["files"]))
            self.assertEqual(len(MODULE.PATHS) + 1, len(list(Path(directory).iterdir())))

    def test_every_dependency_tamper_refuses_before_retaining_any_source(self):
        pins, responses = fixtures()
        tree = responses[f'repos/{pins["repository"]}/git/trees/{pins["sourceSha"]}?recursive=1']
        for entry in tree["tree"]:
            with self.subTest(path=entry["path"]), tempfile.TemporaryDirectory() as directory:
                changed = deepcopy(responses)
                changed[f'repos/{pins["repository"]}/git/blobs/{entry["sha"]}']["content"] = base64.b64encode(b"changed").decode()
                with self.assertRaises(ValueError):
                    MODULE.fetch(pins, Path(directory), get=changed.__getitem__)
                self.assertEqual([], list(Path(directory).iterdir()))

    def test_unprotected_wrong_repository_diverged_source_and_partial_tree_refuse(self):
        pins, responses = fixtures()
        repo = "repos/" + pins["repository"]
        for path, key, value in [(repo, "full_name", "other/release"), (repo + "/branches/trunk", "protected", False),
                (repo + f'/compare/{pins["sourceSha"]}...{"b" * 40}', "status", "diverged"),
                (repo + f'/git/trees/{pins["sourceSha"]}?recursive=1', "truncated", True)]:
            with self.subTest(key=key), tempfile.TemporaryDirectory() as directory:
                changed = deepcopy(responses)
                changed[path][key] = value
                with self.assertRaises(ValueError):
                    MODULE.fetch(pins, Path(directory), get=changed.__getitem__)
                self.assertEqual([], list(Path(directory).iterdir()))

    def test_missing_extra_mutable_and_unreviewed_dependencies_refuse(self):
        pins, responses = fixtures()
        for mutation in ("missing", "extra", "mutable", "digest"):
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as directory:
                changed = deepcopy(pins)
                if mutation == "missing": changed["sha256"].pop(MODULE.PATHS[0])
                elif mutation == "extra": changed["sha256"]["unreviewed.py"] = "0" * 64
                elif mutation == "mutable": changed["sourceSha"] = "trunk"
                else: changed["sha256"][MODULE.PATHS[0]] = "0" * 64
                with self.assertRaises(ValueError):
                    MODULE.fetch(changed, Path(directory), get=responses.__getitem__)
                self.assertEqual([], list(Path(directory).iterdir()))


if __name__ == "__main__":
    unittest.main()
