import assert from "node:assert/strict";
import test from "node:test";
import { verifyEntityResolution } from "../entity-resolution.mjs";
import { entityObservations } from "./entity-fixture.mjs";

test("entity proof accepts complete authored responses across both JSON representations", () => {
  assert.equal(verifyEntityResolution(entityObservations()), true);
  for (const media of ["structuredContent", "content"]) {
    const raw = entityObservations();
    for (const row of raw) delete row.result[media];
    assert.equal(verifyEntityResolution(raw), true);
  }
});

const mutations = {
  partial: (x) => x.pop(),
  reordered: (x) => x.reverse(),
  "wrong-request": (x) => { x[0].arguments.text = "other"; },
  "wrong-query": (x) => { x[0].result.structuredContent.query = "other"; },
  "wrong-identity": (x) => { x[0].result.structuredContent.matches[0].serviceId = "other"; },
  "wrong-name": (x) => { x[0].result.structuredContent.matches[0].serviceName = "other"; },
  "wrong-display-name": (x) => { x[0].result.structuredContent.matches[0].name = "other"; },
  "wrong-kind": (x) => { x[0].result.structuredContent.matches[0].kind = "layer"; },
  "layer-returned": (x) => { x[0].result.structuredContent.matches[0].layerId = 0; },
  "string-score": (x) => { x[0].result.structuredContent.matches[0].score = "1"; },
  "inexact-score": (x) => { x[0].result.structuredContent.matches[0].score = 0.5; },
  "out-of-range-score": (x) => { x[0].result.structuredContent.matches[0].score = 2; },
  "wrong-count": (x) => { x[0].result.structuredContent.matchCount = 2; },
  duplicate: (x) => { const out = x[0].result.structuredContent; out.matches.push(out.matches[0]); out.matchCount++; },
  invented: (x) => { x[2].result.structuredContent.matches = x[0].result.structuredContent.matches; x[2].result.structuredContent.matchCount = 1; },
  "untyped-refusal": (x) => { x[3].result.isError = false; },
  "wrong-refusal": (x) => { x[3].result.structuredContent.code = "unauthenticated"; },
  "missing-refusal-message": (x) => { delete x[3].result.structuredContent.message; },
  "data-in-refusal": (x) => { x[3].result.structuredContent.matches = []; },
};
for (const [name, mutate] of Object.entries(mutations)) {
  test(`entity oracle rejects ${name} even when both representations agree`, () => {
    const raw = entityObservations();
    mutate(raw);
    for (const row of raw) row.result.content = [{ type: "text", text: JSON.stringify(row.result.structuredContent) }];
    assert.throws(() => verifyEntityResolution(raw));
  });
}

test("entity oracle rejects conflicting, malformed, ambiguous and unrelated media", () => {
  for (const mutate of [
    (x) => { x.result.structuredContent.matchCount = 7; },
    (x) => { x.result.content[0].text = "not JSON"; },
    (x) => { x.result.content.push(x.result.content[0]); },
    (x) => { x.result.content = [{ type: "image", data: "secret" }]; },
    (x) => { x.result.structuredContent = []; },
    (x) => { delete x.result.structuredContent; x.result.content = []; },
  ]) {
    const raw = entityObservations(); mutate(raw[0]);
    assert.throws(() => verifyEntityResolution(raw));
  }
});
