import assert from "node:assert/strict";
import test from "node:test";
import { fixtureBinding, verifyQuery } from "../semantic-reads.mjs";
const sql = Buffer.from(`'test_service', 'Test Feature Service'
INSERT INTO features (layer_id, geometry, attributes)
('alpha', 'active', 1, 1.25, true, 'POINT(-122.4900 37.7100)')
('beta', 'inactive', 2, 2.50, false, 'POINT(-122.4750 37.7200)')`);
const ids = Buffer.from(JSON.stringify([{ name: "alpha", id: 21 }, { name: "beta", id: 22 }]));
const source = "a".repeat(40);
const fixture = fixtureBinding(sql, ids, source, source);
const query = { layerId: 0, returnedCount: 2, exceededTransferLimit: false, geojson: { type: "FeatureCollection",
  features: fixture.expected.map((row) => ({ id: row.id, type: "Feature", properties: { name: row.name, count: row.count }, geometry: { type: "Point", coordinates: row.coordinates } })) } };

test("authored SQL and independent allocated IDs bind the candidate fixture", () => {
  assert.equal(fixture.sourceSha, source);
  assert.match(fixture.seedSqlSha256, /^sha256:[a-f0-9]{64}$/);
  for (const [bytes, bindings, sha] of [[sql, ids, "b".repeat(40)], [Buffer.from("unrelated"), ids, source],
    [sql, Buffer.from("[]"), source], [sql, Buffer.from('[{"name":"alpha","id":21},{"name":"beta","id":21}]'), source]]) {
    assert.throws(() => fixtureBinding(bytes, bindings, sha, source));
  }
});

test("query proof requires actual fixture identities, typed values and geometry", () => {
  assert.deepEqual(verifyQuery(query, fixture), ["alpha", "beta"]);
  for (const mutate of [(x) => { x.geojson.features = []; }, (x) => { x.geojson.features[0].id = 999; },
    (x) => { x.geojson.features[0].properties.count = "1"; }, (x) => { x.geojson.features[0].geometry.coordinates[0] += 1; },
    (x) => { x.geojson.features[0].geometry.type = "Polygon"; }, (x) => { x.exceededTransferLimit = true; },
    (x) => { x.geojson.features[1] = x.geojson.features[0]; }]) {
    const corrupted = structuredClone(query); mutate(corrupted);
    assert.throws(() => verifyQuery(corrupted, fixture));
  }
});
