#!/usr/bin/env python3
"""Keep standard identifier schemas aligned with the reference handlers."""
import os
import unittest

import check_manifest as cm


class MapAppIdentifierContractTest(unittest.TestCase):
    def test_component_identifiers_match_handler_constraints(self):
        from jsonschema import Draft202012Validator
        for file_name, definition, property_name in (
            ("controls", "control", "id"),
            ("controls", "control", "sourceId"),
            ("interactions", "interaction", "id"),
        ):
            document = cm.load_json(os.path.join(cm.REPO, "spec", "schemas", "common", file_name + ".schema.json"))
            field = document["$defs"][definition]["properties"][property_name]
            validator = Draft202012Validator(field)
            with self.subTest(file=file_name, property=property_name):
                self.assertTrue(validator.is_valid("stable-id"))
                for invalid in ("", " ", "\t", "x" * 201):
                    self.assertFalse(validator.is_valid(invalid), repr(invalid))

    def test_removal_identifiers_match_handler_constraints(self):
        from jsonschema import Draft202012Validator
        for name, field in (("remove_control", "controlId"), ("remove_interaction", "interactionId")):
            schema = cm.load_json(os.path.join(cm.REPO, "spec", "schemas", "tools", name + ".schema.json"))
            validator = Draft202012Validator(schema)
            with self.subTest(tool=name):
                self.assertTrue(validator.is_valid({"mapId": "map", field: "stable-id"}))
                for invalid in ("", " ", "\t", "x" * 201):
                    self.assertFalse(validator.is_valid({"mapId": "map", field: invalid}), repr(invalid))


if __name__ == "__main__":
    unittest.main()
