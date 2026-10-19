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
                        "complete": True, "receipt_schema_min": "v2", "requirements": [
                            {"surface": "mcp", "operation": "initialize", "auth_policy_revision": "anonymous-public-v1",
                             "scenario_facets": ["positive", "negative", "media-schema", "auth"]}]}).encode(),
            b"# fixture consumer bytes; not executed\n",
            json.dumps({"schema": "honua.mcp-operation-auth-policy/v1", "revision": "mcp-operation-auth-v1",
                        "owner_issue": "https://github.com/honua-io/honua-release/issues/695",
                        "required_observations": {
                            "anonymous-public-v1": ["anonymous-success", "fresh-anonymous-session", "no-credentials"],
                            "mcp-protected-operation-v1": ["authenticated-success", "fresh-anonymous-refusal",
                                "no-credential-forwarding", "no-authenticated-session-reuse", "caller-session-binding"]},
                        "operations": [{"operation": "initialize", "auth_policy_revision": "anonymous-public-v1"}]}).encode()]
    blobs = [hashlib.sha1(b"blob " + str(len(value)).encode() + b"\0" + value).hexdigest() for value in data]
    repo = "repos/" + MODULE.REPOSITORY
    responses = {
        repo: {"full_name": MODULE.REPOSITORY, "default_branch": "trunk"},
        repo + "/branches/trunk": {"name": "trunk", "protected": True, "commit": {"sha": head}},
        repo + f"/compare/{source}...{head}": {"status": "ahead", "base_commit": {"sha": source}, "merge_base_commit": {"sha": source}},
        repo + f"/git/trees/{source}?recursive=1": {"truncated": False, "tree": [
            {"path": path, "type": "blob", "sha": blob} for path, blob in zip((*MODULE.PATHS, MODULE.AUTH_POLICY), blobs)]},
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
            self.assertIn(MODULE.AUTH_POLICY, result["files"])
            self.assertTrue((Path(directory) / Path(MODULE.AUTH_POLICY).name).is_file())
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

    def test_policy_must_be_from_same_source_and_cover_exact_authority_contract(self):
        pins, responses = fixtures()
        repo = "repos/" + MODULE.REPOSITORY
        tree = repo + "/git/trees/" + pins["sourceSha"] + "?recursive=1"
        broken = deepcopy(responses)
        broken[tree]["tree"] = [row for row in broken[tree]["tree"] if row["path"] != MODULE.AUTH_POLICY]
        with tempfile.TemporaryDirectory() as directory, self.assertRaises(ValueError):
            MODULE.fetch(pins, Path(directory), get=broken.__getitem__)
        policy_entry = next(row for row in responses[tree]["tree"] if row["path"] == MODULE.AUTH_POLICY)
        policy = json.loads(base64.b64decode(responses[repo + "/git/blobs/" + policy_entry["sha"]]["content"]))
        catalog_entry = next(row for row in responses[tree]["tree"] if row["path"] == MODULE.PATHS[0])
        catalog = json.loads(base64.b64decode(responses[repo + "/git/blobs/" + catalog_entry["sha"]]["content"]))
        mutations = [lambda p: p.update(revision="invented"), lambda p: p.update(operations=[]),
                     lambda p: p["operations"].append(deepcopy(p["operations"][0])),
                     lambda p: p["required_observations"]["mcp-protected-operation-v1"].remove("caller-session-binding"),
                     lambda p: p["operations"][0].update(auth_policy_revision="mcp-protected-operation-v1")]
        for mutation in mutations:
            with self.subTest(mutation=mutation):
                altered = deepcopy(policy)
                mutation(altered)
                with self.assertRaises(ValueError):
                    MODULE.validate_auth_policy(altered, catalog)
        altered = deepcopy(catalog)
        altered["requirements"][0]["scenario_facets"].remove("auth")
        with self.assertRaises(ValueError):
            MODULE.validate_auth_policy(policy, altered)

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
