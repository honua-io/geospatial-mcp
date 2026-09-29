#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { CLIENTS, CONTRACT_REVISION, FIXTURE_REVISION, OPERATIONS, RELEASE_123 } from "./requirements.mjs";

const sha256 = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const canonical = (value) => Array.isArray(value)
  ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object"
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
    : JSON.stringify(value);

export function buildFragment({ identity, results, now = new Date().toISOString() }) {
  for (const key of ["sourceSha", "producerSourceSha", "imageDigest", "cutAt", "startedAt", "runtimeEnvironment"]) {
    if (!identity[key]) throw new Error(`missing identity.${key}`);
  }
  if (!/^[0-9a-f]{40}$/.test(identity.sourceSha) || !/^[0-9a-f]{40}$/.test(identity.producerSourceSha)) {
    throw new Error("source revisions must be full lowercase commit SHAs");
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(identity.imageDigest)) throw new Error("image digest must be immutable");
  const protocolVersions = Object.fromEntries(Object.entries(CLIENTS).map(([clientKey]) => {
    const clientResults = results[clientKey];
    const version = clientResults?.protocolVersion;
    const initializationFailed = clientResults?.checks?.initialize?.result === "fail";
    if (!version && !initializationFailed) throw new Error(`missing negotiated protocol version for ${clientKey}`);
    return [clientKey, version ?? null];
  }));

  const observations = Object.entries(CLIENTS).flatMap(([clientKey, client]) =>
    OPERATIONS.map(([capabilityKey, operation]) => {
      const execution = results[clientKey]?.checks?.[operation];
      const executable = ["initialize", "ping", "tools/list", "resources/templates/list"].includes(operation);
      const behaviorPassed = ["behavior/auth", "behavior/error", "behavior/cancellation", "behavior/resources-pagination"]
        .every((name) => results[clientKey]?.checks?.[name]?.result === "pass");
      const result = execution?.result === "fail"
        ? "fail"
        : executable && execution?.result === "pass" && behaviorPassed
          ? "pass"
          : "skip";
      const scenarioFacets = ["positive", "negative", "media-schema"];
      const receipt = result === "pass" ? {
        schema: "honua.certification-evidence-receipt/v1",
        identity: {
          capability_key: capabilityKey,
          surface: "mcp",
          operation,
          canonical_client: client.canonicalClient,
          client_version: client.version,
          deployment_target: "local-docker",
          source_sha: identity.sourceSha,
          producer_source_sha: identity.producerSourceSha,
          image_digest: identity.imageDigest,
          runtime_environment: identity.runtimeEnvironment,
          protocol_version: protocolVersions[clientKey],
          fixture_revision: FIXTURE_REVISION,
          contract_revision: CONTRACT_REVISION,
          auth_policy_revision: "anonymous-public-v1",
          started_at: execution.startedAt ?? identity.startedAt,
          completed_at: execution.completedAt ?? now,
        },
        result: "pass",
        facets: Object.fromEntries(scenarioFacets.map((facet) => [facet, "pass"])),
        payload_base64: Buffer.from(JSON.stringify(results[clientKey]), "utf8").toString("base64"),
      } : null;
      const digest = receipt ? sha256(canonical(receipt)) : null;
      return {
        surface: "mcp",
        operation,
        scenario_facets: scenarioFacets,
        canonical_client: client.canonicalClient,
        client_id: client.clientId,
        runner_lane: client.lane,
        protocol_version: protocolVersions[clientKey],
        protocol_profile: "Streamable HTTP",
        performed_by: client.canonicalClient,
        request_url: results[clientKey]?.requestUrl ?? identity.requestUrl,
        exercised_capabilities: result === "pass" ? scenarioFacets : [],
        client_version: client.version,
        deployment_target: "local-docker",
        result,
        skip_reason: result === "skip"
          ? executable ? `${client.canonicalClient} check did not pass` : `blocked on deterministic terminal-journey adapter: ${RELEASE_123}`
          : null,
        source_sha: identity.sourceSha,
        producer_source_sha: identity.producerSourceSha,
        image_digest: identity.imageDigest,
        runtime_environment: identity.runtimeEnvironment,
        fixture_revision: FIXTURE_REVISION,
        contract_revision: CONTRACT_REVISION,
        auth_policy_revision: "anonymous-public-v1",
        evidence_uri: digest ? `https://evidence.honua.io/data/sha256/${digest.slice(7)}` : null,
        evidence_digest: digest,
        evidence_receipt: receipt,
        facet_results: digest ? Object.fromEntries(scenarioFacets.map((facet) => [facet, { result: "pass", evidence_digest: digest }])) : null,
        started_at: execution?.startedAt ?? identity.startedAt,
        completed_at: execution?.completedAt ?? now,
      };
    }),
  );
  return {
    schema: "honua.protocol-certification-fragment/v1",
    producer: "geospatial-mcp",
    generated_at: now,
    candidate: { source_sha: identity.sourceSha, image_digest: identity.imageDigest, cut_at: identity.cutAt },
    operation_scope: { complete: true, owner_issue: "https://github.com/honua-io/geospatial-mcp/issues/78" },
    observations,
  };
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const input = JSON.parse(await readFile(process.argv[2], "utf8"));
  await writeFile(process.argv[3], `${JSON.stringify(buildFragment(input), null, 2)}\n`);
}
