export const CORPUS_SHA = "5e052a76b6485edbe78c3482488c58f66700bd59";
export const CONTRACT_REVISION = `geospatial-mcp@${CORPUS_SHA}`;
export const FIXTURE_REVISION = `conformance@${CORPUS_SHA}`;
export const RELEASE_123 = "https://github.com/honua-io/honua-release/issues/123";

export const OPERATIONS = [
  ["mcp.transport", "initialize"],
  ["mcp.transport", "ping"],
  ["mcp.transport", "resources/templates/list"],
  ["mcp.transport", "tools/list"],
  ["mcp.resource", "resources/read:App package"],
  ["mcp.resource", "resources/read:Deployment"],
  ["mcp.resource", "resources/read:Map package"],
  ["mcp.resource", "resources/read:Ops findings"],
  ["mcp.resource", "resources/read:Ops health"],
  ["mcp.resource", "resources/read:Published service"],
  ["mcp.resource", "resources/read:Workspace"],
  ...[
    "alert_events", "apply_style_preset", "cancel_job", "clarify_intent",
    "create_app_package", "create_map_package", "deploy_operations", "execute_plan",
    "geocode_address", "geocode_addresses", "get_style", "ground_candidates",
    "ingest_dataset", "list_capabilities", "list_layers", "operate_events",
    "ops_findings", "ops_health", "plan_analysis", "platform_release_status",
    "preview_package", "propose_operation", "propose_rollback", "publish_result",
    "publish_service", "query_features", "render_map", "resolve_entity", "solve_route",
    "validate_package", "validate_plan"
  ].map((name) => ["mcp.tool", `tools/call:${name}`]),
];

export const CLIENTS = {
  sdk: {
    canonicalClient: "Official MCP TypeScript SDK",
    clientId: "Official MCP TypeScript SDK",
    version: "1.30.0",
    lane: "mcp-typescript-sdk",
  },
  inspector: {
    canonicalClient: "MCP Inspector",
    clientId: "MCP Inspector",
    version: "2.3.0",
    lane: "mcp-inspector",
  },
};
