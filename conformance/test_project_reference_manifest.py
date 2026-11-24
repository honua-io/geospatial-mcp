#!/usr/bin/env python3
"""Exercise producer projection together with strict conformance validation."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import check_manifest as cm

ROOT = Path(__file__).resolve().parents[1]


class ReferenceManifestProjectionTest(unittest.TestCase):
    def project(self, manifest):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "producer.json"
            target = Path(directory) / "reference.json"
            source.write_text(json.dumps(manifest))
            result = subprocess.run(
                [sys.executable, str(ROOT / "tools/project_reference_manifest.py"),
                 str(source), str(target)],
                check=True, capture_output=True, text=True,
            )
            level, errors, _, _ = cm.check_manifest(
                str(target), cm.load_json(cm.INDEX_PATH), strict=True,
            )
            return json.loads(target.read_text()), result.stdout, level, errors

    def test_extension_is_reported_without_changing_standard_contract(self):
        reference = cm.load_json(ROOT / "conformance/manifests/honua.manifest.json")
        producer = copy.deepcopy(reference)
        producer["tools"].append({
            "standardName": "extension_only", "advertisedName": "honua_extension_only",
        })
        projected, report, level, errors = self.project(producer)
        self.assertEqual(reference, projected)
        self.assertIn("honua_extension_only", report)
        self.assertEqual("FULL", level)
        self.assertEqual([], errors)

    def test_obsolete_mapping_cannot_hide_missing_standard_tool(self):
        producer = cm.load_json(ROOT / "conformance/manifests/honua.manifest.json")
        mapping = next(tool for tool in producer["tools"]
                       if tool["standardName"] == "create_map")
        mapping["standardName"] = "create_map_package"
        _, _, level, errors = self.project(producer)
        self.assertEqual("FAIL", level)
        self.assertTrue(any("create_map" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
