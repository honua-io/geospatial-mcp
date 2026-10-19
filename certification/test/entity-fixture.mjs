// Authored peer observations, independent of the producer request constructor.
export function entityObservations() {
  const identity = { kind: "service", serviceId: "svc-test-service-feature", serviceName: "test_service",
    name: "test_service", layerId: null, score: 1 };
  return [
    ["by-id", "svc-test-service-feature", 50, [identity]],
    ["by-name", "test_service", 50, [identity]],
    ["absent", "__certification_entity_does_not_exist_7eacb821__", 50, []],
    ["invalid-limit", "test_service", 0, null],
  ].map(([id, text, limit, matches]) => {
    const output = matches ? { query: text, entityType: "service", matchCount: matches.length, matches }
      : { status: "error", code: "invalid_argument", message: "limit must be positive" };
    return { id, arguments: { text, entityType: "service", limit }, result: {
      ...(matches ? {} : { isError: true }), structuredContent: structuredClone(output),
      content: [{ type: "text", text: JSON.stringify(output) }],
    } };
  });
}
