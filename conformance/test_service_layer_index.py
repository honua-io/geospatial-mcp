"""Validate service-scoped selectors against the published wire contracts."""

import copy
import json
from pathlib import Path
import unittest

from jsonschema import Draft202012Validator

from conformance.fixtures.validate import schema_registry


ROOT = Path(__file__).resolve().parents[1]
REGISTRY = schema_registry(ROOT / "spec/schemas")
SELECTOR = {"serviceId": "county_parcels", "serviceLayerIndex": 3}


def contract(filename):
    schema = json.loads((ROOT / "spec/schemas/tools" / filename).read_text())
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema, registry=REGISTRY)


def input_cases():
    return {
        "query_features.schema.json": SELECTOR.copy(),
        "render_map.schema.json": {"layers": [SELECTOR.copy()], "bbox": [0, 0, 1, 1]},
        "get_style.schema.json": SELECTOR.copy(),
        "apply_style_preset.schema.json": {**SELECTOR, "styleId": "style_parcels"},
    }


def result_cases():
    return {
        "query_features.result.schema.json": SELECTOR.copy(),
        "render_map.result.schema.json": {"layers": [SELECTOR.copy()]},
        "apply_style_preset.result.schema.json": {**SELECTOR, "styleId": "style_parcels"},
        "list_layers.result.schema.json": {"layerCount": 1, "layers": [{**SELECTOR, "name": "Parcels"}]},
        "resolve_entity.result.schema.json": {
            "query": "parcels", "entityType": "any", "matchCount": 1,
            "matches": [{**SELECTOR, "kind": "layer", "name": "Parcels", "score": 1}],
        },
    }


def layer_reference(payload):
    if "layers" in payload:
        return payload["layers"][0]
    if "matches" in payload:
        return payload["matches"][0]
    return payload


class ServiceLayerIndexTests(unittest.TestCase):
    def assert_selector_values(self, filename, payload):
        schema = contract(filename)
        self.assertEqual(list(schema.iter_errors(payload)), [])
        mutated = copy.deepcopy(payload)
        reference = layer_reference(mutated)
        reference["layerId"] = reference.pop("serviceLayerIndex")
        self.assertFalse(schema.is_valid(mutated))
        reference["serviceLayerIndex"] = 3
        self.assertFalse(schema.is_valid(mutated))
        del reference["layerId"]
        for invalid in (-1, "3", 3.5, None):
            reference["serviceLayerIndex"] = invalid
            self.assertFalse(schema.is_valid(mutated), str(invalid))

    def test_inputs_and_results_use_nonnegative_service_indexes_without_aliases(self):
        for filename, payload in (input_cases() | result_cases()).items():
            with self.subTest(schema=filename):
                self.assert_selector_values(filename, payload)

    def test_required_indexes_cannot_be_omitted(self):
        required = input_cases() | result_cases()
        del required["get_style.schema.json"]
        for filename, payload in required.items():
            with self.subTest(schema=filename):
                del layer_reference(payload)["serviceLayerIndex"]
                self.assertFalse(contract(filename).is_valid(payload))

    def test_style_discovery_preserves_style_id_and_catalog_modes(self):
        schema = contract("get_style.schema.json")
        self.assertTrue(schema.is_valid({}))
        self.assertTrue(schema.is_valid({"styleId": "style_parcels"}))

    def test_service_entity_has_no_layer_index(self):
        payload = {
            "query": "county", "entityType": "service", "matchCount": 1,
            "matches": [{"kind": "service", "serviceId": "county_parcels", "name": "County", "score": 1}],
        }
        schema = contract("resolve_entity.result.schema.json")
        self.assertTrue(schema.is_valid(payload))
        reference = payload["matches"][0]
        reference["serviceLayerIndex"] = None
        self.assertTrue(schema.is_valid(payload))
        reference["serviceLayerIndex"] = 0
        self.assertFalse(schema.is_valid(payload))
        del reference["serviceLayerIndex"]
        reference["layerId"] = 0
        self.assertFalse(schema.is_valid(payload))


if __name__ == "__main__":
    unittest.main()
