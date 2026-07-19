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
    scenario = load_json(eval_root / "scenario.json", errors)
    profile = load_json(eval_root / "dataset-profile.json", errors)
    rubric = load_json(eval_root / "rubric.json", errors)
    if isinstance(scenario, dict):
        status = scenario.get("status")
        if status not in {"not-run", "completed"}:
            errors.append("Maui cold-eval status must be not-run or completed")
        if not scenario.get("request"):
            errors.append("Maui cold-eval scaffold must contain an exact request")
        evidence = scenario.get("evidence")
        if status == "not-run" and evidence is not None:
            errors.append("Maui not-run evaluation must not claim evidence")
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
                            errors.append(f"Maui {label} evidence must be an object")
                            continue
                        relative = response.get("path")
                        response_path = (eval_root / str(relative)).resolve()
                        if response_path.parent != eval_root.resolve() or not response_path.is_file():
                            errors.append(f"Maui {label} response path is missing or escapes the eval directory")
                        elif sha256(response_path) != str(response.get("sha256", "")).lower():
                            errors.append(f"Maui {label} response SHA-256 does not match")
                        scores = response.get("scores")
                        if not isinstance(scores, dict) or set(scores) != axes:
                            errors.append(f"Maui {label} scores must cover every rubric axis exactly")
                        elif any(not isinstance(value, int) or not score_range[0] <= value <= score_range[1] for value in scores.values()):
                            errors.append(f"Maui {label} score is outside the rubric range")
                        elif response.get("total") != sum(scores.values()):
                            errors.append(f"Maui {label} total does not equal its axis scores")
                judge_path = (eval_root / str(evidence.get("judgeResult"))).resolve()
                if judge_path.parent != eval_root.resolve() or not judge_path.is_file():
                    errors.append("Maui completed evidence requires a local judge result")

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
