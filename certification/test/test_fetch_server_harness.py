import base64
from copy import deepcopy
import hashlib
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("fetch_server", Path(__file__).resolve().parents[1] / "fetch-server-harness.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def fixtures():
    source, head = "a" * 40, "b" * 40
    repo = "repos/" + MODULE.REPOSITORY
    responses = {
        repo: {"full_name": MODULE.REPOSITORY, "default_branch": "trunk"},
        repo + "/branches/trunk": {"name": "trunk", "protected": True, "commit": {"sha": head}},
        repo + f"/compare/{source}...{head}": {"status": "ahead", "base_commit": {"sha": source}, "merge_base_commit": {"sha": source}},
        repo + f"/git/trees/{source}?recursive=1": {"truncated": False, "tree": []},
    }
    for index, path in enumerate(MODULE.PATHS):
        data = f"// Synthetic immutable-file fixture {index}; never executed.\n".encode()
        blob = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
        responses[repo + f"/git/trees/{source}?recursive=1"]["tree"].append({"path": path, "type": "blob", "sha": blob})
        responses[repo + f"/git/blobs/{blob}"] = {"sha": blob, "encoding": "base64", "size": len(data), "content": base64.b64encode(data).decode()}
    return source, repo, responses


class ServerHarnessFetchTests(unittest.TestCase):
    def test_retains_candidate_source_and_exact_owning_paths(self):
        source, _, responses = fixtures()
        with tempfile.TemporaryDirectory() as directory:
            result = MODULE.fetch(source, Path(directory), get=responses.__getitem__)
            self.assertEqual(source, result["sourceSha"])
            self.assertEqual(set(MODULE.PATHS), set(result["files"]))
            for path, value in result["files"].items():
                data = (Path(directory) / path.removeprefix(MODULE.PREFIX)).read_bytes()
                self.assertEqual(value["sha256"], hashlib.sha256(data).hexdigest())

    def test_missing_mismatched_or_untrusted_source_never_materializes_a_helper(self):
        source, repo, responses = fixtures()
        tree = repo + f"/git/trees/{source}?recursive=1"
        comparison = repo + f"/compare/{source}...{'b' * 40}"
        blob = next(key for key in responses if "/git/blobs/" in key)
        mutations = [(repo, "full_name", "attacker/server"),
                     (repo + "/branches/trunk", "protected", False),
                     (comparison, "status", "diverged"), (comparison, "merge_base_commit", {"sha": "f" * 40}),
                     (tree, "truncated", True), (tree, "tree", responses[tree]["tree"][:-1]),
                     (tree, "tree", responses[tree]["tree"] + [responses[tree]["tree"][0]]),
                     (blob, "content", base64.b64encode(b"forged").decode()), (blob, "sha", "f" * 40)]
        for path, field, value in mutations:
            with self.subTest(field=field), tempfile.TemporaryDirectory() as directory:
                broken = deepcopy(responses); broken[path][field] = value
                with self.assertRaises(ValueError):
                    MODULE.fetch(source, Path(directory), get=broken.__getitem__)
                self.assertEqual([], list(Path(directory).iterdir()))

    def test_api_failure_and_stale_cached_bytes_cannot_be_a_fallback(self):
        source, _, responses = fixtures()
        with tempfile.TemporaryDirectory() as directory:
            def unavailable(path):
                raise subprocess.CalledProcessError(1, ["gh", "api", path], stderr="HTTP404")
            with self.assertRaises(subprocess.CalledProcessError):
                MODULE.fetch(source, Path(directory), get=unavailable)
            (Path(directory) / "request-cancellation.mjs").write_text("stale cached helper")
            with self.assertRaisesRegex(ValueError, "cached fallback"):
                MODULE.fetch(source, Path(directory), get=responses.__getitem__)


if __name__ == "__main__":
    unittest.main()
