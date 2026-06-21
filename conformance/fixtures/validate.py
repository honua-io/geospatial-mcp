#!/usr/bin/env python3
"""Self-check: validate every fixture's `inputs` against its `schemaRef`.

Pure-stdlib by default (loads all schemas + fixtures, checks JSON well-formedness
and that each fixture resolves a schema). If the optional `jsonschema` package is
installed, it additionally performs full draft 2020-12 validation of `inputs`
against the referenced schema, resolving local `$ref` files.

Usage:
    python3 conformance/fixtures/validate.py
Exit code 0 = all good; non-zero = a schema failed to load or a fixture failed.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
SCHEMA_ROOT = os.path.join(REPO, "spec", "schemas")
FIXTURE_ROOT = HERE


def load_json(path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def iter_fixtures():
    for dirpath, _dirs, files in os.walk(FIXTURE_ROOT):
        for name in sorted(files):
            if name.endswith(".json"):
                yield os.path.join(dirpath, name)


def main():
    errors = []
    checked = 0

    # 1. Every schema file must be valid JSON and declare draft 2020-12.
    for dirpath, _dirs, files in os.walk(SCHEMA_ROOT):
        for name in sorted(files):
            if not name.endswith(".json"):
                continue
            path = os.path.join(dirpath, name)
            try:
                doc = load_json(path)
            except Exception as exc:  # noqa: BLE001
                errors.append(f"schema {path}: invalid JSON: {exc}")
                continue
            if name.endswith(".schema.json"):
                if doc.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
                    errors.append(f"schema {path}: missing/wrong $schema dialect")

    # Optional full validation.
    validator_cls = None
    try:
        import jsonschema  # type: ignore
        from referencing import Registry, Resource  # type: ignore

        registry = Registry()
        for dirpath, _dirs, files in os.walk(SCHEMA_ROOT):
            for name in files:
                if name.endswith(".json"):
                    p = os.path.join(dirpath, name)
                    d = load_json(p)
                    if "$id" in d:
                        registry = registry.with_resource(d["$id"], Resource.from_contents(d))
        validator_cls = (jsonschema, registry)
    except Exception:  # noqa: BLE001
        validator_cls = None

    # 2. Every fixture: resolve schema, optionally validate inputs.
    for path in iter_fixtures():
        try:
            fx = load_json(path)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"fixture {path}: invalid JSON: {exc}")
            continue
        if "schemaRef" not in fx or "inputs" not in fx:
            # README / non-fixture json — skip silently.
            continue
        schema_path = os.path.join(SCHEMA_ROOT, fx["schemaRef"])
        if not os.path.exists(schema_path):
            errors.append(f"fixture {path}: schemaRef not found: {fx['schemaRef']}")
            continue
        checked += 1
        if validator_cls is not None:
            jsonschema, registry = validator_cls
            schema = load_json(schema_path)
            try:
                v = jsonschema.Draft202012Validator(schema, registry=registry)
                v.validate(fx["inputs"])
            except Exception as exc:  # noqa: BLE001
                errors.append(f"fixture {path}: inputs failed validation: {exc}")

    mode = "full (jsonschema)" if validator_cls else "structural (stdlib only)"
    print(f"checked {checked} fixtures in {mode} mode")
    if errors:
        for e in errors:
            print("FAIL:", e, file=sys.stderr)
        return 1
    print("OK: all schemas loaded and all fixtures resolved/validated")
    return 0


if __name__ == "__main__":
    sys.exit(main())
