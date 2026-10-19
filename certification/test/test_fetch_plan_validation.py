"""The executable shared oracle obeys the same protected-source trust floor."""
import base64
from copy import deepcopy
import hashlib
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

from test_fetch_certification_requirements import fixtures as governance_fixtures

SPEC = importlib.util.spec_from_file_location("fetch_plan", Path(__file__).resolve().parents[1] / "fetch-plan-validation.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def fixtures():
    pins, responses = governance_fixtures()
    old = list(pins["sha256"])
    pins.pop("requirementsRevision")
    pins["sha256"] = {new: pins["sha256"][prior] for prior, new in zip(old, MODULE.PATHS[:2], strict=True)}
    tree = responses[f'repos/{pins["repository"]}/git/trees/{pins["sourceSha"]}?recursive=1']
    for entry, path in zip(tree["tree"], MODULE.PATHS[:2], strict=True):
        entry["path"] = path
    module_bytes = b"// controlled fixture module; never executed\n"
    blob = hashlib.sha1(b"blob " + str(len(module_bytes)).encode() + b"\0" + module_bytes).hexdigest()
    pins["sha256"][MODULE.PATHS[2]] = hashlib.sha256(module_bytes).hexdigest()
    tree["tree"].append({"path": MODULE.PATHS[2], "type": "blob", "sha": blob})
    responses[f'repos/{pins["repository"]}/git/blobs/{blob}'] = {
        "sha": blob, "encoding": "base64", "size": len(module_bytes),
        "content": base64.b64encode(module_bytes).decode()}
    return pins, responses


class PlanSourceTests(unittest.TestCase):
    def test_retains_all_verified_files_and_exact_source(self):
        pins, responses = fixtures()
        with tempfile.TemporaryDirectory() as directory:
            binding = MODULE.fetch(pins, Path(directory), get=responses.__getitem__)
            self.assertEqual(pins["sourceSha"], binding["sourceSha"])
            self.assertEqual(set(MODULE.PATHS), set(binding["files"]))
            self.assertEqual(4, len(list(Path(directory).iterdir())))

    def test_unreviewed_branch_wrong_repository_and_incomplete_readback_refuse(self):
        pins, responses = fixtures()
        repo = "repos/" + pins["repository"]
        changes = [(repo, "full_name", "other/release"),
                   (repo + "/branches/trunk", "protected", False),
                   (repo + f'/compare/{pins["sourceSha"]}...{"b" * 40}', "status", "diverged"),
                   (repo + f'/git/trees/{pins["sourceSha"]}?recursive=1', "truncated", True)]
        for path, key, value in changes:
            with self.subTest(key=key), tempfile.TemporaryDirectory() as directory:
                broken = deepcopy(responses)
                broken[path][key] = value
                with self.assertRaises(ValueError):
                    MODULE.fetch(pins, Path(directory), get=broken.__getitem__)
                self.assertEqual([], list(Path(directory).iterdir()))

    def test_digest_ref_and_missing_file_are_not_fallbacks(self):
        pins, responses = fixtures()
        for mutation in ["digest", "mutable", "missing", "repository"]:
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as directory:
                broken = deepcopy(pins)
                if mutation == "digest": broken["sha256"][MODULE.PATHS[0]] = "0" * 64
                elif mutation == "mutable": broken["sourceSha"] = "trunk"
                elif mutation == "missing": broken["sha256"].pop(MODULE.PATHS[1])
                else: broken["repository"] = "other/release"
                with self.assertRaises(ValueError):
                    MODULE.fetch(broken, Path(directory), get=responses.__getitem__)
                self.assertEqual([], list(Path(directory).iterdir()))

    def test_executable_module_tamper_refuses_before_retaining_any_source(self):
        pins, responses = fixtures()
        tree = responses[f'repos/{pins["repository"]}/git/trees/{pins["sourceSha"]}?recursive=1']
        blob = next(item["sha"] for item in tree["tree"] if item["path"] == MODULE.PATHS[2])
        broken = deepcopy(responses)
        broken[f'repos/{pins["repository"]}/git/blobs/{blob}']["content"] = base64.b64encode(b"changed executable").decode()
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                MODULE.fetch(pins, Path(directory), get=broken.__getitem__)
            self.assertEqual([], list(Path(directory).iterdir()))

    def test_http_failure_refuses_without_cached_execution(self):
        pins, _ = fixtures()
        def unavailable(_):
            raise subprocess.CalledProcessError(1, ["gh", "api"], stderr="HTTP 404")
        with tempfile.TemporaryDirectory() as directory, self.assertRaises(subprocess.CalledProcessError):
            MODULE.fetch(pins, Path(directory), get=unavailable)


if __name__ == "__main__":
    unittest.main()
