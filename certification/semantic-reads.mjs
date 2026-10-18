import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { toolOutput } from "./probes.mjs";

const require = (condition, message) => { if (!condition) throw new Error(message); };
const hash = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

export function fixtureBinding(sql, allocated, sourceSha, candidateSha) {
  require(/^[0-9a-f]{40}$/.test(sourceSha ?? "") && sourceSha === candidateSha, "fixture source must equal the exact candidate source");
  const text = sql.toString("utf8");
  require(text.includes("'test_service', 'Test Feature Service'") && text.includes("INSERT INTO features (layer_id, geometry, attributes)"), "fixture is not the maintained base-schema service/layer seed");
  const expected = [{ name: "alpha", count: 1, coordinates: [-122.49, 37.71] }, { name: "beta", count: 2, coordinates: [-122.475, 37.72] }];
  for (const row of expected) {
    const match = text.match(new RegExp(`\\('${row.name}',\\s*'[^']+',\\s*(\\d+),[^\\n]+?'POINT\\(([-\\d.]+) ([-\\d.]+)\\)'\\)`));
    require(match && Number(match[1]) === row.count && Number(match[2]) === row.coordinates[0] && Number(match[3]) === row.coordinates[1], "authored seed point changed or is absent");
  }
  const ids = JSON.parse(allocated.toString("utf8"));
  require(Array.isArray(ids) && ids.length === 2, "independently captured fixture IDs are missing or partial");
  for (const row of expected) {
    const matches = ids.filter((value) => value.name === row.name);
    require(matches.length === 1 && Number.isSafeInteger(matches[0].id) && matches[0].id > 0, "fixture ID binding is missing, duplicated or invalid");
    row.id = matches[0].id;
  }
  require(new Set(expected.map((row) => row.id)).size === 2, "fixture IDs are duplicated");
  return { sourceSha, seedSqlSha256: hash(sql), allocatedIdsSha256: hash(allocated), serviceName: "test_service",
    serviceId: "svc-test-service-feature", layerId: 0, expected };
}

async function loadFixture() {
  return fixtureBinding(await readFile(process.env.HONUA_MCP_SEED_SQL ?? ""), await readFile(process.env.HONUA_MCP_FIXTURE_IDS ?? ""),
    process.env.HONUA_MCP_SEED_SOURCE_SHA, process.env.HONUA_MCP_SERVER_SOURCE_SHA);
}

function success(result) {
  require(result?.isError !== true, "semantic tool returned an error");
  return toolOutput(result);
}

async function negative(call, name, arguments_, code) {
  const result = await call(name, arguments_);
  const output = toolOutput(result);
  require(result.isError === true && output.status === "error" && output.code === code, "semantic negative did not preserve its typed refusal");
}

export function verifyQuery(output, fixture) {
  const collection = output.geojson ?? output.geoJson;
  require(collection?.type === "FeatureCollection" && Array.isArray(collection.features) && collection.features.length === 2,
    "query did not return the two authored fixture features");
  require(output.layerId === 0 && output.returnedCount === 2 && output.exceededTransferLimit === false,
    "query envelope is partial, unrelated or malformed");
  const actual = new Map();
  for (const feature of collection.features) {
    const expected = fixture.expected.find((row) => row.name === feature.properties?.name);
    require(expected && !actual.has(expected.name) && Number(feature.id) === expected.id
      && feature.properties.count === expected.count && feature.geometry?.type === "Point"
      && Array.isArray(feature.geometry.coordinates) && feature.geometry.coordinates.length === 2
      && feature.geometry.coordinates.every((value, index) => typeof value === "number" && Math.abs(value - expected.coordinates[index]) < 1e-8),
    "query ID, typed properties or geometry differs from the independent authored fixture");
    actual.set(expected.name, feature.id);
  }
  return [...actual.keys()].sort();
}

export function verifyLayers(output, fixture) {
  require(Array.isArray(output.layers) && output.layerCount === output.layers.length && output.hasMore === false,
    "layer discovery is malformed or incomplete");
  // The seed publishes the same layer through feature/map/OGC services. Bind the
  // authored feature-service publication rather than assuming its name is unique.
  const layers = output.layers.filter((layer) => layer.serviceName === fixture.serviceName
    && layer.serviceId === fixture.serviceId && layer.layerId === fixture.layerId);
  require(layers.length === 1 && layers[0].geometryType === "Point" && layers[0].srid === 4326,
    "layer discovery did not identify the authored point feature-service publication");
}

export async function readScenarios(call, record) {
  const fixture = loadFixture();
  const prove = (value) => ({ schema: "honua.mcp-read-semantic-proof/v1", positive: true, negative: true, mediaSchema: true,
    fixtureSourceSha: value.sourceSha, seedSqlSha256: value.seedSqlSha256, allocatedIdsSha256: value.allocatedIdsSha256 });
  await record("tools/call:list_capabilities", async () => {
    const bound = await fixture;
    const output = success(await call("honua_list_capabilities", {}));
    require(typeof output.serverName === "string" && output.serverName && typeof output.serverVersion === "string"
      && Array.isArray(output.protocolVersions) && output.protocolVersions.length > 0
      && Array.isArray(output.tools) && output.tools.length > 0 && output.toolCount === output.tools.length
      && Number.isInteger(output.totalToolCount) && output.totalToolCount >= output.toolCount,
    "capability discovery output is empty or malformed");
    await negative(call, "honua_list_capabilities", { toolCursor: "not-a-valid-certification-cursor" }, "invalid_argument");
    return prove(bound);
  });
  await record("tools/call:list_layers", async () => {
    const bound = await fixture;
    const output = success(await call("honua_list_layers", { filter: bound.serviceName, limit: 20 }));
    verifyLayers(output, bound);
    await negative(call, "honua_list_layers", { limit: 0 }, "invalid_argument");
    return prove(bound);
  });
  await record("tools/call:query_features", async () => {
    const bound = await fixture;
    const output = success(await call("honua_query_features", { serviceId: bound.serviceName, layerId: bound.layerId,
      where: "name IN ('alpha','beta')", outFields: ["name", "count"], outSrid: 4326, returnGeometry: true, limit: 3 }));
    const names = verifyQuery(output, bound);
    await negative(call, "honua_query_features", { serviceId: "__certification_missing_service__", layerId: 0 }, "not_found");
    return { ...prove(bound), observedNames: names };
  });
}
