#!/usr/bin/env python3
"""Regression tests for the manifest conformance checker.

Guards the FULL-level definition against the audit finding that the checker
reported FULL while ignoring resource-family coverage (issue #25). The core
assertion: a manifest that omits a resource family the index marks `implemented`
must NOT reach FULL — it downgrades to MAPPED with a note naming the family.

Pure stdlib (`unittest`); no server and no third-party deps required. Run via:

    python3 conformance/test_check_manifest.py
"""
import copy
import json
import os
import tempfile
import unittest

import check_manifest as cm

HERE = os.path.dirname(os.path.abspath(__file__))
REFERENCE_MANIFEST = os.path.join(HERE, "manifests", "honua.manifest.json")


def _implemented_families(index):
    return sorted(
        r["family"]
        for r in index.get("resources", [])
        if r.get("implementationStatus") == "implemented"
    )


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
        advertised = {r.get("family") for r in self.reference.get("resources", [])}
        for family in implemented:
            self.assertIn(
                family, advertised,
                f"reference manifest omits implemented family '{family}'",
            )

        for family in implemented:
            manifest = copy.deepcopy(self.reference)
            manifest["resources"] = [
                r for r in manifest["resources"] if r.get("family") != family
            ]
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

        manifest = copy.deepcopy(self.reference)
        self.assertTrue(
            manifest.get("implementation", {}).get("isReferenceImplementation"),
            "reference manifest must be flagged isReferenceImplementation",
        )
        manifest["resources"] = [
            r for r in manifest["resources"] if r.get("family") != family
        ]

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


if __name__ == "__main__":
    unittest.main()
