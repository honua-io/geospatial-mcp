import base64
from copy import deepcopy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("fetch_governance", Path(__file__).resolve().parents[1] / "fetch-certification-requirements.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def fixtures():
    source, head = "a" * 40, "b" * 40
    data = [json.dumps({"schema": "honua.protocol-certification-requirements/v1", "revision": "fixture",
                        "complete": True, "receipt_schema_min": "v2", "requirements": []}).encode(),
            b"# fixture consumer bytes; not executed\n"]
    blobs = [hashlib.sha1(b"blob " + str(len(value)).encode() + b"\0" + value).hexdigest() for value in data]
    repo = "repos/" + MODULE.REPOSITORY
    responses = {
        repo: {"full_name": MODULE.REPOSITORY, "default_branch": "trunk"},
        repo + "/branches/trunk": {"name": "trunk", "protected": True, "commit": {"sha": head}},
        repo + f"/compare/{source}...{head}": {"status": "ahead", "base_commit": {"sha": source}, "merge_base_commit": {"sha": source}},
        repo + f"/git/trees/{source}?recursive=1": {"truncated": False, "tree": [
            {"path": path, "type": "blob", "sha": blob} for path, blob in zip(MODULE.PATHS, blobs)]},
    }
    responses.update({repo + f"/git/blobs/{blob}": {"sha": blob, "encoding": "base64", "size": len(value),
                                                  "content": base64.b64encode(value).decode()}
                      for value, blob in zip(data, blobs)})
    pins = {"repository": MODULE.REPOSITORY, "sourceSha": source, "requirementsRevision": "fixture",
            "sha256": {path: hashlib.sha256(value).hexdigest() for path, value in zip(MODULE.PATHS, data)}}
    return pins, responses


class GovernanceFetchTests(unittest.TestCase):
    def test_retains_verified_exact_bytes_and_blob_binding(self):
        pins, responses = fixtures()
        with tempfile.TemporaryDirectory() as directory:
            result = MODULE.fetch(pins, Path(directory), get=responses.__getitem__)
            self.assertEqual(pins["sourceSha"], result["sourceSha"])
            self.assertEqual(pins["requirementsRevision"], result["requirementsRevision"])
            for path, digest in pins["sha256"].items():
                self.assertEqual(digest, hashlib.sha256((Path(directory) / Path(path).name).read_bytes()).hexdigest())

    def test_untrusted_ref_repository_and_readback_controls(self):
        pins, responses = fixtures()
        repo = "repos/" + MODULE.REPOSITORY
        tree = repo + "/git/trees/" + pins["sourceSha"] + "?recursive=1"
        comparison = repo + "/compare/" + pins["sourceSha"] + "..." + "b" * 40
        mutations = [
            (repo, "full_name", "attacker/release"), (repo, "default_branch", "feature"),
            (repo + "/branches/trunk", "protected", False),
            (repo + "/branches/trunk", "name", "feature"),
            (comparison, "status", "diverged"),
            (comparison, "base_commit", {"sha": "c" * 40}),
            (comparison, "merge_base_commit", {"sha": "c" * 40}),
            (tree, "truncated", True), (tree, "tree", []),
        ]
        for path, field, value in mutations:
            with self.subTest(path=path, field=field), tempfile.TemporaryDirectory() as directory:
                broken = deepcopy(responses)
                broken[path][field] = value
                with self.assertRaises(ValueError):
                    MODULE.fetch(pins, Path(directory), get=broken.__getitem__)
                self.assertEqual([], list(Path(directory).iterdir()))

    def test_api_failure_never_falls_back_to_trunk_or_cached_bytes(self):
        pins, _ = fixtures()
        def unavailable(path):
            raise subprocess.CalledProcessError(1, ["gh", "api", path], stderr="HTTP 404")
        with tempfile.TemporaryDirectory() as directory, self.assertRaises(subprocess.CalledProcessError):
            MODULE.fetch(pins, Path(directory), get=unavailable)

    def test_rejects_wrong_blob_bytes_or_reviewed_digest(self):
        pins, responses = fixtures()
        blob = next(key for key in responses if "/git/blobs/" in key)
        for field, value in (("sha", "f" * 40), ("size", 999), ("encoding", "none"),
                             ("content", base64.b64encode(b"forged").decode())):
            with self.subTest(field=field), tempfile.TemporaryDirectory() as directory:
                broken = deepcopy(responses)
                broken[blob][field] = value
                with self.assertRaises(ValueError):
                    MODULE.fetch(pins, Path(directory), get=broken.__getitem__)
        broken = deepcopy(pins)
        broken["sha256"][MODULE.PATHS[0]] = "f" * 64
        with tempfile.TemporaryDirectory() as directory, self.assertRaises(ValueError):
            MODULE.fetch(broken, Path(directory), get=responses.__getitem__)

    def test_override_requires_explicit_pair_and_reviewed_history(self):
        pins, responses = fixtures()
        with tempfile.TemporaryDirectory() as directory:
            for kwargs in ({"source_sha": "feature"}, {"revision": "fixture"},
                           {"source_sha": "trunk", "revision": "fixture"},
                           {"source_sha": pins["sourceSha"], "revision": "stale"}):
                with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                    MODULE.fetch(pins, Path(directory), get=responses.__getitem__, **kwargs)
            result = MODULE.fetch(pins, Path(directory), get=responses.__getitem__,
                                  source_sha=pins["sourceSha"], revision="fixture")
            self.assertEqual(pins["sourceSha"], result["sourceSha"])


if __name__ == "__main__":
    unittest.main()
