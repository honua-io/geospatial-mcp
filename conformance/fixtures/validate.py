#!/usr/bin/env python3
"""Self-check: validate every fixture's `inputs` against its `schemaRef`.

Pure-stdlib by default (loads all schemas + fixtures, checks JSON well-formedness
and that each fixture resolves a schema). If the optional `jsonschema` package is
installed, it additionally performs full draft 2020-12 validation of `inputs`
against the referenced schema, resolving local `$ref` files.

Run with `--strict` (or set CONFORMANCE_STRICT=1) to require the optional
dependencies: in strict mode a missing `jsonschema`/`referencing` is a hard
failure rather than a silent degrade, so CI never reports success when no real
schema validation actually ran. Install them with
`pip install -r conformance/requirements.txt`.

Usage:
    python3 conformance/fixtures/validate.py [--strict]
Exit code 0 = all good; non-zero = a schema failed to load, a fixture failed, or
strict mode was requested without the validation dependencies installed.
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


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    strict = "--strict" in argv or os.environ.get("CONFORMANCE_STRICT") == "1"
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
    import_error = None
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
    except Exception as exc:  # noqa: BLE001
        validator_cls = None
        import_error = exc

    if validator_cls is None and strict:
        print("FAIL: --strict requires the 'jsonschema' and 'referencing' packages "
              "(install: pip install -r conformance/requirements.txt); "
              f"full schema validation did not run ({import_error}).", file=sys.stderr)
        return 2

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
    if validator_cls:
        print("OK: all schemas loaded and all fixtures validated against their schemas")
    else:
        # Be honest: structural mode did NOT validate inputs against schemas.
        print("OK (structural only): all schemas loaded and all fixtures resolved a "
              "schema, but inputs were NOT validated against the schemas — install "
              "conformance/requirements.txt (or run with --strict) for full validation.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
