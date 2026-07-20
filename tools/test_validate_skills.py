#!/usr/bin/env python3
"""Regression tests for tools/validate_skills.py."""

from __future__ import annotations

import json
import hashlib
import shutil
import tempfile
import unittest
from pathlib import Path

from tools.validate_skills import REQUIRED_COVERAGE, canonical_sha256, sha256, validate, validate_follow_on_judge


def load_json_for_test(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


class ValidateSkillsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "skills" / "demo").mkdir(parents=True)
        (self.root / "skills" / "contracts").mkdir()
        eval_root = self.root / "skills" / "evals" / "choosing-a-visualization-maui-parcels"
        (eval_root / "run-001").mkdir(parents=True)
        (eval_root / "run-002").mkdir(parents=True)
        (eval_root / "run-003").mkdir(parents=True)
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
        self.write_json("skills/evals/choosing-a-visualization-maui-parcels/dataset-profile.json", profile)
        self.write_json("skills/evals/choosing-a-visualization-maui-parcels/aggregate-derivation.json", derivation)
        profile_hash = sha256(eval_root / "dataset-profile.json")
        derivation_hash = sha256(eval_root / "aggregate-derivation.json")
        for run_id in ("run-001", "run-002", "run-003"):
            metadata = {
                "runId": run_id, "skillRevision": "a" * 40,
                "modelIdentity": {"status": "not-exposed", "value": None},
                "harnessIdentity": {"status": "not-exposed", "value": None},
                "execution": {"mode": "tool-less-cold-plan-judgment", "mcpEndpointConnected": False, "toolsExecuted": False, "previewRendered": False},
                "profileSnapshot": {"arcgisItemId": None, "itemModifiedEpochMs": 1, "layerLastEditEpochMs": 2, "datasetProfileSha256": profile_hash, "derivationArtifactSha256": derivation_hash}
            }
            rubric = {
                "scoreRange": [0, 2], "axes": [{"id": "form", "anchors": {"0": "bad", "1": "partial", "2": "good"}}]
            }
            if run_id in {"run-002", "run-003"}:
                rubric["materialLift"] = {"minimumTreatmentTotal": 1, "minimumTreatmentMinusBaseline": 1, "minimumTreatmentAxisScore": 1, "noHardFailure": True}
            if run_id == "run-003":
                metadata["modelIdentity"] = {"status": "exposed", "value": "test-model"}
                metadata["harnessIdentity"] = {"status": "exposed", "value": "test-harness"}
            scenario = {
                "runId": run_id, "runMetadata": "run-metadata.json", "runMetadataSha256": canonical_sha256(metadata),
                "status": "not-run", "evidence": None, "request": "Make a map.", "requiredArtifacts": ["run-metadata.json", "scenario.json", "rubric.json", "../dataset-profile.json", "../aggregate-derivation.json"]
            }
            self.write_json(f"skills/evals/choosing-a-visualization-maui-parcels/{run_id}/run-metadata.json", metadata)
            self.write_json(f"skills/evals/choosing-a-visualization-maui-parcels/{run_id}/rubric.json", rubric)
            self.write_json(f"skills/evals/choosing-a-visualization-maui-parcels/{run_id}/scenario.json", scenario)

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
        self.write_json("skills/evals/choosing-a-visualization-maui-parcels/run-001/scenario.json", {
            "status": "completed", "evidence": None, "request": "Make a map."
        })
        self.assertTrue(any("requires evidence" in error for error in validate(self.root)))

    def test_completed_eval_hashes_and_scores_pass(self) -> None:
        eval_root = self.root / "skills/evals/choosing-a-visualization-maui-parcels/run-001"
        for name in ("baseline.json", "treatment.json"):
            (eval_root / name).write_text('{"result":"ok"}', encoding="utf-8")
        self.write_json("skills/evals/choosing-a-visualization-maui-parcels/run-001/judge.json", {
            "scores": {
                "baseline": {"form": 2, "total": 2},
                "treatment": {"form": 2, "total": 2}
            },
            "judgment": {"expansionGateMet": True, "materialImprovement": True}
        })
        self.write_json("skills/evals/choosing-a-visualization-maui-parcels/run-001/adjudication.json", {
            "runId": "run-001",
            "originalJudgeSha256": sha256(eval_root / "judge.json"),
            "adjudicatedScores": {
                "baseline": {"form": 2, "total": 2},
                "treatment": {"form": 2, "total": 2}
            },
            "finalJudgment": {"materialImprovement": True, "expansionGateMet": True}
        })
        digest = hashlib.sha256(b'{"result":"ok"}').hexdigest()
        response = {"sha256": digest, "scores": {"form": 2}, "total": 2}
        scenario = {
            "status": "completed", "request": "Make a map.",
            "evidence": {
                "responses": {
                    "baseline": response | {"path": "baseline.json"},
                    "treatment": response | {"path": "treatment.json"}
                },
                "judgeResult": "judge.json",
                "judgeSha256": sha256(eval_root / "judge.json"),
                "reviewAdjudication": "adjudication.json",
                "reviewAdjudicationSha256": sha256(eval_root / "adjudication.json"),
                "materialLift": True,
                "expansionGateMet": True
            }
        }
        metadata = load_json_for_test(eval_root / "run-metadata.json")
        scenario.update({"runId": "run-001", "runMetadata": "run-metadata.json", "runMetadataSha256": canonical_sha256(metadata), "requiredArtifacts": ["run-metadata.json", "scenario.json", "rubric.json", "baseline.json", "treatment.json", "judge.json", "../dataset-profile.json", "../aggregate-derivation.json"]})
        self.write_json("skills/evals/choosing-a-visualization-maui-parcels/run-001/scenario.json", scenario)
        self.assertEqual([], validate(self.root))

    def test_completed_eval_rejects_bad_hash(self) -> None:
        eval_root = self.root / "skills/evals/choosing-a-visualization-maui-parcels/run-001"
        for name in ("baseline.json", "treatment.json", "judge.json"):
            (eval_root / name).write_text('{}', encoding="utf-8")
        response = {"sha256": "0" * 64, "scores": {"form": 2}, "total": 2}
        metadata = load_json_for_test(eval_root / "run-metadata.json")
        self.write_json("skills/evals/choosing-a-visualization-maui-parcels/run-001/scenario.json", {
            "runId": "run-001", "runMetadata": "run-metadata.json", "runMetadataSha256": canonical_sha256(metadata),
            "requiredArtifacts": ["run-metadata.json", "scenario.json", "rubric.json", "baseline.json", "treatment.json", "judge.json", "../dataset-profile.json", "../aggregate-derivation.json"],
            "status": "completed", "request": "Make a map.", "evidence": {
                "responses": {
                    "baseline": response | {"path": "baseline.json"},
                    "treatment": response | {"path": "treatment.json"}
                }, "judgeResult": "judge.json", "judgeSha256": sha256(eval_root / "judge.json")
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

    def test_third_run_requires_exposed_identity(self) -> None:
        metadata_path = self.root / "skills/evals/choosing-a-visualization-maui-parcels/run-003/run-metadata.json"
        metadata = load_json_for_test(metadata_path)
        metadata["modelIdentity"] = {"status": "not-exposed", "value": None}
        self.write_json("skills/evals/choosing-a-visualization-maui-parcels/run-003/run-metadata.json", metadata)
        scenario = load_json_for_test(self.root / "skills/evals/choosing-a-visualization-maui-parcels/run-003/scenario.json")
        scenario["runMetadataSha256"] = canonical_sha256(metadata)
        self.write_json("skills/evals/choosing-a-visualization-maui-parcels/run-003/scenario.json", scenario)
        self.assertTrue(any("run-003 modelIdentity must record the pinned exposed identity" in error for error in validate(self.root)))

    @staticmethod
    def follow_on_judge_fixture() -> tuple[dict, dict, dict[str, set[str]]]:
        groups = {skill: {f"{skill}-axis-{index}" for index in range(4)} for skill in ("layer", "query", "publishing")}
        scores = {
            arm: {
                skill: {axis: value for axis in axes} | {"total": value * 4}
                for skill, axes in groups.items()
            }
            for arm, value in (("baseline", 1), ("treatment", 2))
        }
        hard_failures = {arm: {skill: [] for skill in groups} for arm in ("baseline", "treatment")}
        return scores, hard_failures, groups

    def test_follow_on_judge_accepts_complete_evidence(self) -> None:
        scores, hard_failures, groups = self.follow_on_judge_fixture()
        errors, _, per_skill = validate_follow_on_judge(scores, hard_failures, groups, [0, 2])
        self.assertEqual([], errors)
        self.assertTrue(all(result["expansionGateMet"] for result in per_skill.values()))

    def test_follow_on_judge_allows_a_baseline_hard_failure(self) -> None:
        scores, hard_failures, groups = self.follow_on_judge_fixture()
        hard_failures["baseline"]["query"] = ["Baseline omitted the executable workflow."]
        errors, thresholds, per_skill = validate_follow_on_judge(scores, hard_failures, groups, [0, 2])
        self.assertEqual([], errors)
        self.assertTrue(thresholds["query"]["noHardFailure"]["passed"])
        self.assertTrue(per_skill["query"]["expansionGateMet"])

    def test_follow_on_judge_rejects_missing_hard_failures(self) -> None:
        scores, hard_failures, groups = self.follow_on_judge_fixture()
        del hard_failures["treatment"]["query"]
        errors, _, per_skill = validate_follow_on_judge(scores, hard_failures, groups, [0, 2])
        self.assertTrue(any("treatment hardFailures must cover every skill exactly" in error for error in errors))
        self.assertFalse(per_skill["query"]["expansionGateMet"])

    def test_follow_on_judge_rejects_out_of_range_balanced_scores(self) -> None:
        scores, hard_failures, groups = self.follow_on_judge_fixture()
        query_axes = sorted(groups["query"])
        scores["treatment"]["query"][query_axes[0]] = 3
        scores["treatment"]["query"][query_axes[1]] = 1
        errors, _, per_skill = validate_follow_on_judge(scores, hard_failures, groups, [0, 2])
        self.assertTrue(any("query treatment axis score is outside the rubric range" in error for error in errors))
        self.assertFalse(per_skill["query"]["expansionGateMet"])

    def test_follow_on_completed_evidence_rejects_widened_score_range(self) -> None:
        source_root = Path(__file__).resolve().parents[1]
        mutated_root = self.root / "mutated-corpus"
        shutil.copytree(source_root / "skills", mutated_root / "skills")
        shutil.copytree(source_root / "spec", mutated_root / "spec")
        run_root = mutated_root / "skills" / "evals" / "follow-on-skills" / "run-002"

        rubric = load_json_for_test(run_root / "rubric.json")
        rubric["scoreRange"] = [0, 100]
        (run_root / "rubric.json").write_text(json.dumps(rubric), encoding="utf-8")

        judge = load_json_for_test(run_root / "judge-result.json")
        for arm, value in (("baseline", 50), ("treatment", 100)):
            for score in judge["scores"][arm].values():
                for axis in tuple(key for key in score if key != "total"):
                    score[axis] = value
                score["total"] = value * 4
        thresholds = {}
        per_skill = {}
        for skill in judge["scores"]["treatment"]:
            thresholds[skill] = {
                "minimumTreatmentTotal": {"required": 6, "actual": 400, "passed": True},
                "minimumTreatmentMinusBaseline": {"required": 2, "actual": 200, "passed": True},
                "minimumTreatmentAxisScore": {"required": 1, "actual": 100, "passed": True},
                "noHardFailure": {"required": True, "actual": True, "passed": True},
            }
            per_skill[skill] = {"baselineTotal": 200, "treatmentTotal": 400, "materialImprovement": True, "expansionGateMet": True}
        final_judgment = {"perSkill": per_skill, "materialImprovement": True, "expansionGateMet": True}
        judge["thresholdEvaluation"] = thresholds
        judge["judgment"] = final_judgment
        (run_root / "judge-result.json").write_text(json.dumps(judge), encoding="utf-8")

        adjudication = load_json_for_test(run_root / "review-adjudication.json")
        adjudication["originalJudgeSha256"] = canonical_sha256(judge)
        adjudication["adjudicatedScores"] = judge["scores"]
        adjudication["thresholdEvaluation"] = thresholds
        adjudication["finalJudgment"] = final_judgment
        (run_root / "review-adjudication.json").write_text(json.dumps(adjudication), encoding="utf-8")

        scenario = load_json_for_test(run_root / "scenario.json")
        scenario["evidence"]["judgeSha256"] = canonical_sha256(judge)
        scenario["evidence"]["reviewAdjudicationSha256"] = canonical_sha256(adjudication)
        scenario["evidence"]["perSkill"] = per_skill
        scenario["evidence"]["materialLift"] = True
        scenario["evidence"]["expansionGateMet"] = True
        (run_root / "scenario.json").write_text(json.dumps(scenario), encoding="utf-8")

        errors = validate(mutated_root)
        self.assertTrue(any("run-002 scoreRange must be exactly [0, 2]" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
