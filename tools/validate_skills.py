#!/usr/bin/env python3
"""Validate the portable geospatial-mcp agent skills corpus."""

from __future__ import annotations

import argparse
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
    load_json(skills_root / "catalog.schema.json", errors)
    index = load_json(root / "spec" / "schemas" / "index.json", errors)
    contract = load_json(skills_root / "contracts" / "live-surface.json", errors)
    if not all(isinstance(value, dict) for value in (catalog, index, contract)):
        return sorted(errors)

    assert isinstance(catalog, dict) and isinstance(index, dict) and isinstance(contract, dict)
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

    eval_root = skills_root / "evals" / "choosing-a-visualization-maui-parcels"
    scenario = load_json(eval_root / "scenario.json", errors)
    load_json(eval_root / "dataset-profile.json", errors)
    load_json(eval_root / "rubric.json", errors)
    if isinstance(scenario, dict):
        if scenario.get("status") != "not-run" or scenario.get("evidence") is not None:
            errors.append("Maui cold-eval scaffold must remain not-run until real evidence is committed")
        if not scenario.get("request"):
            errors.append("Maui cold-eval scaffold must contain an exact request")
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
