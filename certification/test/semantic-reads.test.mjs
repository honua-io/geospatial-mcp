import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixtureBinding, readScenarios, verifyLayers, verifyQuery } from "../semantic-reads.mjs";
const sql = Buffer.from(`'test_service', 'Test Feature Service'
INSERT INTO features (layer_id, geometry, attributes)
('alpha', 'active', 1, 1.25, true, 'POINT(-122.4900 37.7100)')
('beta', 'inactive', 2, 2.50, false, 'POINT(-122.4750 37.7200)')`);
const ids = Buffer.from(JSON.stringify([{ name: "alpha", id: 21 }, { name: "beta", id: 22 }]));
const source = "a".repeat(40);
const fixture = { ...fixtureBinding(sql, ids, source, source), serviceLayerIndex: 3 };
const query = { serviceId: "svc-test-service-feature", serviceLayerIndex: 3, returnedCount: 2, exceededTransferLimit: false, geojson: { type: "FeatureCollection",
  features: fixture.expected.map((row) => ({ id: row.id, type: "Feature", properties: { name: row.name, count: row.count }, geometry: { type: "Point", coordinates: row.coordinates } })) } };

test("authored SQL and independent allocated IDs bind the candidate fixture", () => {
  assert.equal(fixture.sourceSha, source);
  assert.equal(fixtureBinding(sql, ids, source, source).serviceLayerIndex, 0);
  assert.equal(Object.hasOwn(fixtureBinding(sql, ids, source, source), "layerId"), false);
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
    (x) => { x.geojson.features[1] = x.geojson.features[0]; },
    (x) => { x.serviceLayerIndex = 0; }, (x) => { delete x.serviceLayerIndex; },
    (x) => { x.layerId = 3; }, (x) => { x.serviceId = "unrelated"; }]) {
    const corrupted = structuredClone(query); mutate(corrupted);
    assert.throws(() => verifyQuery(corrupted, fixture));
  }
});

test("layer proof binds the authored feature publication among protocol siblings", () => {
  const layer = { serviceName: "test_service", serviceId: "svc-test-service-feature", serviceLayerIndex: 3, geometryType: "Point", srid: 4326 };
  const output = { layers: [layer, { ...layer, serviceId: "svc-test-service-map" }], layerCount: 2, hasMore: false };
  verifyLayers(output, fixture);
  for (const mutate of [(x) => { x.layers[0].serviceId = "unrelated"; },
    (x) => { x.layers[0].serviceName = "unrelated"; }, (x) => { x.layers[0].serviceLayerIndex = 1; },
    (x) => { x.layers[0].geometryType = "Polygon"; }, (x) => { x.layers[0].srid = 3857; },
    (x) => { x.layers[1] = x.layers[0]; }, (x) => { x.hasMore = true; },
    (x) => { delete x.layers[0].serviceLayerIndex; }, (x) => { x.layers[0].layerId = 3; }]) {
    const corrupted = structuredClone(output); mutate(corrupted);
    assert.throws(() => verifyLayers(corrupted, fixture));
  }
});

test("semantic query requests use the service-local selector for success and refusal probes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mcp-selector-"));
  const settings = {
    HONUA_MCP_SEED_SQL: join(directory, "seed.sql"),
    HONUA_MCP_FIXTURE_IDS: join(directory, "ids.json"),
    HONUA_MCP_SEED_SOURCE_SHA: source,
    HONUA_MCP_SERVER_SOURCE_SHA: source,
  };
  const previous = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]));
  const requests = [];
  try {
    await writeFile(settings.HONUA_MCP_SEED_SQL, sql);
    await writeFile(settings.HONUA_MCP_FIXTURE_IDS, ids);
    Object.assign(process.env, settings);
    await readScenarios(async (name, arguments_) => {
      assert.equal(name, "honua_query_features");
      requests.push(arguments_);
      assert.equal(arguments_.serviceLayerIndex, 0);
      assert.equal(Object.hasOwn(arguments_, "layerId"), false);
      return arguments_.serviceId === "__certification_missing_service__"
        ? { isError: true, structuredContent: { status: "error", code: "not_found" } }
        : { structuredContent: { ...query, serviceLayerIndex: 0 } };
    }, async (name, run) => {
      if (name === "tools/call:query_features") await run();
    });
    assert.equal(requests.length, 2);
    assert.equal(requests[0].serviceId, "test_service");
    assert.equal(requests[1].serviceId, "__certification_missing_service__");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
