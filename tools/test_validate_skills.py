#!/usr/bin/env python3
"""Regression tests for tools/validate_skills.py."""

from __future__ import annotations

import json
import hashlib
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
        profile = {
            "derivationArtifact": "aggregate-derivation.json",
            "source": {"itemModifiedEpochMs": 1, "layerLastEditEpochMs": 2},
            "geometry": {"featureCount": 3},
            "fields": {
                field: {"nonNullCount": 1, "min": 0, "max": 2, "mean": 1}
                for field in ("landvalue", "bldgvalue", "taxacres", "gisacres")
            } | {"nhoodcode": {"distinctNonNullCount": 4}}
        }
        derivation = {
            "source": {"itemModifiedEpochMs": 1, "layerLastEditEpochMs": 2},
            "queries": {
                "featureCount": {"parameters": {"f": "json", "where": "1=1", "returnCountOnly": "true"}, "response": {"count": 3}},
                "statistics": {
                    "parameters": {"f": "json", "where": "1=1", "returnGeometry": "false", "outStatistics": [{}] * 16},
                    "response": {"attributes": {
                        f"{prefix}_{field}": value
                        for field in ("landvalue", "bldgvalue", "taxacres", "gisacres")
                        for prefix, value in (("count", 1), ("min", 0), ("max", 2), ("avg", 1))
                    }}
                },
                "neighborhoodDistinctCount": {"response": {"count": 4}}
            }
        }
        for name, value in {
            "scenario.json": {"status": "not-run", "evidence": None, "request": "Make a map."},
            "dataset-profile.json": profile, "aggregate-derivation.json": derivation,
            "rubric.json": {"scoreRange": [0, 2], "axes": [{"id": "form"}]}
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
            "status": "completed", "evidence": None, "request": "Make a map."
        })
        self.assertTrue(any("requires evidence" in error for error in validate(self.root)))

    def test_completed_eval_hashes_and_scores_pass(self) -> None:
        eval_root = self.root / "skills/evals/choosing-a-visualization-maui-parcels"
        for name in ("baseline.json", "treatment.json", "judge.json"):
            (eval_root / name).write_text('{"result":"ok"}', encoding="utf-8")
        digest = hashlib.sha256(b'{"result":"ok"}').hexdigest()
        response = {"sha256": digest, "scores": {"form": 2}, "total": 2}
        scenario = {
            "status": "completed", "request": "Make a map.",
            "evidence": {
                "responses": {
                    "baseline": response | {"path": "baseline.json"},
                    "treatment": response | {"path": "treatment.json"}
                },
                "judgeResult": "judge.json"
            }
        }
        self.write_json("skills/evals/choosing-a-visualization-maui-parcels/scenario.json", scenario)
        self.assertEqual([], validate(self.root))

    def test_completed_eval_rejects_bad_hash(self) -> None:
        eval_root = self.root / "skills/evals/choosing-a-visualization-maui-parcels"
        for name in ("baseline.json", "treatment.json", "judge.json"):
            (eval_root / name).write_text('{}', encoding="utf-8")
        response = {"sha256": "0" * 64, "scores": {"form": 2}, "total": 2}
        self.write_json("skills/evals/choosing-a-visualization-maui-parcels/scenario.json", {
            "status": "completed", "request": "Make a map.", "evidence": {
                "responses": {
                    "baseline": response | {"path": "baseline.json"},
                    "treatment": response | {"path": "treatment.json"}
                }, "judgeResult": "judge.json"
            }
        })
        self.assertTrue(any("SHA-256" in error for error in validate(self.root)))

    def test_catalog_is_checked_against_its_schema(self) -> None:
        self.write_json("skills/catalog.schema.json", {"const": {"impossible": True}})
        self.assertTrue(any("does not satisfy const" in error for error in validate(self.root)))

    def test_declared_tool_requires_contract_assertion(self) -> None:
        contract = {"assertions": []}
        self.write_json("skills/contracts/live-surface.json", contract)
        self.assertTrue(any("lack live-surface assertions" in error for error in validate(self.root)))


if __name__ == "__main__":
    unittest.main()
