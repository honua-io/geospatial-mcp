"""Original candidate manifest retention uses the protected-history source floor."""
import base64
from copy import deepcopy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

import yaml

from test_fetch_certification_requirements import fixtures as governance_fixtures

SPEC = importlib.util.spec_from_file_location("fetch_ops_manifest", Path(__file__).resolve().parents[1] / "fetch-ops-events-manifest.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def fixtures():
    pins, responses = governance_fixtures()
    raw = b"platformRelease: explicit-offline-control\n"
    blob = hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()
    tree = responses[f'repos/{pins["repository"]}/git/trees/{pins["sourceSha"]}?recursive=1']
    tree["tree"].append({"path": MODULE.PATH, "type": "blob", "sha": blob})
    responses[f'repos/{pins["repository"]}/git/blobs/{blob}'] = {
        "sha": blob, "encoding": "base64", "size": len(raw), "content": base64.b64encode(raw).decode()}
    binding = {"repository": pins["repository"], "sourceSha": pins["sourceSha"]}
    return binding, responses, raw, blob


class OpsManifestSourceTests(unittest.TestCase):
    def test_selected_candidate_is_checked_before_retaining_manifest(self):
        original, responses, _, _ = fixtures()
        source = "c" * 40
        digest = "sha256:" + "d" * 64
        image = "ghcr.io/honua-io/honua-server@" + digest
        manifest = {"candidate": {"ref": source, "refSource": "trunk"},
                    "components": {"honua-server": {"sha": source,
                        "image": "ghcr.io/honua-io/honua-server:nightly-candidate", "digest": digest}}}
        for mutation in (None, "source", "image", "mutable", "component", "origin"):
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as work:
                value = deepcopy(manifest)
                if mutation == "source": value["candidate"]["ref"] = "e" * 40
                if mutation == "image": value["components"]["honua-server"]["digest"] = "sha256:" + "e" * 64
                if mutation == "mutable": value["components"]["honua-server"]["image"] = "other/server:latest"
                if mutation == "component": value["components"]["honua-server"]["sha"] = "e" * 40
                if mutation == "origin": value["candidate"]["refSource"] = "branch"
                raw = yaml.safe_dump(value).encode()
                blob = hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()
                changed = deepcopy(responses)
                tree = changed[f'repos/{original["repository"]}/git/trees/{original["sourceSha"]}?recursive=1']
                next(entry for entry in tree["tree"] if entry["path"] == MODULE.PATH)["sha"] = blob
                changed[f'repos/{original["repository"]}/git/blobs/{blob}'] = {
                    "sha": blob, "encoding": "base64", "size": len(raw), "content": base64.b64encode(raw).decode()}
                if mutation is None:
                    MODULE.fetch(original, Path(work), get=changed.__getitem__, candidate_source_sha=source, candidate_image=image)
                    self.assertEqual((Path(work) / "ops-events-platform-manifest.yaml").read_bytes(), raw)
                else:
                    with self.assertRaisesRegex(ValueError, "selected candidate"):
                        MODULE.fetch(original, Path(work), get=changed.__getitem__, candidate_source_sha=source, candidate_image=image)
                    self.assertEqual(list(Path(work).iterdir()), [])

    def test_retains_original_bytes_and_complete_git_binding_without_qualification(self):
        original, responses, raw, blob = fixtures()
        with tempfile.TemporaryDirectory() as work:
            directory = Path(work)
            binding = MODULE.fetch(original, directory, get=responses.__getitem__)
            self.assertEqual((directory / "ops-events-platform-manifest.yaml").read_bytes(), raw)
            self.assertEqual(json.loads((directory / "ops-events-manifest-binding.json").read_bytes()), binding)
            self.assertEqual(binding, {"schema": "honua.mcp-ops-events-manifest/v1", **original,
                "path": "platform-manifest.yaml", "sha256": hashlib.sha256(raw).hexdigest(), "gitBlob": blob})

    def test_missing_wrong_repository_or_mutable_source_refuses_before_any_write(self):
        original, responses, _, _ = fixtures()
        for value in (None, {}, {**original, "repository": "other/release"}, {**original, "sourceSha": "trunk"}):
            with self.subTest(value=value), tempfile.TemporaryDirectory() as work:
                with self.assertRaises(ValueError):
                    MODULE.fetch(value, Path(work), get=responses.__getitem__)
                self.assertEqual(list(Path(work).iterdir()), [])

    def test_unprotected_diverged_or_incomplete_history_refuses_before_any_write(self):
        original, responses, _, _ = fixtures()
        repo = "repos/" + original["repository"]
        changes = [(repo + "/branches/trunk", "protected", False),
            (repo + f'/compare/{original["sourceSha"]}...{"b" * 40}', "status", "diverged"),
            (repo + f'/git/trees/{original["sourceSha"]}?recursive=1', "truncated", True)]
        for path, key, value in changes:
            with self.subTest(key=key), tempfile.TemporaryDirectory() as work:
                changed = deepcopy(responses)
                changed[path][key] = value
                with self.assertRaises(ValueError):
                    MODULE.fetch(original, Path(work), get=changed.__getitem__)
                self.assertEqual(list(Path(work).iterdir()), [])

    def test_changed_missing_or_duplicate_manifest_refuses_before_any_write(self):
        original, responses, _, blob = fixtures()
        tree_path = f'repos/{original["repository"]}/git/trees/{original["sourceSha"]}?recursive=1'
        for mutation in ("bytes", "missing", "duplicate"):
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as work:
                changed = deepcopy(responses)
                if mutation == "bytes":
                    changed[f'repos/{original["repository"]}/git/blobs/{blob}']["content"] = base64.b64encode(b"changed").decode()
                else:
                    entry = next(item for item in changed[tree_path]["tree"] if item["path"] == MODULE.PATH)
                    if mutation == "missing":
                        changed[tree_path]["tree"].remove(entry)
                    else:
                        changed[tree_path]["tree"].append(deepcopy(entry))
                with self.assertRaises(ValueError):
                    MODULE.fetch(original, Path(work), get=changed.__getitem__)
                self.assertEqual(list(Path(work).iterdir()), [])


if __name__ == "__main__":
    unittest.main()
