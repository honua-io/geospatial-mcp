#!/usr/bin/env python3
"""Regression tests for tools/validate_skills.py."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from tools.validate_skills import REQUIRED_COVERAGE, validate


class ValidateSkillsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "skills" / "demo").mkdir(parents=True)
        (self.root / "skills" / "contracts").mkdir()
        (self.root / "skills" / "evals" / "choosing-a-visualization-maui-parcels").mkdir(parents=True)
        (self.root / "spec" / "schemas" / "tools").mkdir(parents=True)
        self.write_json("spec/schemas/index.json", {"tools": [{"standardName": "query_features"}]})
        self.write_json("spec/schemas/tools/query_features.schema.json", {
            "type": "object", "properties": {"serviceId": {}, "layerId": {}, "where": {}},
            "required": ["serviceId", "layerId"]
        })
        self.write_json("skills/catalog.schema.json", {"type": "object"})
        self.write_json("skills/catalog.json", {
            "specVersion": "1.0", "license": "Apache-2.0", "skills": [{
                "name": "demo", "path": "demo", "description": "Use when testing.",
                "workflowFamilies": ["Analyze"], "coverage": sorted(REQUIRED_COVERAGE),
                "standardTools": ["query_features"]
            }]
        })
        self.write_json("skills/contracts/live-surface.json", {"assertions": [{
            "skill": "demo", "standardTool": "query_features", "profile": "base",
            "requiredFields": ["serviceId", "layerId"], "requiredProperties": ["where"]
        }]})
        (self.root / "skills" / "demo" / "SKILL.md").write_text(
            "---\nname: demo\ndescription: Use when testing.\n---\n\n## Anti-patterns\n\n- None.\n",
            encoding="utf-8",
        )
        for name, value in {
            "scenario.json": {"status": "not-run", "evidence": None, "request": "Make a map."},
            "dataset-profile.json": {}, "rubric.json": {}
        }.items():
            self.write_json(f"skills/evals/choosing-a-visualization-maui-parcels/{name}", value)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def write_json(self, relative: str, value: object) -> None:
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value), encoding="utf-8")

    def test_valid_corpus_passes(self) -> None:
        self.assertEqual([], validate(self.root))

    def test_unknown_tool_fails(self) -> None:
        catalog = json.loads((self.root / "skills/catalog.json").read_text(encoding="utf-8"))
        catalog["skills"][0]["standardTools"].append("invented_tool")
        self.write_json("skills/catalog.json", catalog)
        self.assertTrue(any("unknown standard tools" in error for error in validate(self.root)))

    def test_required_field_drift_fails(self) -> None:
        contract = json.loads((self.root / "skills/contracts/live-surface.json").read_text(encoding="utf-8"))
        contract["assertions"][0]["requiredFields"] = ["serviceId"]
        self.write_json("skills/contracts/live-surface.json", contract)
        self.assertTrue(any("required fields drift" in error for error in validate(self.root)))

    def test_completed_eval_without_evidence_fails(self) -> None:
        self.write_json("skills/evals/choosing-a-visualization-maui-parcels/scenario.json", {
            "status": "complete", "evidence": None, "request": "Make a map."
        })
        self.assertTrue(any("must remain not-run" in error for error in validate(self.root)))


if __name__ == "__main__":
    unittest.main()
