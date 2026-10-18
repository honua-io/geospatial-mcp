import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const repository = "honua-io/honua-server";
const prefix = "tests/mcp-certification/";
const runtimeFiles = ["request-cancellation.mjs", "postgres-cancellation-observer.mjs"];
const require = (condition) => { if (!condition) throw new Error("candidate server cancellation helper binding is missing or mismatched"); };

async function verifyRuntimeFiles(directory, candidateSha, files) {
  require(/^[0-9a-f]{40}$/.test(candidateSha ?? ""));
  const binding = JSON.parse(await readFile(join(directory, "source-binding.json"), "utf8"));
  require(binding.schema === "honua.candidate-server-harness-binding/v1" && binding.repository === repository
    && binding.sourceSha === candidateSha);
  for (const file of files) {
    const path = join(directory, file);
    const metadata = await lstat(path);
    require(metadata.isFile() && !metadata.isSymbolicLink() && metadata.size > 0 && metadata.size <= 1024 * 1024);
    const bytes = await readFile(path);
    const retained = binding.files?.[prefix + file];
    require(retained?.sha256 === createHash("sha256").update(bytes).digest("hex")
      && retained.gitBlob === createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex"));
  }
}

export async function loadServerHarness(directory, candidateSha, importModule = (url) => import(url)) {
  await verifyRuntimeFiles(directory, candidateSha, runtimeFiles);
  const module = await importModule(pathToFileURL(join(directory, runtimeFiles[0])).href);
  require(module.CANCELLATION_HARNESS_CONTRACT === "honua.mcp-request-cancellation-driver/v1"
    && typeof module.requestCancellation === "function" && typeof module.observerConfiguration === "function"
    && typeof module.PostgresCancellationObserver === "function");
  return module;
}

export async function loadInspectorPaginationHarness(directory, candidateSha, importModule = (url) => import(url)) {
  await verifyRuntimeFiles(directory, candidateSha, ["inspector-pagination.mjs"]);
  const module = await importModule(pathToFileURL(join(directory, "inspector-pagination.mjs")).href);
  require(module.INSPECTOR_PAGINATION_CONTRACT === "honua.inspector-pagination-observer/v1"
    && typeof module.observeInspectorPagination === "function");
  return module;
}

export async function loadInspectorCancellationHarness(directory, candidateSha, importModule = (url) => import(url)) {
  await verifyRuntimeFiles(directory, candidateSha, ['inspector-browser-cancellation.mjs', 'inspector-public-ui.mjs',
    'postgres-cancellation-observer.mjs', 'browser/package.json', 'browser/package-lock.json']);
  const module = await importModule(pathToFileURL(join(directory, 'inspector-browser-cancellation.mjs')).href);
  const ui = await importModule(pathToFileURL(join(directory, 'inspector-public-ui.mjs')).href);
  const database = await importModule(pathToFileURL(join(directory, 'postgres-cancellation-observer.mjs')).href);
  require(module.INSPECTOR_CANCELLATION_CONTRACT === 'honua.inspector-browser-cancellation-proof/v1'
    && typeof module.inspectorBrowserCancellation === 'function' && typeof ui.openInspectorPublicUi === 'function'
    && typeof database.observerConfiguration === 'function' && typeof database.PostgresCancellationObserver === 'function');
  return { ...module, ...ui, ...database };
}
