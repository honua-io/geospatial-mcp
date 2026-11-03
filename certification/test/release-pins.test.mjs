import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const directory = new URL("../", import.meta.url);
const requirements = JSON.parse(readFileSync(new URL("requirements-pins.json", directory)));

test("every honua-release producer uses the governed requirements source revision", () => {
  const files = readdirSync(directory).filter(name => name.endsWith("-pins.json"));
  let count = 0;
  for (const name of files) {
    const pins = JSON.parse(readFileSync(new URL(name, directory)));
    if (pins.repository !== "honua-io/honua-release") continue;
    count++;
    assert.equal(pins.sourceSha, requirements.sourceSha, `${name} splits the governed producer revision`);
  }
  assert.ok(count >= 11, "the complete protected producer pin set must be checked");
});
