#!/usr/bin/env python3
"""Regression tests for the manifest conformance checker.

Guards the FULL-level definition against the audit finding that the checker
reported FULL while ignoring resource-family coverage (issue #25). The core
assertion: a manifest that omits a resource family the index marks `implemented`
must NOT reach FULL — it downgrades to MAPPED with a note naming the family.

It also pins the deprecated-alias mapping of former standard names and the
retired-vocabulary guard (conformance/check_vocabulary.py) over the repository.

Pure stdlib (`unittest`); no server and no third-party deps required. Run via:

    python3 conformance/test_check_manifest.py
"""
import copy
import json
import os
import tempfile
import unittest

import check_manifest as cm
import check_vocabulary as cv

HERE = os.path.dirname(os.path.abspath(__file__))
REFERENCE_MANIFEST = os.path.join(HERE, "manifests", "honua.manifest.json")


def _implemented_families(index):
    return sorted(
        r["family"]
        for r in index.get("resources", [])
        if r.get("implementationStatus") == "implemented"
    )


def _current_family(index, family):
    """The current family name for a manifest family that may be a deprecated alias."""
    return cm.deprecated_alias_map(index.get("resources", []), "family").get(family, family)


def _without_family(manifest, index, family):
    """A copy of ``manifest`` that no longer advertises ``family`` under any name."""
    trimmed = copy.deepcopy(manifest)
    trimmed["resources"] = [
        r for r in trimmed["resources"] if _current_family(index, r.get("family")) != family
    ]
    return trimmed


