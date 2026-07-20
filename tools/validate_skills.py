#!/usr/bin/env python3
"""Validate the portable geospatial-mcp agent skills corpus."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

REQUIRED_COVERAGE = {
    "choosing-visualization", "layer-composition", "query-shaping", "publishing", "anti-patterns"
}
NAME_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
FRONTMATTER_RE = re.compile(r"\A---\r?\n(.*?)\r?\n---\r?\n", re.DOTALL)


def load_json(path: Path, errors: list[str]) -> object | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"{path}: cannot load JSON: {exc}")
        return None


def validate_json_schema(instance: object, schema: dict, root: dict, path: str = "$") -> list[str]:
    """Validate the JSON Schema subset used by the skills catalog."""
    errors: list[str] = []
    if "$ref" in schema:
        reference = schema["$ref"]
        if not isinstance(reference, str) or not reference.startswith("#/"):
            return [f"{path}: unsupported schema reference {reference!r}"]
        target: object = root
        for segment in reference[2:].split("/"):
            if not isinstance(target, dict) or segment not in target:
                return [f"{path}: unresolved schema reference {reference}"]
            target = target[segment]
        return validate_json_schema(instance, target, root, path) if isinstance(target, dict) else [f"{path}: invalid schema reference {reference}"]

    expected_type = schema.get("type")
    type_checks = {
        "object": lambda value: isinstance(value, dict),
        "array": lambda value: isinstance(value, list),
        "string": lambda value: isinstance(value, str),
        "number": lambda value: isinstance(value, (int, float)) and not isinstance(value, bool),
        "integer": lambda value: isinstance(value, int) and not isinstance(value, bool),
        "boolean": lambda value: isinstance(value, bool),
        "null": lambda value: value is None,
    }
    if expected_type in type_checks and not type_checks[expected_type](instance):
        return [f"{path}: expected {expected_type}"]
    if "const" in schema and instance != schema["const"]:
        errors.append(f"{path}: does not satisfy const {schema['const']!r}")
    if "enum" in schema and instance not in schema["enum"]:
        errors.append(f"{path}: value {instance!r} is not in enum")
    if isinstance(instance, str) and "pattern" in schema and not re.search(schema["pattern"], instance):
        errors.append(f"{path}: value does not match pattern {schema['pattern']!r}")
    if isinstance(instance, dict):
        properties = schema.get("properties", {})
        for required in schema.get("required", []):
            if required not in instance:
                errors.append(f"{path}: missing required property {required!r}")
        if schema.get("additionalProperties") is False:
            for key in set(instance) - set(properties):
                errors.append(f"{path}: unexpected property {key!r}")
        for key, value in instance.items():
            child = properties.get(key)
            if isinstance(child, dict):
                errors.extend(validate_json_schema(value, child, root, f"{path}.{key}"))
    if isinstance(instance, list):
        if len(instance) < schema.get("minItems", 0):
            errors.append(f"{path}: has fewer than {schema['minItems']} items")
        if schema.get("uniqueItems") and len({json.dumps(value, sort_keys=True) for value in instance}) != len(instance):
            errors.append(f"{path}: items must be unique")
        child = schema.get("items")
        if isinstance(child, dict):
            for index, value in enumerate(instance):
                errors.extend(validate_json_schema(value, child, root, f"{path}[{index}]"))
    return errors


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_sha256(value: object) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def frontmatter(path: Path, errors: list[str]) -> dict[str, str]:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        errors.append(f"{path}: cannot read skill: {exc}")
        return {}
    match = FRONTMATTER_RE.match(text)
    if not match:
        errors.append(f"{path}: missing YAML frontmatter")
        return {}
    values: dict[str, str] = {}
    for line in match.group(1).splitlines():
        key, separator, value = line.partition(":")
        if not separator:
            errors.append(f"{path}: invalid frontmatter line: {line}")
            continue
        values[key.strip()] = value.strip().strip('"').strip("'")
    if set(values) != {"name", "description"}:
        errors.append(f"{path}: frontmatter must contain only name and description")
    if "Use when " not in values.get("description", ""):
        errors.append(f"{path}: description must state 'Use when ...'")
    if "## Anti-patterns" not in text:
        errors.append(f"{path}: rubric must include an Anti-patterns section")
    return values


def validate_follow_on_judge(
    judge_scores: object,
    hard_failures: object,
    axis_groups: dict[str, set[str]],
    score_range: object,
) -> tuple[list[str], dict[str, dict], dict[str, dict]]:
    """Validate and recompute the follow-on evaluation's per-skill gates."""
    errors: list[str] = []
    thresholds: dict[str, dict] = {}
    per_skill: dict[str, dict] = {}
    arms = {"baseline", "treatment"}
    skills = set(axis_groups)
    valid_range = (
        isinstance(score_range, list)
        and len(score_range) == 2
        and all(isinstance(value, int) and not isinstance(value, bool) for value in score_range)
        and score_range[0] <= score_range[1]
    )
    if not valid_range:
        errors.append("Follow-on scoreRange must contain two ordered integers")
        minimum_score, maximum_score = 0, -1
    else:
        minimum_score, maximum_score = score_range
    if not isinstance(judge_scores, dict) or set(judge_scores) != arms:
        errors.append("Follow-on judge scores must contain exactly baseline and treatment")
        judge_scores = {}
    if not isinstance(hard_failures, dict) or set(hard_failures) != arms:
        errors.append("Follow-on hardFailures must contain exactly baseline and treatment")
        hard_failures = {}
    for arm in arms:
        arm_scores = judge_scores.get(arm, {}) if isinstance(judge_scores, dict) else {}
        arm_failures = hard_failures.get(arm, {}) if isinstance(hard_failures, dict) else {}
        if not isinstance(arm_scores, dict) or set(arm_scores) != skills:
            errors.append(f"Follow-on {arm} scores must cover every skill exactly")
            arm_scores = {}
        if not isinstance(arm_failures, dict) or set(arm_failures) != skills:
            errors.append(f"Follow-on {arm} hardFailures must cover every skill exactly")
            arm_failures = {}
        for skill in skills:
            failures = arm_failures.get(skill)
            if not isinstance(failures, list) or any(not isinstance(value, str) for value in failures):
                errors.append(f"Follow-on {skill} {arm} hardFailures must be a string array")
            score = arm_scores.get(skill, {})
            expected_keys = axis_groups[skill] | {"total"}
            if not isinstance(score, dict) or set(score) != expected_keys:
                errors.append(f"Follow-on {skill} {arm} scores must cover every axis and total exactly")
                continue
            axis_values = [score.get(axis) for axis in axis_groups[skill]]
            if any(not isinstance(value, int) or isinstance(value, bool) or not minimum_score <= value <= maximum_score for value in axis_values):
                errors.append(f"Follow-on {skill} {arm} axis score is outside the rubric range")
            if not isinstance(score.get("total"), int) or isinstance(score.get("total"), bool) or score.get("total") != sum(value for value in axis_values if isinstance(value, int) and not isinstance(value, bool)):
                errors.append(f"Follow-on {skill} {arm} total is inconsistent")
    for skill in skills:
        baseline = judge_scores.get("baseline", {}).get(skill, {}) if isinstance(judge_scores, dict) else {}
        treatment = judge_scores.get("treatment", {}).get(skill, {}) if isinstance(judge_scores, dict) else {}
        baseline_total = baseline.get("total") if isinstance(baseline, dict) else None
        treatment_total = treatment.get("total") if isinstance(treatment, dict) else None
        treatment_axes = [treatment.get(axis) for axis in axis_groups[skill]] if isinstance(treatment, dict) else []
        baseline_failures = hard_failures.get("baseline", {}).get(skill) if isinstance(hard_failures, dict) and isinstance(hard_failures.get("baseline"), dict) else None
        treatment_failures = hard_failures.get("treatment", {}).get(skill) if isinstance(hard_failures, dict) and isinstance(hard_failures.get("treatment"), dict) else None
        no_hard_failure = isinstance(baseline_failures, list) and isinstance(treatment_failures, list) and not baseline_failures and not treatment_failures
        valid_axes = len(treatment_axes) == len(axis_groups[skill]) and all(isinstance(value, int) and not isinstance(value, bool) and minimum_score <= value <= maximum_score for value in treatment_axes)
        conditions = {
            "minimumTreatmentTotal": {"required": 6, "actual": treatment_total, "passed": isinstance(treatment_total, int) and not isinstance(treatment_total, bool) and treatment_total >= 6},
            "minimumTreatmentMinusBaseline": {"required": 2, "actual": treatment_total - baseline_total if isinstance(treatment_total, int) and not isinstance(treatment_total, bool) and isinstance(baseline_total, int) and not isinstance(baseline_total, bool) else None, "passed": isinstance(treatment_total, int) and not isinstance(treatment_total, bool) and isinstance(baseline_total, int) and not isinstance(baseline_total, bool) and treatment_total - baseline_total >= 2},
            "minimumTreatmentAxisScore": {"required": 1, "actual": min(treatment_axes) if valid_axes else None, "passed": valid_axes and min(treatment_axes) >= 1},
            "noHardFailure": {"required": True, "actual": no_hard_failure, "passed": no_hard_failure},
        }
        passed = not errors and all(condition["passed"] for condition in conditions.values())
        thresholds[skill] = conditions
        per_skill[skill] = {"baselineTotal": baseline_total, "treatmentTotal": treatment_total, "materialImprovement": passed, "expansionGateMet": passed}
    return errors, thresholds, per_skill


