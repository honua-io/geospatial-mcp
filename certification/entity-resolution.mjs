import { isDeepStrictEqual } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

// Independent authored base-schema service, also used by semantic-reads.mjs.
const service = { serviceName: "test_service", serviceId: "svc-test-service-feature", name: "test_service" };
const missing = "__certification_entity_does_not_exist_7eacb821__";
const require = (condition, message) => { if (!condition) throw new Error(message); };
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export function entityRequests() {
  return [
    { id: "by-id", arguments: { text: service.serviceId, entityType: "service", limit: 50 } },
    { id: "by-name", arguments: { text: service.serviceName, entityType: "service", limit: 50 } },
    { id: "absent", arguments: { text: missing, entityType: "service", limit: 50 } },
    { id: "invalid-limit", arguments: { text: service.serviceName, entityType: "service", limit: 0 } },
  ];
}

function outputOf(result, error) {
  require(object(result) && (error ? result.isError === true : result.isError === undefined || result.isError === false),
    "entity resolution returned the wrong tool status");
  const outputs = [];
  if (result.structuredContent !== undefined) {
    require(object(result.structuredContent), "entity structured output is malformed");
    outputs.push(result.structuredContent);
  }
  if (result.content !== undefined) {
    require(Array.isArray(result.content) && result.content.length <= 1, "entity content is ambiguous");
    for (const content of result.content) {
      require(content?.type === "text" && typeof content.text === "string", "entity content is not JSON text");
      const parsed = JSON.parse(content.text);
      require(object(parsed), "entity text output is malformed");
      outputs.push(parsed);
    }
  }
  require(outputs.length > 0 && outputs.every((output) => isDeepStrictEqual(output, outputs[0])),
    "entity output is missing or conflicting across media");
  return outputs[0];
}

export function verifyEntityResolution(observations) {
  const requests = entityRequests();
  require(Array.isArray(observations) && observations.length === requests.length, "entity observations are partial or duplicated");
  for (const [index, expected] of requests.entries()) {
    const actual = observations[index];
    require(object(actual) && actual.id === expected.id && isDeepStrictEqual(actual.arguments, expected.arguments),
      "entity request differs from the authored scenario");
    const output = outputOf(actual.result, expected.id === "invalid-limit");
    if (expected.id === "invalid-limit") {
      require(output.status === "error" && output.code === "invalid_argument"
        && typeof output.message === "string" && output.message.length > 0
        && output.matches === undefined, "invalid entity limit did not yield the typed refusal");
      continue;
    }
    require(output.query === expected.arguments.text && output.entityType === "service"
      && Number.isSafeInteger(output.matchCount) && Array.isArray(output.matches)
      && output.matchCount === output.matches.length && output.matches.length <= expected.arguments.limit,
    "entity result has the wrong query, type or count");
    const ids = new Set();
    let priorScore = Infinity;
    for (const match of output.matches) {
      require(object(match) && match.kind === "service" && (match.layerId === null || match.layerId === undefined)
        && [match.serviceId, match.serviceName, match.name].every((value) => typeof value === "string" && value.length > 0)
        && !ids.has(match.serviceId) && typeof match.score === "number" && Number.isFinite(match.score)
        && match.score > 0 && match.score <= 1 && match.score <= priorScore
        && ["type", "geometryType", "description"].every((key) => match[key] == null || typeof match[key] === "string"),
      "entity matches contain malformed, duplicate or incorrectly ranked identities");
      ids.add(match.serviceId);
      priorScore = match.score;
    }
    if (expected.id === "absent") {
      require(output.matches.length === 0, "missing entity query invented a match");
    } else {
      const matches = output.matches.filter((match) => match.serviceId === service.serviceId);
      require(matches.length === 1 && matches[0].serviceName === service.serviceName
        && matches[0].name === service.name && matches[0].score === 1,
      "entity resolution did not identify the authored service with an exact match");
      if (expected.id === "by-id") require(output.matches.length === 1, "exact service ID resolved unrelated entities");
    }
  }
  return true;
}

export async function entityScenario(call, fixture) {
  require(fixture.serviceId === service.serviceId && fixture.serviceName === service.serviceName,
    "entity scenario requires the independently bound authored service");
  const observations = [];
  const retained = `${resolve(process.env.CERT_RESULTS ?? "results.json")}.entity-resolution.raw.json`;
  await mkdir(dirname(retained), { recursive: true });
  try {
    for (const request of entityRequests()) {
      const result = await call("honua_resolve_entity", structuredClone(request.arguments));
      observations.push({ ...request, result });
    }
  } finally { await writeFile(retained, `${JSON.stringify(observations, null, 2)}\n`); }
  verifyEntityResolution(observations);
  return observations;
}