def _check(manifest, index, strict=False):
    """Write a manifest dict to a temp file and return (level, errors, warnings)."""
    fd, path = tempfile.mkstemp(suffix=".manifest.json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(manifest, fh)
        level, errors, warnings, _stats = cm.check_manifest(path, index, strict=strict)
    finally:
        os.remove(path)
    return level, errors, warnings


class ResourceFamilyCoverageTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.index = cm.load_json(cm.INDEX_PATH)
        cls.reference = cm.load_json(REFERENCE_MANIFEST)

    def test_reference_manifest_is_full(self):
        """Sanity: the unmodified reference manifest still certifies FULL."""
        level, errors, _warnings = _check(self.reference, self.index)
        self.assertEqual(errors, [])
        self.assertEqual(level, "FULL")

    def test_uncovered_implemented_family_downgrades_full_to_mapped(self):
        """The audit regression: dropping ANY implemented family must lose FULL.

        Before the fix the checker only gated tool families, so a manifest that
        advertised every tool but omitted an implemented resource family still
        reported FULL (false conformance). Every implemented family must now be
        load-bearing for the FULL verdict.
        """
        implemented = _implemented_families(self.index)
        self.assertTrue(implemented, "index must mark some families implemented")

        # The reference manifest must actually advertise every implemented
        # family, otherwise the drop below would be a no-op.
        advertised = {_current_family(self.index, r.get("family"))
                      for r in self.reference.get("resources", [])}
        for family in implemented:
            self.assertIn(
                family, advertised,
                f"reference manifest omits implemented family '{family}'",
            )

        for family in implemented:
            manifest = _without_family(self.reference, self.index, family)
            level, errors, warnings = _check(manifest, self.index)
            self.assertEqual(errors, [], f"dropping '{family}' should not error")
            self.assertEqual(
                level, "MAPPED",
                f"omitting implemented family '{family}' must downgrade FULL->MAPPED",
            )
            self.assertTrue(
                any(family in w and "not advertised" in w for w in warnings),
                f"expected a coverage note naming the uncovered family '{family}'",
            )

    def test_strict_reference_coverage_gap_is_hard_failure(self):
        """A5 (#41): under --strict, a served-surface drop on the reference
        manifest must FAIL, not silently drop to MAPPED.

        Non-strict, dropping an implemented family/tool downgrades FULL->MAPPED
        (a warning). Under strict on the reference implementation, the same drop
        is an error (FAIL) so tool-count / served-family drift can't pass CI.
        """
        implemented = _implemented_families(self.index)
        self.assertTrue(implemented, "index must mark some families implemented")
        family = implemented[0]

        self.assertTrue(
            self.reference.get("implementation", {}).get("isReferenceImplementation"),
            "reference manifest must be flagged isReferenceImplementation",
        )
        manifest = _without_family(self.reference, self.index, family)

        # Non-strict: downgrade to MAPPED, no error.
        level, errors, _warnings = _check(manifest, self.index, strict=False)
        self.assertEqual(errors, [])
        self.assertEqual(level, "MAPPED")

        # Strict on the reference: same drop is a hard failure.
        level, errors, _warnings = _check(manifest, self.index, strict=True)
        self.assertEqual(level, "FAIL")
        self.assertTrue(
            any(family in e and "not advertised" in e for e in errors),
            f"strict error should name the dropped family '{family}'",
        )

    def test_strict_does_not_penalize_intact_reference(self):
        """Strict keeps the intact reference manifest at FULL (no false fail)."""
        level, errors, _warnings = _check(self.reference, self.index, strict=True)
        self.assertEqual(errors, [])
        self.assertEqual(level, "FULL")

    def test_known_gap_family_does_not_block_full(self):
        """Omitting a `known-gap` family stays informational and keeps FULL."""
        gap_families = sorted(
            r["family"]
            for r in self.index.get("resources", [])
            if r.get("implementationStatus") == "known-gap"
        )
        if not gap_families:
            self.skipTest("index has no known-gap families to exercise")
        # The reference manifest already omits known-gap families and is FULL;
        # assert that remains true so the gate stays scoped to implemented ones.
        level, errors, _warnings = _check(self.reference, self.index)
        self.assertEqual(errors, [])
        self.assertEqual(level, "FULL")


class AnalysisProfileGatingTest(unittest.TestCase):
    """Pins the `analysis` conformance profile's gating (ADR-0029).

    An additive profile must be non-breaking: a tool tagged `profile: analysis`
    is required for FULL only when a manifest declares `analysis`. Base-only
    (planner-only) adopters stay FULL without advertising any direct verb.
    """

    ANALYSIS_VERBS = {
        "buffer_features", "overlay_features", "summarize_statistics",
        "reproject_features", "join_features", "export_dataset",
    }

    @classmethod
    def setUpClass(cls):
        cls.index = cm.load_json(cm.INDEX_PATH)
        cls.reference = cm.load_json(REFERENCE_MANIFEST)

    def test_verbs_are_tagged_analysis_profile_and_known_gap(self):
        by_name = {t["standardName"]: t for t in self.index.get("tools", [])}
        for verb in self.ANALYSIS_VERBS:
            self.assertIn(verb, by_name, f"index must define '{verb}'")
            self.assertEqual(by_name[verb].get("profile"), "analysis")
            # Reference does not ship the direct verbs yet: honest status.
            self.assertEqual(by_name[verb].get("implementationStatus"), "known-gap")

    def test_base_only_manifest_ignores_analysis_verbs(self):
        """Even if a verb were `implemented`, an undeclared `analysis` profile
        must not require it for FULL — the tool is informational, not load-bearing."""
        index = copy.deepcopy(self.index)
        for t in index["tools"]:
            if t["standardName"] == "buffer_features":
                t["implementationStatus"] = "implemented"
        manifest = copy.deepcopy(self.reference)  # base-only reference
        level, errors, warnings = _check(manifest, index, strict=True)
        self.assertEqual(errors, [])
        self.assertEqual(level, "FULL")
        self.assertTrue(
            any("buffer_features" in w and "analysis" in w for w in warnings),
            "an implemented, undeclared-profile verb should be an informational note",
        )

    def test_declaring_analysis_requires_the_verb(self):
        """Declaring `analysis` makes an `implemented` verb load-bearing for FULL."""
        index = copy.deepcopy(self.index)
        for t in index["tools"]:
            if t["standardName"] == "buffer_features":
                t["implementationStatus"] = "implemented"
        manifest = copy.deepcopy(self.reference)
        manifest["implementation"]["profiles"] = ["base", "analysis"]
        # Not advertising buffer_features -> loses FULL (non-strict: MAPPED).
        level, errors, warnings = _check(manifest, index, strict=False)
        self.assertEqual(errors, [])
        self.assertEqual(level, "MAPPED")
        self.assertTrue(any("buffer_features" in w for w in warnings))
        # Advertising it -> FULL again.
        manifest["tools"].append({
            "standardName": "buffer_features",
            "advertisedName": "honua_buffer_features",
            "workflowFamily": "Execution",
        })
        level, errors, _warnings = _check(manifest, index, strict=True)
        self.assertEqual(errors, [])
        self.assertEqual(level, "FULL")


class DeprecatedAliasTest(unittest.TestCase):
    """Former standard names stay accepted for one release, with a deprecation note."""

    @classmethod
    def setUpClass(cls):
        cls.index = cm.load_json(cm.INDEX_PATH)
        cls.reference = cm.load_json(REFERENCE_MANIFEST)

    def test_aliases_are_unique_and_never_current_names(self):
        for entries, key in ((self.index["tools"], "standardName"),
                             (self.index["resources"], "family")):
            current = {entry[key] for entry in entries}
            aliases = [alias for entry in entries for alias in entry.get("deprecatedAliases", [])]
            self.assertEqual(len(aliases), len(set(aliases)), f"duplicate {key} alias")
            self.assertFalse(current & set(aliases), f"{key} alias shadows a current name")

    def test_each_tool_alias_keeps_a_schema_stub_for_its_replacement(self):
        for tool in self.index["tools"]:
            target = cm.load_json(os.path.join(cm.REPO, "spec", "schemas", tool["schema"]))
            for alias in tool.get("deprecatedAliases", []):
                stub = cm.load_json(os.path.join(
                    cm.REPO, "spec", "schemas", "tools", f"{alias}.schema.json"))
                self.assertTrue(stub.get("deprecated"), alias)
                self.assertEqual(stub.get("$ref"), target["$id"], alias)

    def test_vocabulary_guard_blocks_every_former_tool_name(self):
        aliases = set(cm.deprecated_alias_map(self.index["tools"], "standardName"))
        self.assertLessEqual(aliases, set(cv.RETIRED_TOOL_NAMES))

    def _renamed(self, tool_names, families):
        manifest = copy.deepcopy(self.reference)
        for tool in manifest["tools"]:
            tool["standardName"] = tool_names.get(tool["standardName"], tool["standardName"])
        for res in manifest["resources"]:
            res["family"] = families.get(res["family"], res["family"])
        return manifest

    def test_former_and_current_names_both_reach_full(self):
        tool_aliases = cm.deprecated_alias_map(self.index["tools"], "standardName")
        family_aliases = cm.deprecated_alias_map(self.index["resources"], "family")
        self.assertEqual(tool_aliases["create_map_package"], "create_map")
        self.assertEqual(family_aliases["Map package"], "Map")
        for tool_names, families in (({v: k for k, v in tool_aliases.items()},
                                      {v: k for k, v in family_aliases.items()}),
                                     (tool_aliases, family_aliases)):
            manifest = self._renamed(tool_names, families)
            level, errors, _warnings = _check(manifest, self.index, strict=True)
            self.assertEqual(errors, [])
            self.assertEqual(level, "FULL")

    def test_alias_use_is_reported_as_deprecated(self):
        manifest = self._renamed({"create_map": "create_map_package"}, {"Map": "Map package"})
        _level, _errors, warnings = _check(manifest, self.index)
        self.assertTrue(any("'create_map_package' is a deprecated alias of 'create_map'" in w
                            for w in warnings))
        self.assertTrue(any("'Map package' is a deprecated alias of 'Map'" in w for w in warnings))

    def test_current_names_carry_no_deprecation_note(self):
        tool_aliases = cm.deprecated_alias_map(self.index["tools"], "standardName")
        family_aliases = cm.deprecated_alias_map(self.index["resources"], "family")
        manifest = self._renamed(tool_aliases, family_aliases)
        _level, _errors, warnings = _check(manifest, self.index)
        self.assertFalse(any("deprecated alias" in w for w in warnings))

    def test_former_profile_name_declares_the_current_profile(self):
        index = copy.deepcopy(self.index)
        for t in index["tools"]:
            if t["standardName"] == "bind_component_context":
                t["implementationStatus"] = "implemented"
        manifest = copy.deepcopy(self.reference)
        manifest["implementation"]["profiles"] = ["base", "composition"]
        level, errors, warnings = _check(manifest, index)
        self.assertEqual(errors, [])
        self.assertEqual(level, "MAPPED")
        self.assertTrue(any("standard tool 'bind_component_context' is marked 'implemented'" in w
                            for w in warnings))
        self.assertTrue(any("profile 'composition' is a deprecated alias of 'interactivity'" in w
                            for w in warnings))


class RetiredVocabularyTest(unittest.TestCase):
    """The published artifacts use the Honua vocabulary (conformance/check_vocabulary.py)."""

    @classmethod
    def setUpClass(cls):
        cls.allowlist = cv.load_allowlist()

    def test_repository_has_no_retired_vocabulary(self):
        findings = cv.scan_repo(allowlist=self.allowlist)
        self.assertEqual(findings, [], "\n".join(
            f"{path}:{number}: [{rule}] use {replacement}"
            for path, number, rule, replacement, _line in findings))

    def test_allowlist_has_no_stale_exceptions(self):
        self.assertEqual(cv.stale_exceptions(allowlist=self.allowlist), [])

    def test_retired_names_are_found(self):
        text = ("Create a MapPackage.\nCall create_app_package.\n"
                "Edit the composition document.\nDo not touch a hosted layer.\n"
                "Return a MapPackageRef.\n" '"profiles": ["base", "composition"]\n')
        rules = [rule for _p, _n, rule, _r, _l in cv.scan_text("spec/x.md", text, self.allowlist)]
        self.assertEqual(rules, ["map-envelope", "retired-tool-name", "composition-document",
                                 "hosted-layer", "map-envelope", "composition-profile-value"])

    def test_stale_exception_is_reported(self):
        allowlist = {"exceptions": [{"path": "AGENTS.md", "rule": "hosted-layer",
                                     "line": "no such line", "reason": "test"}]}
        self.assertEqual(len(cv.stale_exceptions(allowlist=allowlist)), 1)

    def test_wire_literals_are_not_findings(self):
        text = ("Read honua://map-packages/{map_package_id} with mapPackageId.\n"
                "The reference advertises honua_create_map_package.\n")
        self.assertEqual(cv.scan_text("spec/x.md", text, self.allowlist), [])

    def test_exception_covers_only_its_exact_line(self):
        allowlist = {"exceptions": [{"path": "spec/x.md", "rule": "retired-tool-name",
                                     "line": "| `create_map_package` | `create_map` |",
                                     "reason": "test"}]}
        text = "| `create_map_package` | `create_map` |\nUse create_map_package.\n"
        findings = cv.scan_text("spec/x.md", text, allowlist)
        self.assertEqual([number for _p, number, _r, _rep, _l in findings], [2])


if __name__ == "__main__":
    unittest.main()