def validate(root: Path) -> list[str]:
    errors: list[str] = []
    skills_root = root / "skills"
    catalog = load_json(skills_root / "catalog.json", errors)
    catalog_schema = load_json(skills_root / "catalog.schema.json", errors)
    index = load_json(root / "spec" / "schemas" / "index.json", errors)
    contract = load_json(skills_root / "contracts" / "live-surface.json", errors)
    if not all(isinstance(value, dict) for value in (catalog, catalog_schema, index, contract)):
        return sorted(errors)

    assert isinstance(catalog, dict) and isinstance(catalog_schema, dict)
    assert isinstance(index, dict) and isinstance(contract, dict)
    errors.extend(f"skills/catalog.json: {error}" for error in validate_json_schema(catalog, catalog_schema, catalog_schema))
    if catalog.get("license") != "Apache-2.0":
        errors.append("skills/catalog.json: license must be Apache-2.0")
    if catalog.get("specVersion") != "1.0":
        errors.append("skills/catalog.json: specVersion must match SPEC_VERSION 1.0")

    standard_tools = {
        tool.get("standardName") for tool in index.get("tools", []) if isinstance(tool, dict)
    }
    entries = catalog.get("skills", [])
    if not isinstance(entries, list) or not entries:
        errors.append("skills/catalog.json: skills must be a non-empty array")
        return sorted(errors)

    names: set[str] = set()
    all_coverage: set[str] = set()
    declared_tools: dict[str, set[str]] = {}
    for entry in entries:
        if not isinstance(entry, dict):
            errors.append("skills/catalog.json: each skill must be an object")
            continue
        name = entry.get("name")
        if not isinstance(name, str) or not NAME_RE.fullmatch(name):
            errors.append(f"skills/catalog.json: invalid skill name {name!r}")
            continue
        if name in names:
            errors.append(f"skills/catalog.json: duplicate skill {name}")
        names.add(name)
        if entry.get("path") != name:
            errors.append(f"skills/catalog.json: path for {name} must equal its name")
        if not str(entry.get("description", "")).startswith("Use when "):
            errors.append(f"skills/catalog.json: {name} description must start with 'Use when '")
        coverage = entry.get("coverage", [])
        if not isinstance(coverage, list):
            errors.append(f"skills/catalog.json: {name} coverage must be an array")
            coverage = []
        all_coverage.update(value for value in coverage if isinstance(value, str))
        tools = entry.get("standardTools", [])
        if not isinstance(tools, list):
            errors.append(f"skills/catalog.json: {name} standardTools must be an array")
            tools = []
        declared_tools[name] = {value for value in tools if isinstance(value, str)}
        unknown = declared_tools[name] - standard_tools
        if unknown:
            errors.append(f"skills/catalog.json: {name} has unknown standard tools: {sorted(unknown)}")
        skill_file = skills_root / name / "SKILL.md"
        metadata = frontmatter(skill_file, errors)
        if metadata.get("name") != name:
            errors.append(f"{skill_file}: frontmatter name must be {name}")

    missing_coverage = REQUIRED_COVERAGE - all_coverage
    if missing_coverage:
        errors.append(f"skills/catalog.json: missing coverage: {sorted(missing_coverage)}")

    assertions = contract.get("assertions", [])
    if not isinstance(assertions, list) or not assertions:
        errors.append("skills/contracts/live-surface.json: assertions must be non-empty")
        assertions = []
    covered_tools: dict[str, set[str]] = {name: set() for name in names}
    for assertion in assertions:
        if not isinstance(assertion, dict):
            errors.append("skills/contracts/live-surface.json: assertion must be an object")
            continue
        skill = assertion.get("skill")
        tool = assertion.get("standardTool")
        if skill not in names:
            errors.append(f"live-surface assertion references unknown skill {skill!r}")
            continue
        if tool not in declared_tools.get(str(skill), set()):
            errors.append(f"live-surface assertion for {skill} references undeclared tool {tool!r}")
            continue
        covered_tools[str(skill)].add(str(tool))
        schema_path = root / "spec" / "schemas" / "tools" / f"{tool}.schema.json"
        schema = load_json(schema_path, errors)
        if not isinstance(schema, dict):
            continue
        properties = schema.get("properties", {})
        actual_required = set(schema.get("required", []))
        expected_required = set(assertion.get("requiredFields", []))
        if expected_required != actual_required:
            errors.append(f"{tool}: required fields drift: contract={sorted(expected_required)} schema={sorted(actual_required)}")
        missing = set(assertion.get("requiredProperties", [])) - set(properties)
        if missing:
            errors.append(f"{tool}: contract properties missing from schema: {sorted(missing)}")
        present_forbidden = set(assertion.get("forbiddenProperties", [])) & set(properties)
        if present_forbidden:
            errors.append(f"{tool}: forbidden properties appeared in schema: {sorted(present_forbidden)}")
        fallback = assertion.get("fallbackTool")
        if assertion.get("profile") != "base" and fallback not in standard_tools:
            errors.append(f"{tool}: optional-profile assertion requires a canonical fallbackTool")
    for skill, tools in declared_tools.items():
        uncovered = tools - covered_tools.get(skill, set())
        if uncovered:
            errors.append(f"skills/catalog.json: {skill} tools lack live-surface assertions: {sorted(uncovered)}")

    eval_root = skills_root / "evals" / "choosing-a-visualization-maui-parcels"
    profile = load_json(eval_root / "dataset-profile.json", errors)
    derivation_path = eval_root / "aggregate-derivation.json"
    expected_runs = {"run-001", "run-002", "run-003"}
    actual_runs = {path.name for path in eval_root.iterdir() if path.is_dir() and path.name.startswith("run-")}
    if actual_runs != expected_runs:
        errors.append(f"Maui evaluation runs must be exactly {sorted(expected_runs)}")
    for run_id in sorted(expected_runs):
        run_root = eval_root / run_id
        scenario = load_json(run_root / "scenario.json", errors)
        rubric = load_json(run_root / "rubric.json", errors)
        metadata = load_json(run_root / "run-metadata.json", errors)
        if not all(isinstance(value, dict) for value in (scenario, rubric, metadata)):
            continue
        assert isinstance(scenario, dict) and isinstance(rubric, dict) and isinstance(metadata, dict)
        if scenario.get("runId") != run_id or metadata.get("runId") != run_id:
            errors.append(f"Maui {run_id} identifiers do not agree")
        if scenario.get("runMetadata") != "run-metadata.json":
            errors.append(f"Maui {run_id} must reference its run metadata")
        if scenario.get("runMetadataSha256") != canonical_sha256(metadata):
            errors.append(f"Maui {run_id} canonical run-metadata SHA-256 does not match")
        if not re.fullmatch(r"[0-9a-f]{40}", str(metadata.get("skillRevision", ""))):
            errors.append(f"Maui {run_id} requires a full skill revision")
        for identity_key in ("modelIdentity", "harnessIdentity"):
            identity = metadata.get(identity_key)
            if run_id == "run-003":
                if not isinstance(identity, dict) or identity.get("status") != "exposed" or not identity.get("value"):
                    errors.append(f"Maui {run_id} {identity_key} must record the pinned exposed identity")
            elif identity != {"status": "not-exposed", "value": None}:
                errors.append(f"Maui {run_id} {identity_key} must truthfully record not-exposed without an invented value")
        execution = metadata.get("execution", {})
        if execution != {"mode": "tool-less-cold-plan-judgment", "mcpEndpointConnected": False, "toolsExecuted": False, "previewRendered": False}:
            errors.append(f"Maui {run_id} must record the tool-less execution mode exactly")
        snapshot = metadata.get("profileSnapshot", {})
        source = profile.get("source", {}) if isinstance(profile, dict) else {}
        if snapshot.get("arcgisItemId") != source.get("arcgisItemId") or snapshot.get("itemModifiedEpochMs") != source.get("itemModifiedEpochMs") or snapshot.get("layerLastEditEpochMs") != source.get("layerLastEditEpochMs"):
            errors.append(f"Maui {run_id} profile snapshot identifiers drifted")
        if snapshot.get("datasetProfileSha256") != sha256(eval_root / "dataset-profile.json") or snapshot.get("derivationArtifactSha256") != sha256(derivation_path):
            errors.append(f"Maui {run_id} profile artifact SHA-256 does not match")
        required_artifacts = scenario.get("requiredArtifacts")
        if not isinstance(required_artifacts, list) or not required_artifacts:
            errors.append(f"Maui {run_id} must declare required artifacts")
        else:
            for relative in required_artifacts:
                artifact_path = (run_root / str(relative)).resolve()
                if eval_root.resolve() not in (artifact_path, *artifact_path.parents) or not artifact_path.is_file():
                    errors.append(f"Maui {run_id} required artifact is missing or escapes the eval root: {relative}")
        if run_id in {"run-002", "run-003"}:
            axes = rubric.get("axes", [])
            for axis in axes if isinstance(axes, list) else []:
                if not isinstance(axis, dict) or set(axis.get("anchors", {})) != {"0", "1", "2"}:
                    errors.append(f"Maui {run_id} every rubric axis requires explicit 0/1/2 anchors")
            lift = rubric.get("materialLift")
            required_lift = {"minimumTreatmentTotal", "minimumTreatmentMinusBaseline", "minimumTreatmentAxisScore", "noHardFailure"}
            if not isinstance(lift, dict) or set(lift) != required_lift:
                errors.append(f"Maui {run_id} must predeclare the complete material-lift threshold")
        status = scenario.get("status")
        if status not in {"not-run", "completed"}:
            errors.append(f"Maui {run_id} status must be not-run or completed")
        if not scenario.get("request"):
            errors.append(f"Maui {run_id} must contain an exact request")
        evidence = scenario.get("evidence")
        if status == "not-run" and evidence is not None:
            errors.append(f"Maui {run_id} not-run evaluation must not claim evidence")
        if status == "not-run":
            for relative in scenario.get("expectedArtifactsOnCompletion", []):
                if (run_root / str(relative)).exists():
                    errors.append(f"Maui {run_id} not-run evaluation must not contain output artifact {relative}")
        if status == "completed":
            if not isinstance(evidence, dict) or not isinstance(rubric, dict):
                errors.append("Maui completed evaluation requires evidence and rubric objects")
            else:
                responses = evidence.get("responses")
                axes = {axis.get("id") for axis in rubric.get("axes", []) if isinstance(axis, dict)}
                score_range = rubric.get("scoreRange", [0, 0])
                if not isinstance(responses, dict) or set(responses) != {"baseline", "treatment"}:
                    errors.append("Maui completed evidence requires baseline and treatment responses")
                else:
                    for label, response in responses.items():
                        if not isinstance(response, dict):
                            errors.append(f"Maui {run_id} {label} evidence must be an object")
                            continue
                        relative = response.get("path")
                        response_path = (run_root / str(relative)).resolve()
                        if response_path.parent != run_root.resolve() or not response_path.is_file():
                            errors.append(f"Maui {run_id} {label} response path is missing or escapes the run directory")
                        elif (canonical_sha256(load_json(response_path, errors)) if run_id == "run-003" else sha256(response_path)) != str(response.get("sha256", "")).lower():
                            errors.append(f"Maui {run_id} {label} response SHA-256 does not match")
                        scores = response.get("scores")
                        if not isinstance(scores, dict) or set(scores) != axes:
                            errors.append(f"Maui {run_id} {label} scores must cover every rubric axis exactly")
                        elif any(not isinstance(value, int) or not score_range[0] <= value <= score_range[1] for value in scores.values()):
                            errors.append(f"Maui {run_id} {label} score is outside the rubric range")
                        elif response.get("total") != sum(scores.values()):
                            errors.append(f"Maui {run_id} {label} total does not equal its axis scores")
                judge_path = (run_root / str(evidence.get("judgeResult"))).resolve()
                judge = load_json(judge_path, errors) if judge_path.parent == run_root.resolve() and judge_path.is_file() else None
                if not isinstance(judge, dict):
                    errors.append(f"Maui {run_id} completed evidence requires a local judge result")
                elif isinstance(responses, dict):
                    expected_judge_sha = canonical_sha256(judge) if run_id == "run-003" else sha256(judge_path)
                    if evidence.get("judgeSha256") != expected_judge_sha:
                        errors.append(f"Maui {run_id} judge SHA-256 does not match")
                    judge_scores = judge.get("scores", {})
                    for label in ("baseline", "treatment"):
                        expected = responses.get(label, {})
                        actual = judge_scores.get(label, {})
                        if actual.get("total") != expected.get("total") or {key: value for key, value in actual.items() if key != "total"} != expected.get("scores"):
                            errors.append(f"Maui {run_id} {label} judge scores disagree with scenario evidence")
                    gate_met = judge.get("judgment", {}).get("expansionGateMet")
                    if (evidence.get("outcome") == "expansion-gate-not-met") != (gate_met is False):
                        errors.append(f"Maui {run_id} judge gate outcome disagrees with scenario evidence")
                    if evidence.get("expansionGateMet") is not gate_met:
                        errors.append(f"Maui {run_id} expansionGateMet disagrees with judge result")
                    material = judge.get("judgment", {}).get("materialImprovement")
                    if evidence.get("materialLift") is not material:
                        errors.append(f"Maui {run_id} materialLift disagrees with judge result")
                    if run_id in {"run-002", "run-003"}:
                        lift = rubric.get("materialLift", {})
                        baseline_total = responses.get("baseline", {}).get("total")
                        treatment_total = responses.get("treatment", {}).get("total")
                        treatment_scores = responses.get("treatment", {}).get("scores", {})
                        hard_failures = judge.get("hardFailures", {})
                        conditions = {
                            "minimumTreatmentTotal": {
                                "required": lift.get("minimumTreatmentTotal"),
                                "actual": treatment_total,
                                "passed": isinstance(treatment_total, int) and treatment_total >= lift.get("minimumTreatmentTotal", 10**9),
                            },
                            "minimumTreatmentMinusBaseline": {
                                "required": lift.get("minimumTreatmentMinusBaseline"),
                                "actual": treatment_total - baseline_total if isinstance(treatment_total, int) and isinstance(baseline_total, int) else None,
                                "passed": isinstance(treatment_total, int) and isinstance(baseline_total, int) and treatment_total - baseline_total >= lift.get("minimumTreatmentMinusBaseline", 10**9),
                            },
                            "minimumTreatmentAxisScore": {
                                "required": lift.get("minimumTreatmentAxisScore"),
                                "actual": min(treatment_scores.values()) if treatment_scores else None,
                                "passed": bool(treatment_scores) and min(treatment_scores.values()) >= lift.get("minimumTreatmentAxisScore", 10**9),
                            },
                            "noHardFailure": {
                                "required": lift.get("noHardFailure"),
                                "actual": not any(hard_failures.get(label, []) for label in ("baseline", "treatment")),
                                "passed": not any(hard_failures.get(label, []) for label in ("baseline", "treatment")),
                            },
                        }
                        if judge.get("thresholdEvaluation") != conditions:
                            errors.append(f"Maui {run_id} judge threshold evaluation disagrees with rubric and scores")
                        expected_material = all(condition["passed"] for condition in conditions.values())
                        if material is not expected_material or gate_met is not expected_material:
                            errors.append(f"Maui {run_id} material and expansion results disagree with threshold conditions")
                    adjudication_path = (run_root / str(evidence.get("reviewAdjudication"))).resolve()
                    adjudication = load_json(adjudication_path, errors) if adjudication_path.parent == run_root.resolve() and adjudication_path.is_file() else None
                    if not isinstance(adjudication, dict):
                        errors.append(f"Maui {run_id} completed evidence requires a review adjudication")
                    else:
                        expected_adjudication_sha = canonical_sha256(adjudication) if run_id == "run-003" else sha256(adjudication_path)
                        if evidence.get("reviewAdjudicationSha256") != expected_adjudication_sha:
                            errors.append(f"Maui {run_id} review adjudication SHA-256 does not match")
                        if adjudication.get("runId") != run_id or adjudication.get("originalJudgeSha256") != evidence.get("judgeSha256"):
                            errors.append(f"Maui {run_id} adjudication does not bind the original judge")
                        adjudicated_scores = adjudication.get("adjudicatedScores", {})
                        for label in ("baseline", "treatment"):
                            score = adjudicated_scores.get(label, {})
                            if score.get("total") != sum(value for key, value in score.items() if key != "total"):
                                errors.append(f"Maui {run_id} {label} adjudicated total is inconsistent")
                        final_judgment = adjudication.get("finalJudgment", {})
                        if final_judgment.get("materialImprovement") is not evidence.get("materialLift") or final_judgment.get("expansionGateMet") is not evidence.get("expansionGateMet"):
                            errors.append(f"Maui {run_id} adjudicated outcome disagrees with scenario evidence")

                        if scenario.get("id") == "choosing-a-visualization-maui-parcels-v1":
                            if adjudicated_scores != judge.get("scores"):
                                errors.append("Maui run-001 adjudicated scores must preserve the original judge scores")
                            profile_consistency = adjudication.get("profileConsistency", {})
                            final_count = profile.get("fields", {}).get("nhoodcode", {}).get("distinctNonNullCount") if isinstance(profile, dict) else None
                            raw_baseline = (run_root / "baseline-response.json").read_text(encoding="utf-8")
                            raw_treatment = (run_root / "skill-response.json").read_text(encoding="utf-8")
                            if profile_consistency.get("status") != "reconstructed-inconsistent" or profile_consistency.get("responseNeighborhoodDistinctCount") != 523 or profile_consistency.get("finalProfileNeighborhoodDistinctNonNullCount") != final_count or profile_consistency.get("sameDatasetProfile") is not False:
                                errors.append("Maui run-001 adjudication does not capture the reconstructed profile inconsistency")
                            if "523 categories" not in raw_baseline or "523 codes" not in raw_treatment:
                                errors.append("Maui run-001 preserved responses no longer support the profile inconsistency")
                            if scenario.get("comparison", {}).get("sameDatasetProfile") is not False:
                                errors.append("Maui run-001 scenario must mark sameDatasetProfile false")
                            endpoint = adjudication.get("endpointConsistency", {})
                            original_same_endpoint = judge.get("coldContextPolicy", {}).get("sameEndpointSnapshot")
                            comparison = scenario.get("comparison", {})
                            if original_same_endpoint is not True or endpoint.get("originalJudgeSameEndpointSnapshot") is not True or endpoint.get("originalAssertionValid") is not False or comparison.get("endpointUsed") is not False or comparison.get("sameEndpointSnapshot") is not False:
                                errors.append("Maui run-001 endpoint adjudication is inconsistent")

                        if scenario.get("id") == "choosing-a-visualization-maui-parcels-v2":
                            original_scores = judge.get("scores", {})
                            expected_scores = json.loads(json.dumps(original_scores))
                            for finding in adjudication.get("findings", []):
                                label = finding.get("response")
                                axis = finding.get("axis")
                                if expected_scores.get(label, {}).get(axis) != finding.get("originalScore"):
                                    errors.append("Maui run-002 adjudication original score does not match the judge")
                                    continue
                                expected_scores[label][axis] = finding.get("adjudicatedScore")
                                expected_scores[label]["total"] = sum(value for key, value in expected_scores[label].items() if key != "total")
                            if adjudicated_scores != expected_scores:
                                errors.append("Maui run-002 adjudicated scores do not follow the declared findings")
                            treatment_text = (run_root / "skill-response.json").read_text(encoding="utf-8")
                            if '"operation": "list_layers"' not in treatment_text or "advertised operation schemas" not in treatment_text:
                                errors.append("Maui run-002 preserved treatment no longer supports the list_layers finding")
                            lift = rubric.get("materialLift", {})
                            baseline_total = adjudicated_scores.get("baseline", {}).get("total")
                            treatment = adjudicated_scores.get("treatment", {})
                            treatment_total = treatment.get("total")
                            hard_failures = judge.get("hardFailures", {})
                            adjudicated_conditions = {
                                "minimumTreatmentTotal": {"required": lift.get("minimumTreatmentTotal"), "actual": treatment_total, "passed": treatment_total >= lift.get("minimumTreatmentTotal")},
                                "minimumTreatmentMinusBaseline": {"required": lift.get("minimumTreatmentMinusBaseline"), "actual": treatment_total - baseline_total, "passed": treatment_total - baseline_total >= lift.get("minimumTreatmentMinusBaseline")},
                                "minimumTreatmentAxisScore": {"required": lift.get("minimumTreatmentAxisScore"), "actual": min(value for key, value in treatment.items() if key != "total"), "passed": min(value for key, value in treatment.items() if key != "total") >= lift.get("minimumTreatmentAxisScore")},
                                "noHardFailure": {"required": lift.get("noHardFailure"), "actual": not any(hard_failures.get(label, []) for label in ("baseline", "treatment")), "passed": not any(hard_failures.get(label, []) for label in ("baseline", "treatment"))},
                            }
                            if adjudication.get("thresholdEvaluation") != adjudicated_conditions:
                                errors.append("Maui run-002 adjudicated threshold evaluation is inconsistent")
                            expected_final = all(condition["passed"] for condition in adjudicated_conditions.values())
                            if final_judgment != {"materialImprovement": expected_final, "expansionGateMet": expected_final}:
                                errors.append("Maui run-002 adjudicated final judgment is inconsistent")

                        if scenario.get("id") == "choosing-a-visualization-maui-parcels-v3":
                            original_scores = judge.get("scores", {})
                            expected_scores = json.loads(json.dumps(original_scores))
                            for finding in adjudication.get("findings", []):
                                label = finding.get("response")
                                axis = finding.get("axis")
                                if expected_scores.get(label, {}).get(axis) != finding.get("originalScore"):
                                    errors.append("Maui run-003 adjudication original score does not match the judge")
                                    continue
                                expected_scores[label][axis] = finding.get("adjudicatedScore")
                                expected_scores[label]["total"] = sum(value for key, value in expected_scores[label].items() if key != "total")
                            if adjudicated_scores != expected_scores:
                                errors.append("Maui run-003 adjudicated scores do not follow the declared findings")
                            treatment_text = (run_root / "skill-response.json").read_text(encoding="utf-8")
                            if "`tools/list`" not in treatment_text or "`list_layers`" not in treatment_text:
                                errors.append("Maui run-003 treatment no longer supports distinct tool and layer discovery")
                            lift = rubric.get("materialLift", {})
                            baseline_total = adjudicated_scores.get("baseline", {}).get("total")
                            treatment = adjudicated_scores.get("treatment", {})
                            treatment_total = treatment.get("total")
                            hard_failures = judge.get("hardFailures", {})
                            adjudicated_conditions = {
                                "minimumTreatmentTotal": {"required": lift.get("minimumTreatmentTotal"), "actual": treatment_total, "passed": treatment_total >= lift.get("minimumTreatmentTotal")},
                                "minimumTreatmentMinusBaseline": {"required": lift.get("minimumTreatmentMinusBaseline"), "actual": treatment_total - baseline_total, "passed": treatment_total - baseline_total >= lift.get("minimumTreatmentMinusBaseline")},
                                "minimumTreatmentAxisScore": {"required": lift.get("minimumTreatmentAxisScore"), "actual": min(value for key, value in treatment.items() if key != "total"), "passed": min(value for key, value in treatment.items() if key != "total") >= lift.get("minimumTreatmentAxisScore")},
                                "noHardFailure": {"required": lift.get("noHardFailure"), "actual": not any(hard_failures.get(label, []) for label in ("baseline", "treatment")), "passed": not any(hard_failures.get(label, []) for label in ("baseline", "treatment"))},
                            }
                            if adjudication.get("thresholdEvaluation") != adjudicated_conditions:
                                errors.append("Maui run-003 adjudicated threshold evaluation is inconsistent")
                            expected_final = all(condition["passed"] for condition in adjudicated_conditions.values())
                            if final_judgment != {"materialImprovement": expected_final, "expansionGateMet": expected_final}:
                                errors.append("Maui run-003 adjudicated final judgment is inconsistent")

    if isinstance(profile, dict):
        artifact_name = profile.get("derivationArtifact")
        artifact = load_json(eval_root / str(artifact_name), errors) if artifact_name else None
        if not isinstance(artifact, dict):
            errors.append("Maui profile requires a checked-in aggregate derivation artifact")
        else:
            source = artifact.get("source", {})
            if source.get("itemModifiedEpochMs") != profile.get("source", {}).get("itemModifiedEpochMs"):
                errors.append("Maui item modification timestamp drifted from derivation artifact")
            if source.get("layerLastEditEpochMs") != profile.get("source", {}).get("layerLastEditEpochMs"):
                errors.append("Maui layer edit timestamp drifted from derivation artifact")
            queries = artifact.get("queries", {})
            count_query = queries.get("featureCount", {})
            stats_query = queries.get("statistics", {})
            neighborhood_query = queries.get("neighborhoodDistinctCount", {})
            if count_query.get("parameters") != {"f": "json", "where": "1=1", "returnCountOnly": "true"}:
                errors.append("Maui feature-count query parameters are not canonical")
            stats_parameters = stats_query.get("parameters", {})
            if {key: stats_parameters.get(key) for key in ("f", "where", "returnGeometry")} != {"f": "json", "where": "1=1", "returnGeometry": "false"}:
                errors.append("Maui statistics query parameters are incomplete")
            if len(stats_parameters.get("outStatistics", [])) != 16:
                errors.append("Maui statistics query must declare all 16 aggregate expressions")
            if count_query.get("response", {}).get("count") != profile.get("geometry", {}).get("featureCount"):
                errors.append("Maui feature count drifted from derivation artifact")
            attributes = stats_query.get("response", {}).get("attributes", {})
            for field in ("landvalue", "bldgvalue", "taxacres", "gisacres"):
                details = profile.get("fields", {}).get(field, {})
                for profile_key, prefix in (("nonNullCount", "count"), ("min", "min"), ("max", "max"), ("mean", "avg")):
                    if details.get(profile_key) != attributes.get(f"{prefix}_{field}"):
                        errors.append(f"Maui {field}.{profile_key} drifted from derivation artifact")
            if neighborhood_query.get("response", {}).get("count") != profile.get("fields", {}).get("nhoodcode", {}).get("distinctNonNullCount"):
                errors.append("Maui neighborhood count drifted from derivation artifact")

    follow_on_names = {"layer-composition", "query-shaping", "publishing"}
    if follow_on_names <= names:
        follow_root = skills_root / "evals" / "follow-on-skills" / "run-001"
        follow_scenario = load_json(follow_root / "scenario.json", errors)
        follow_rubric = load_json(follow_root / "rubric.json", errors)
        follow_metadata = load_json(follow_root / "run-metadata.json", errors)
        if all(isinstance(value, dict) for value in (follow_scenario, follow_rubric, follow_metadata)):
            assert isinstance(follow_scenario, dict) and isinstance(follow_rubric, dict) and isinstance(follow_metadata, dict)
            if follow_scenario.get("runId") != "run-001" or follow_metadata.get("runId") != "run-001":
                errors.append("Follow-on evaluation run identifiers do not agree")
            if follow_scenario.get("runMetadataSha256") != canonical_sha256(follow_metadata):
                errors.append("Follow-on evaluation run-metadata SHA-256 does not match")
            if not re.fullmatch(r"[0-9a-f]{40}", str(follow_metadata.get("skillRevision", ""))):
                errors.append("Follow-on evaluation requires a full skill revision")
            for identity_key in ("modelIdentity", "harnessIdentity"):
                identity = follow_metadata.get(identity_key)
                if not isinstance(identity, dict) or identity.get("status") != "exposed" or not identity.get("value"):
                    errors.append(f"Follow-on evaluation {identity_key} must record the pinned exposed identity")
            expected_cases = {"layer-composition", "query-shaping", "publishing"}
            cases = follow_scenario.get("cases", [])
            case_ids = {case.get("id") for case in cases if isinstance(case, dict)}
            if case_ids != expected_cases or any(not case.get("request") for case in cases if isinstance(case, dict)):
                errors.append("Follow-on evaluation must predeclare exactly three non-empty cases")
            axes = follow_rubric.get("axes", [])
            axis_groups = {skill: set() for skill in expected_cases}
            for axis in axes if isinstance(axes, list) else []:
                skill = axis.get("skill") if isinstance(axis, dict) else None
                if skill in axis_groups:
                    axis_groups[skill].add(axis.get("id"))
                if not isinstance(axis, dict) or set(axis.get("anchors", {})) != {"0", "1", "2"}:
                    errors.append("Follow-on evaluation every rubric axis requires explicit 0/1/2 anchors")
            if any(len(group) != 4 for group in axis_groups.values()):
                errors.append("Follow-on evaluation requires exactly four axes per skill")
            lift = follow_rubric.get("materialLift", {})
            expected_lift = {"minimumTreatmentTotal": 6, "minimumTreatmentMinusBaseline": 2, "minimumTreatmentAxisScore": 1, "noHardFailure": True}
            if lift.get("perSkill") != expected_lift:
                errors.append("Follow-on evaluation per-skill lift threshold drifted")
            follow_status = follow_scenario.get("status")
            if follow_status not in {"not-run", "completed"}:
                errors.append("Follow-on evaluation status must be not-run or completed")
            follow_evidence = follow_scenario.get("evidence")
            if follow_status == "not-run" and follow_evidence is not None:
                errors.append("Follow-on not-run evaluation must not claim evidence")
            for relative in follow_scenario.get("requiredArtifacts", []):
                artifact_path = (follow_root / str(relative)).resolve()
                if follow_root.resolve() not in (artifact_path, *artifact_path.parents) or not artifact_path.is_file():
                    errors.append(f"Follow-on required artifact is missing or escapes the run root: {relative}")
            if follow_status == "not-run":
                for relative in follow_scenario.get("expectedArtifactsOnCompletion", []):
                    if (follow_root / str(relative)).exists():
                        errors.append(f"Follow-on not-run evaluation contains output artifact {relative}")
            if follow_status == "completed":
                if not isinstance(follow_evidence, dict):
                    errors.append("Follow-on completed evaluation requires evidence")
                else:
                    response_artifacts: dict[str, dict] = {}
                    responses = follow_evidence.get("responses", {})
                    for arm in ("baseline", "treatment"):
                        response = responses.get(arm, {}) if isinstance(responses, dict) else {}
                        response_path = follow_root / str(response.get("path"))
                        value = load_json(response_path, errors) if response_path.parent == follow_root and response_path.is_file() else None
                        if not isinstance(value, dict):
                            errors.append(f"Follow-on {arm} response artifact is missing")
                        else:
                            response_artifacts[arm] = value
                            if response.get("sha256") != canonical_sha256(value):
                                errors.append(f"Follow-on {arm} response canonical SHA-256 does not match")
                    judge_path = follow_root / str(follow_evidence.get("judgeResult"))
                    follow_judge = load_json(judge_path, errors) if judge_path.parent == follow_root and judge_path.is_file() else None
                    adjudication_path = follow_root / str(follow_evidence.get("reviewAdjudication"))
                    follow_adjudication = load_json(adjudication_path, errors) if adjudication_path.parent == follow_root and adjudication_path.is_file() else None
                    if not isinstance(follow_judge, dict) or not isinstance(follow_adjudication, dict):
                        errors.append("Follow-on completed evaluation requires local judge and adjudication artifacts")
                    else:
                        judge_sha = canonical_sha256(follow_judge)
                        if follow_evidence.get("judgeSha256") != judge_sha:
                            errors.append("Follow-on judge canonical SHA-256 does not match")
                        if follow_evidence.get("reviewAdjudicationSha256") != canonical_sha256(follow_adjudication):
                            errors.append("Follow-on adjudication canonical SHA-256 does not match")
                        if follow_adjudication.get("originalJudgeSha256") != judge_sha:
                            errors.append("Follow-on adjudication does not bind the judge artifact")
                        judge_scores = follow_judge.get("scores", {})
                        hard_failures = follow_judge.get("hardFailures", {})
                        score_errors, expected_thresholds, expected_per_skill = validate_follow_on_judge(
                            judge_scores,
                            hard_failures,
                            axis_groups,
                            follow_rubric.get("scoreRange"),
                        )
                        errors.extend(score_errors)
                        if follow_judge.get("thresholdEvaluation") != expected_thresholds:
                            errors.append("Follow-on judge threshold evaluation is inconsistent")
                        if follow_judge.get("judgment", {}).get("perSkill") != expected_per_skill:
                            errors.append("Follow-on judge per-skill judgment is inconsistent")
                        if follow_adjudication.get("findings") != [] or follow_adjudication.get("adjudicatedScores") != judge_scores:
                            errors.append("Follow-on upheld audits must preserve judge scores without findings")
                        expected_final = {"perSkill": expected_per_skill, "materialImprovement": all(value["materialImprovement"] for value in expected_per_skill.values()), "expansionGateMet": all(value["expansionGateMet"] for value in expected_per_skill.values())}
                        if follow_adjudication.get("thresholdEvaluation") != expected_thresholds or follow_adjudication.get("finalJudgment") != expected_final:
                            errors.append("Follow-on final adjudication is inconsistent")
                        if follow_evidence.get("perSkill") != expected_per_skill or follow_evidence.get("materialLift") is not expected_final["materialImprovement"] or follow_evidence.get("expansionGateMet") is not expected_final["expansionGateMet"]:
                            errors.append("Follow-on scenario evidence disagrees with adjudication")
                    treatment_text = json.dumps(response_artifacts.get("treatment", {}))
                    for required_phrase in ("tools/list", "list_layers", "returnCountOnly", "publish_result"):
                        if required_phrase not in treatment_text:
                            errors.append(f"Follow-on treatment no longer supports required behavior: {required_phrase}")
    return sorted(errors)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args(argv)
    errors = validate(args.root.resolve())
    if errors:
        for error in errors:
            print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print("PASS: skills catalog, contracts, trigger metadata, and eval scaffold are valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
