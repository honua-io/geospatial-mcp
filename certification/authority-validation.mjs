// Authority credit requires retained actual client/wire proof adjudicated by the
// protected release-owned oracle. Policy declarations alone grant no credit.
import { verifyAppPackageProof } from "./app-package-validation.mjs";
import { verifyMapPackageProof } from "./map-package-validation.mjs";
import { verifyIngestPublishProof } from "./ingest-publish-validation.mjs";
import { verifyStyleProof } from "./style-validation.mjs";
import { verifyExecutePlanProof } from "./execute-plan-validation.mjs";
import { verifyPublishResultProof } from "./publish-result-validation.mjs";
import { verifyLocationProof } from "./location-validation.mjs";

const publicObservations = ["anonymous-success", "fresh-anonymous-session", "no-credentials"];
const protectedObservations = ["authenticated-success", "fresh-anonymous-refusal", "no-credential-forwarding", "no-authenticated-session-reuse", "caller-session-binding"];
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function authorityDecisions(policy, requirements) {
  if (policy?.schema !== "honua.mcp-operation-auth-policy/v1" || policy.revision !== "mcp-operation-auth-v1"
      || policy.owner_issue !== "https://github.com/honua-io/honua-release/issues/695"
      || !equal(policy.required_observations?.["anonymous-public-v1"], publicObservations)
      || !equal(policy.required_observations?.["mcp-protected-operation-v1"], protectedObservations)
      || Object.keys(policy.required_observations ?? {}).length !== 2 || !Array.isArray(policy.operations)) {
    throw new Error("missing or incompatible governed MCP authority policy");
  }
  const decisions = new Map();
  for (const row of policy.operations) {
    if (typeof row.operation !== "string" || !row.operation || decisions.has(row.operation)
        || !["anonymous-public-v1", "mcp-protected-operation-v1"].includes(row.auth_policy_revision)) {
      throw new Error("missing, repeated or unknown governed MCP authority decision");
    }
    decisions.set(row.operation, row.auth_policy_revision);
  }
  const operations = new Set(requirements.filter((row) => row.surface === "mcp").map((row) => row.operation));
  if (decisions.size !== operations.size || [...operations].some((operation) => !decisions.has(operation))) {
    throw new Error("governed MCP authority coverage differs from requirements");
  }
  return decisions;
}

export function verifyProtectedAuthority(proof, identity, operation, client) {
  const verifier = ["tools/call:create_app_package", "resources/read:App package", "tools/call:validate_package", "tools/call:preview_package"].includes(operation) ? verifyAppPackageProof
    : ["tools/call:create_map_package", "resources/read:Map package"].includes(operation) ? verifyMapPackageProof
    : ["tools/call:ingest_dataset", "tools/call:publish_service", "resources/read:Published service"].includes(operation) ? verifyIngestPublishProof
    : ["tools/call:get_style", "tools/call:apply_style_preset"].includes(operation) ? verifyStyleProof
    : operation === "tools/call:execute_plan" ? verifyExecutePlanProof
    : operation === "tools/call:publish_result" ? verifyPublishResultProof
    : ["tools/call:geocode_address", "tools/call:geocode_addresses", "tools/call:solve_route"].includes(operation) ? verifyLocationProof : null;
  // These complete independent oracles verify raw request/response hashes,
  // canonical installed-client launch/result, typed anonymous refusal, credential
  // fingerprints on initialization AND invocation, and fresh distinct sessions.
  // Unimplemented operations and public transport have no authority proof here.
  if (!verifier || !verifier(proof, identity.sourceSha, identity.imageDigest,
    operation, client.canonicalClient, client.version)) return false;
  const observed = proof?.observations;
  if (!observed) return false;
  const calls = [...(observed.calls ?? []), ...(observed.cases ?? []), ...(observed.reads ?? []), ...(observed.reviews ?? [])];
  const method = operation.startsWith("tools/call:") ? "tools/call" : "resources/read";
  const matches = calls.filter((entry) => entry.wire?.method === method
    && (method !== "tools/call" || entry.wire.expectedParams?.name === `honua_${operation.split(":")[1]}`));
  const positives = matches.filter((entry) => entry.authenticated === true);
  const anonymous = matches.filter((entry) => entry.authenticated === false);
  if (!positives.length || !anonymous.length) return false;
  if (method === "resources/read" && !anonymous.some((denied) => positives.some((positive) =>
    positive.wire.expectedParams?.uri === denied.wire.expectedParams?.uri))) return false;
  return true;
}
