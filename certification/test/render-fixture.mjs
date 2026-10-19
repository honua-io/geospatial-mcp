// Controlled offline fixture for receipt controls only. Never a producer input.
import { deflateSync } from "node:zlib";

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(kind, bytes) {
  const body = Buffer.concat([Buffer.from(kind), bytes]);
  const header = Buffer.alloc(4), crc = Buffer.alloc(4);
  header.writeUInt32BE(bytes.length); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([header, body, crc]);
}

export function controlledRenderBootstrap(candidateSourceSha, candidateImage, fixtureSha256) {
  return { schema: "honua.mcp-render-bootstrap/v1", status: "provisioned", phase: "complete",
    candidateSourceSha, candidateImage, fixtureSha256, seedSqlSha256: `sha256:${"e".repeat(64)}`,
    connectionId: "controlled-connection", published: { area: { service: "sdkreg-area", layerId: 17 } },
    ownedArea: { serviceId: "controlled-service-id", serviceName: "sdkreg-area", layerId: 3,
      storageLayerId: 17, locator: "honua_data.sdkreg_area", connectionId: "controlled-connection" },
    runtimeBinding: { schema: "honua.mcp-render-runtime/v1", running: true, candidateSourceSha, candidateImage,
      imageReference: candidateImage, imageId: `sha256:${"d".repeat(64)}`, containerId: "f".repeat(64), startedAt: "2026-10-19T00:00:00Z" },
    areaReadback: [{ gid: 1, name: "block", envelope: [-90, 0, -45, 60], srid: 4326, geometryType: "ST_Polygon" }],
  };
}

export function controlledDockerProgram(runtime) {
  // Explicit offline executable fixture for the release-owned live inspector.
  // Canonical producers inherit the real Docker binary and never import this.
  return `#!/usr/bin/env node\nconst state=${JSON.stringify(runtime)};\nconsole.log(JSON.stringify(process.argv[2]==='image' ? {imageId:state.imageId,sourceSha:state.candidateSourceSha,repoDigests:[state.candidateImage]} : Object.fromEntries(['running','imageId','imageReference','startedAt','containerId'].map(key=>[key,state[key]]))));\n`;
}

export function controlledRenderResponse(arguments_) {
  const invalidBbox = arguments_.bbox[0] > arguments_.bbox[2];
  const missing = arguments_.layers[0].layerId === 2147483647;
  if (invalidBbox || missing) {
    const value = { status: "error", code: invalidBbox ? "invalid_argument" : "not_found", message: "Controlled authored refusal" };
    return { isError: true, structuredContent: value, content: [{ type: "text", text: JSON.stringify(value) }] };
  }
  // Independently rasterize the authored world-coordinate polygon; no server
  // image, helper expectation output or alpha-only media assertion is reused.
  const width = 260, height = 320, rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4);
    const worldY = 70 - (y + 0.5) * 80 / height;
    for (let x = 0; x < width; x++) {
      const worldX = -100 + (x + 0.5) * 65 / width;
      if (worldX >= -90 && worldX <= -45 && worldY >= 0 && worldY <= 60) row.set([12, 90, 180, 255], 1 + 4 * x);
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
  const base64 = png.toString("base64");
  return { isError: false, structuredContent: { format: "image/png", width, height, byteLength: png.length,
    bbox: [-100,-10,-35,70], bboxSrid: 4326, layers: [{ serviceId: "controlled-service-id", layerId: 3 }],
    image: { format: "image/png", width, height, byteLength: png.length, base64, inlined: true } },
  content: [{ type: "text", text: "Controlled authored render" }, { type: "image", data: base64, mimeType: "image/png" }] };
}
