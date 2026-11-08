"""Validate service-scoped selectors against the published wire contracts."""

import copy
import json
from pathlib import Path
import unittest

from jsonschema import Draft202012Validator
from referencing import Registry, Resource


ROOT = Path(__file__).resolve().parents[1]
SELECTOR = {"serviceId": "county_parcels", "serviceLayerIndex": 3}
SCHEMAS = [json.loads(path.read_text()) for path in (ROOT / "spec/schemas").rglob("*.schema.json")]
REGISTRY = Registry().with_resources(
    (schema["$id"], Resource.from_contents(schema)) for schema in SCHEMAS if "$id" in schema
)


def validator(tool, result=False):
    suffix = ".result.schema.json" if result else ".schema.json"
    schema = json.loads((ROOT / "spec/schemas/tools" / (tool + suffix)).read_text())
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema, registry=REGISTRY)


class ServiceLayerIndexTests(unittest.TestCase):
    def test_inputs_accept_service_index_and_reject_obsolete_selector(self):
        inputs = {
            "query_features": SELECTOR,
            "render_map": {"layers": [SELECTOR], "bbox": [0, 0, 1, 1]},
            "get_style": SELECTOR,
            "apply_style_preset": {**SELECTOR, "styleId": "style_parcels"},
        }
        for tool, payload in inputs.items():
            with self.subTest(tool=tool):
                contract = validator(tool)
                self.assertEqual(list(contract.iter_errors(payload)), [])
                obsolete = copy.deepcopy(payload)
                reference = obsolete["layers"][0] if tool == "render_map" else obsolete
                reference["layerId"] = reference.pop("serviceLayerIndex")
                self.assertFalse(contract.is_valid(obsolete))
                reference["serviceLayerIndex"] = 3
                self.assertFalse(contract.is_valid(obsolete))

    def test_style_discovery_preserves_style_id_and_catalog_modes(self):
        contract = validator("get_style")
        self.assertTrue(contract.is_valid({}))
        self.assertTrue(contract.is_valid({"styleId": "style_parcels"}))

    def test_input_indexes_are_nonnegative_integers(self):
        for tool in ("query_features", "get_style", "apply_style_preset", "render_map"):
            for invalid in (-1, "3", 3.5, None):
                with self.subTest(tool=tool, value=invalid):
                    reference = {**SELECTOR, "serviceLayerIndex": invalid}
                    payload = {**reference, "styleId": "style_parcels"}
                    if tool == "render_map":
                        payload = {"layers": [reference], "bbox": [0, 0, 1, 1]}
                    self.assertFalse(validator(tool).is_valid(payload))

    def test_results_require_explicit_service_index(self):
        results = {
            "query_features": SELECTOR.copy(),
            "render_map": {"layers": [SELECTOR.copy()]},
            "apply_style_preset": {**SELECTOR, "styleId": "style_parcels"},
            "list_layers": {"layerCount": 1, "layers": [{**SELECTOR, "name": "Parcels"}]},
            "resolve_entity": {
                "query": "parcels", "entityType": "any", "matchCount": 1,
                "matches": [{**SELECTOR, "kind": "layer", "name": "Parcels", "score": 1}],
            },
        }
        for tool, payload in results.items():
            with self.subTest(tool=tool):
                contract = validator(tool, result=True)
                self.assertTrue(contract.is_valid(payload))
                reference = payload
                if tool in ("list_layers", "render_map"):
                    reference = payload["layers"][0]
                elif tool == "resolve_entity":
                    reference = payload["matches"][0]
                reference["layerId"] = reference.pop("serviceLayerIndex")
                self.assertFalse(contract.is_valid(payload))
                reference["serviceLayerIndex"] = 3
                self.assertFalse(contract.is_valid(payload))
                del reference["layerId"]
                for invalid in (-1, "3", 3.5, None):
                    reference["serviceLayerIndex"] = invalid
                    self.assertFalse(contract.is_valid(payload))

    def test_service_entity_has_no_layer_index(self):
        payload = {
            "query": "county", "entityType": "service", "matchCount": 1,
            "matches": [{"kind": "service", "serviceId": "county_parcels", "name": "County", "score": 1}],
        }
        contract = validator("resolve_entity", result=True)
        self.assertTrue(contract.is_valid(payload))
        payload["matches"][0]["serviceLayerIndex"] = None
        self.assertTrue(contract.is_valid(payload))


if __name__ == "__main__":
    unittest.main()
