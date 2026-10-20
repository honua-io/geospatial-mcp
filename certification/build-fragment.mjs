#!/usr/bin/env node
import { verifyDirectCancelProof } from "./direct-cancel-validation.mjs";
import { verifyPlanningProof } from "./planning-validation.mjs";
import { authorityDecisions, verifyProtectedAuthority } from "./authority-validation.mjs";
import { verifyAppPackageProof } from "./app-package-validation.mjs";
import { verifyPublishResultProof } from "./publish-result-validation.mjs";
import { verifyLocationProof } from "./location-validation.mjs";
import { verifyOpsHealthProof } from "./ops-health-validation.mjs";
import { verifyOpsEventsProof } from "./ops-events-validation.mjs";
import { verifyGroundingStatusProof } from "./grounding-status-validation.mjs";
import { verifyExecutePlanProof } from "./execute-plan-validation.mjs";
import { verifyStyleProof } from "./style-validation.mjs";
import { verifyIngestPublishProof } from "./ingest-publish-validation.mjs";
import { verifyMapPackageProof } from "./map-package-validation.mjs";
import { verifyPlanProof } from "./plan-validation.mjs";
import { verifyRenderProof } from "./render-validation.mjs";
import { verifyEntityResolution } from "./entity-resolution.mjs";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { CLIENTS, CONTRACT_REVISION, FIXTURE_REVISION, OPERATIONS, RELEASE_123 } from "./requirements.mjs";
import { verifyCancellationProof } from "./cancellation-proof.mjs";
import { verifyInspectorPaginationProof } from "./pagination-proof.mjs";
import { verifyInspectorCancellationProof } from "./inspector-cancellation-proof.mjs";

const sha256 = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const canonical = (value) => Array.isArray(value)
  ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object"
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
    : JSON.stringify(value);

