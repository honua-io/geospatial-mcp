"""Regression tests for the spec index SBOM and its attestation workflow."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import tempfile
import unittest

from tools import spec_sbom

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github" / "workflows" / "attest-spec-index.yml"


class SpecSbomTests(unittest.TestCase):
    def test_published_index_maps_every_schema_with_its_digest(self) -> None:
        bom = spec_sbom.build(ROOT / "spec/schemas/index.json", repository="honua-io/geospatial-mcp",
                              revision="a" * 40, version="a" * 40, repo_root=ROOT)
        self.assertEqual(bom["bomFormat"], "CycloneDX")
        self.assertEqual(bom["metadata"]["component"]["name"], "spec/schemas/index.json")
        self.assertGreater(len(bom["components"]), 0)
        for component in bom["components"]:
            path = ROOT / component["name"]
            self.assertEqual(component["type"], "file")
            self.assertEqual(component["hashes"], [{"alg": "SHA-256",
                                                    "content": hashlib.sha256(path.read_bytes()).hexdigest()}])

    def test_a_schema_named_but_missing_is_an_error(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            schemas = Path(directory, "spec", "schemas")
            schemas.mkdir(parents=True)
            (schemas / "index.json").write_text(json.dumps({"tools": {"x": {"schema": "tools/x.schema.json"}}}))
            with self.assertRaisesRegex(ValueError, "tools/x.schema.json"):
                spec_sbom.build(schemas / "index.json", repository="o/r", revision="a" * 40,
                                version="v", repo_root=Path(directory))


class AttestationWorkflowTests(unittest.TestCase):
    workflow = WORKFLOW.read_text(encoding="utf-8")

    def test_attests_only_verified_published_bytes_from_trunk(self) -> None:
        self.assertIn("branches: [trunk]", self.workflow)
        self.assertIn("github.ref == 'refs/heads/trunk'", self.workflow)
        self.assertIn("id-token: write", self.workflow)
        self.assertIn("attestations: write", self.workflow)
        verify = self.workflow.index('cmp -s "${published}" spec/schemas/index.json')
        self.assertLess(verify, self.workflow.index("actions/attest-build-provenance@"))
        self.assertLess(verify, self.workflow.index("actions/attest-sbom@"))
        self.assertEqual(2, self.workflow.count("subject-path: ${{ env.PUBLISHED_INDEX }}"))
        # The collector binds --source-digest to the pinned commit. A path filter
        # would leave a later trunk pin of unchanged index bytes unverified.
        push = self.workflow.split("on:\n", 1)[1].split("workflow_dispatch:", 1)[0]
        self.assertIn("push:", push)
        self.assertNotIn("paths:", push)
        self.assertIn("github.event_name != 'pull_request'", self.workflow)
        verified = self.workflow.split("uses: actions/attest-sbom@", 1)[1]
        self.assertLess(verified.index("GH_TOKEN: ${{ github.token }}"), verified.index("gh attestation verify"))
        self.assertLess(verified.index("gh attestation verify"), verified.index("https://slsa.dev/provenance/v1"))
        self.assertIn("--source-digest", verified)
        self.assertIn("--signer-workflow", verified)
        self.assertIn("https://cyclonedx.org/bom", verified)
        for action in re.findall(r"uses:\s+(\S+)", self.workflow):
            self.assertRegex(action, r"@[0-9a-f]{40}$")


if __name__ == "__main__":
    unittest.main()
