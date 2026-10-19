"""The executable shared oracle obeys the same protected-source trust floor."""
from copy import deepcopy
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
    pins["sha256"] = {new: pins["sha256"][prior] for prior, new in zip(old, MODULE.PATHS, strict=True)}
    tree = responses[f'repos/{pins["repository"]}/git/trees/{pins["sourceSha"]}?recursive=1']
    for entry, path in zip(tree["tree"], MODULE.PATHS, strict=True):
        entry["path"] = path
    return pins, responses


class PlanSourceTests(unittest.TestCase):
    def test_retains_both_verified_files_and_exact_source(self):
        pins, responses = fixtures()
        with tempfile.TemporaryDirectory() as directory:
            binding = MODULE.fetch(pins, Path(directory), get=responses.__getitem__)
            self.assertEqual(pins["sourceSha"], binding["sourceSha"])
            self.assertEqual(set(MODULE.PATHS), set(binding["files"]))
            self.assertEqual(3, len(list(Path(directory).iterdir())))

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

    def test_http_failure_refuses_without_cached_execution(self):
        pins, _ = fixtures()
        def unavailable(_):
            raise subprocess.CalledProcessError(1, ["gh", "api"], stderr="HTTP 404")
        with tempfile.TemporaryDirectory() as directory, self.assertRaises(subprocess.CalledProcessError):
            MODULE.fetch(pins, Path(directory), get=unavailable)


if __name__ == "__main__":
    unittest.main()