export function buildFragment({ identity, results, requirements, authPolicy, executedTier, now = new Date().toISOString() }) {
  if (requirements?.schema !== "honua.protocol-certification-requirements/v1"
      || requirements.receipt_schema_min !== "v2" || requirements.complete !== true
      || typeof requirements.revision !== "string" || !requirements.revision
      || !Array.isArray(requirements.requirements)) throw new Error("missing governed v2 requirements catalog");
  const decisions = authorityDecisions(authPolicy, requirements.requirements);
  if (decisions.size !== OPERATIONS.length || OPERATIONS.some(([, operation]) => !decisions.has(operation))
      || requirements.requirements.filter((row) => row.surface === "mcp").length !== OPERATIONS.length * Object.keys(CLIENTS).length) {
    throw new Error("governed MCP source/cohort denominator differs; source convergence is required");
  }
  const contexts = new Map();
  for (const [capabilityKey, operation] of OPERATIONS) {
    for (const client of Object.values(CLIENTS)) {
      const matches = requirements.requirements.filter((row) => row.surface === "mcp"
        && row.capability_key === capabilityKey && row.operation === operation
        && row.canonical_client === client.canonicalClient && row.client_version === client.version
        && row.deployment_target === "local-docker");
      if (matches.length !== 1) throw new Error(`missing or ambiguous governed requirement for ${client.canonicalClient} ${operation}`);
      const row = matches[0];
      if (!["supported", "preview", "deprecated", "roadmap", "experimental", "internal"].includes(row.maturity)
          || !["pr", "nightly", "release"].includes(row.required_tier)
          || canonical(row.scenario_facets) !== canonical(["positive", "negative", "media-schema", "auth"])
          || row.fixture_revision !== FIXTURE_REVISION || row.contract_revision !== CONTRACT_REVISION
          || row.auth_policy_revision !== decisions.get(operation)) throw new Error(`incompatible governed MCP context for ${operation}`);
      contexts.set(`${client.canonicalClient}:${operation}`, { maturity: row.maturity,
        required_tier: row.required_tier, requirements_revision: requirements.revision,
        auth_policy_revision: row.auth_policy_revision });
    }
  }
  const tiers = ["pr", "nightly", "release"];
  if (!tiers.includes(executedTier)) throw new Error("missing or invalid executed certification tier");
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
      const context = contexts.get(`${client.canonicalClient}:${operation}`);
      const execution = results[clientKey]?.checks?.[operation];
      const semantic = ["tools/call:list_capabilities", "tools/call:list_layers", "tools/call:query_features", "tools/call:resolve_entity"].includes(operation);
      const proof = execution?.value;
      const semanticPassed = !semantic || (proof?.schema === "honua.mcp-read-semantic-proof/v1"
        && proof.positive === true && proof.negative === true && proof.mediaSchema === true
        && proof.fixtureSourceSha === identity.sourceSha && /^sha256:[0-9a-f]{64}$/.test(proof.seedSqlSha256)
        && /^sha256:[0-9a-f]{64}$/.test(proof.allocatedIdsSha256));
      let entityPassed = operation !== "tools/call:resolve_entity";
      if (!entityPassed) {
        try { entityPassed = verifyEntityResolution(proof?.entityResolution); } catch { entityPassed = false; }
      }
      const planSemantic = operation === "tools/call:validate_plan";
      const planPassed = !planSemantic || verifyPlanProof(proof, identity.sourceSha);
      const renderSemantic = operation === "tools/call:render_map";
      const renderPassed = !renderSemantic || verifyRenderProof(proof, identity.sourceSha, identity.imageDigest);
      const mapPackageSemantic = ["tools/call:create_map_package", "resources/read:Map package"].includes(operation);
      const mapPackagePassed = !mapPackageSemantic || verifyMapPackageProof(proof, identity.sourceSha, identity.imageDigest,
        operation, client.canonicalClient, client.version);
      const ingestPublishSemantic = ["tools/call:ingest_dataset", "tools/call:publish_service", "resources/read:Published service"].includes(operation);
      const ingestPublishPassed = !ingestPublishSemantic || verifyIngestPublishProof(proof, identity.sourceSha, identity.imageDigest,
        operation, client.canonicalClient, client.version);
      const styleSemantic = ["tools/call:get_style", "tools/call:apply_style_preset"].includes(operation);
      const stylePassed = !styleSemantic || verifyStyleProof(proof, identity.sourceSha, identity.imageDigest,
        operation, client.canonicalClient, client.version);
      const executeSemantic = operation === "tools/call:execute_plan";
      const executePassed = !executeSemantic || verifyExecutePlanProof(proof, identity.sourceSha, identity.imageDigest,
        operation, client.canonicalClient, client.version);
      const publishResultSemantic = operation === "tools/call:publish_result";
      const publishResultPassed = !publishResultSemantic || verifyPublishResultProof(proof, identity.sourceSha, identity.imageDigest,
        operation, client.canonicalClient, client.version);
      const locationSemantic = ["tools/call:geocode_address", "tools/call:geocode_addresses", "tools/call:solve_route"].includes(operation);
      const locationPassed = !locationSemantic || verifyLocationProof(proof, identity.sourceSha, identity.imageDigest,
        operation, client.canonicalClient, client.version);
      const directCancelSemantic = operation === "tools/call:cancel_job";
      const directCancelPassed = !directCancelSemantic || verifyDirectCancelProof(proof, identity.sourceSha, identity.imageDigest,
        operation, client.canonicalClient, client.version);
      const planningSemantic = operation === "tools/call:plan_analysis";
      const planningPassed = !planningSemantic || verifyPlanningProof(proof, identity.sourceSha, identity.imageDigest,
        operation, client.canonicalClient, client.version);
      const opsEventsSemantic = ["tools/call:ops_findings", "tools/call:alert_events", "tools/call:operate_events", "resources/read:Ops findings"].includes(operation);
      const opsEventsPassed = !opsEventsSemantic || verifyOpsEventsProof(proof, identity.sourceSha, identity.imageDigest,
        operation, client.canonicalClient, client.version);
      const groundingStatusSemantic = ["tools/call:ground_candidates", "tools/call:clarify_intent", "tools/call:platform_release_status"].includes(operation);
      const groundingStatusPassed = !groundingStatusSemantic || verifyGroundingStatusProof(proof, identity.sourceSha,
        identity.imageDigest, operation, client.canonicalClient, client.version);
      const opsHealthSemantic = ["tools/call:ops_health", "resources/read:Ops health"].includes(operation);
      const opsHealthPassed = !opsHealthSemantic || verifyOpsHealthProof(proof, identity.sourceSha, identity.imageDigest,
        operation, client.canonicalClient, client.version);
      const appPackageSemantic = ["tools/call:create_app_package", "resources/read:App package", "tools/call:validate_package", "tools/call:preview_package"].includes(operation);
      const appPackagePassed = !appPackageSemantic || verifyAppPackageProof(proof, identity.sourceSha, identity.imageDigest,
        operation, client.canonicalClient, client.version);
      const executable = semantic || planSemantic || renderSemantic || mapPackageSemantic || ingestPublishSemantic || styleSemantic || executeSemantic || publishResultSemantic || appPackageSemantic || locationSemantic || opsHealthSemantic || opsEventsSemantic || groundingStatusSemantic || planningSemantic || directCancelSemantic || ["initialize", "ping", "tools/list", "resources/templates/list"].includes(operation);
      const cancellation = results[clientKey]?.checks?.["behavior/cancellation"]?.value;
      const behaviorPassed = ["behavior/auth", "behavior/error", "behavior/cancellation", "behavior/resources-pagination"]
        .every((name) => results[clientKey]?.checks?.[name]?.result === "pass")
        && (clientKey === "inspector" ? verifyInspectorCancellationProof(cancellation, identity.sourceSha, client.version, protocolVersions[clientKey])
          : verifyCancellationProof(cancellation, identity.sourceSha, client.canonicalClient))
        && (clientKey !== "inspector" || verifyInspectorPaginationProof(
          results[clientKey]?.checks?.["behavior/resources-pagination"]?.value, identity.sourceSha, client.version))
        && (!semantic || (cancellation.seedSqlSha256 === proof?.seedSqlSha256
          && cancellation.allocatedIdsSha256 === proof?.allocatedIdsSha256));
      const authorityPassed = context.auth_policy_revision === "mcp-protected-operation-v1"
        && verifyProtectedAuthority(proof, identity, operation, client);
      const tierSatisfied = tiers.indexOf(executedTier) >= tiers.indexOf(context.required_tier);
      const result = execution?.result === "fail"
        ? "fail"
        : tierSatisfied && executable && execution?.result === "pass" && behaviorPassed && semanticPassed && planPassed && renderPassed && mapPackagePassed && ingestPublishPassed && stylePassed && executePassed && publishResultPassed && appPackagePassed && locationPassed && opsHealthPassed && opsEventsPassed && groundingStatusPassed && planningPassed && directCancelPassed && entityPassed && authorityPassed
          ? "pass"
          : "skip";
      const scenarioFacets = ["positive", "negative", "media-schema", "auth"];
      const receipt = result === "pass" ? {
        schema: "honua.certification-evidence-receipt/v2",
        identity: {
          ...context,
          capability_key: capabilityKey,
          surface: "mcp",
          operation,
          canonical_client: client.canonicalClient,
          client_version: client.version,
          deployment_target: "local-docker",
          source_sha: identity.sourceSha,
          producer_source_sha: identity.producerSourceSha,
          image_digest: identity.imageDigest,
          fixture_revision: FIXTURE_REVISION,
          contract_revision: CONTRACT_REVISION,
          auth_policy_revision: context.auth_policy_revision,
          started_at: execution.startedAt ?? identity.startedAt,
          completed_at: execution.completedAt ?? now,
        },
        result: "pass",
        facets: Object.fromEntries(scenarioFacets.map((facet) => [facet, "pass"])),
        payload_base64: Buffer.from(JSON.stringify(results[clientKey]), "utf8").toString("base64"),
      } : null;
      const digest = receipt ? sha256(canonical(receipt)) : null;
      return {
        ...context,
        capability_key: capabilityKey,
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
          ? !tierSatisfied ? `executed ${executedTier} tier does not satisfy required ${context.required_tier} tier`
            : !executable ? `blocked on deterministic terminal-journey adapter: ${RELEASE_123}`
            : execution?.result !== "pass" ? `${client.canonicalClient} check did not pass: ${RELEASE_123}`
            : !(semanticPassed && entityPassed && planPassed && renderPassed && mapPackagePassed && ingestPublishPassed && stylePassed && executePassed && publishResultPassed && appPackagePassed && locationPassed && opsHealthPassed && opsEventsPassed && groundingStatusPassed && planningPassed && directCancelPassed) ? `candidate-bound semantic proof did not pass: ${RELEASE_123}`
            : !authorityPassed ? `candidate-bound caller/session authority proof did not pass: ${RELEASE_123}`
            : !behaviorPassed ? `candidate-bound global behavior proof did not pass: ${RELEASE_123}`
            : `${client.canonicalClient} check did not pass: ${RELEASE_123}`
          : null,
        source_sha: identity.sourceSha,
        producer_source_sha: identity.producerSourceSha,
        image_digest: identity.imageDigest,
        runtime_environment: identity.runtimeEnvironment,
        fixture_revision: FIXTURE_REVISION,
        contract_revision: CONTRACT_REVISION,
        auth_policy_revision: context.auth_policy_revision,
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
  input.requirements = JSON.parse(await readFile(process.argv[4], "utf8"));
  input.authPolicy = JSON.parse(await readFile(join(dirname(resolve(process.argv[4])), "mcp-operation-auth-policy.v1.json"), "utf8"));
  await writeFile(process.argv[3], `${JSON.stringify(buildFragment(input), null, 2)}\n`);
}
