import assert from "node:assert/strict";
import test from "node:test";
import { authorityDecisions, verifyProtectedAuthority } from "../authority-validation.mjs";

// Deliberately synthetic governance/control fixtures; no runtime proof credit.
const policy = () => ({schema:"honua.mcp-operation-auth-policy/v1", revision:"mcp-operation-auth-v1",
  owner_issue:"https://github.com/honua-io/honua-release/issues/695", required_observations:{
    "anonymous-public-v1":["anonymous-success","fresh-anonymous-session","no-credentials"],
    "mcp-protected-operation-v1":["authenticated-success","fresh-anonymous-refusal","no-credential-forwarding","no-authenticated-session-reuse","caller-session-binding"]},
  operations:[{operation:"tools/call:get_style",auth_policy_revision:"mcp-protected-operation-v1"}]});
const rows = [{surface:"mcp",operation:"tools/call:get_style"}];
test("authority policy requires exact covered operations and every reviewed observation", () => {
  assert.equal(authorityDecisions(policy(),rows).get(rows[0].operation),"mcp-protected-operation-v1");
  for (const mutate of [p=>{p.revision="old";},p=>{p.operations.push({...p.operations[0]});},
    p=>{p.operations=[];},p=>{p.operations[0].auth_policy_revision="invented";},
    p=>{p.required_observations["mcp-protected-operation-v1"].pop();}]) {
    const value=policy();mutate(value);
    assert.throws(()=>authorityDecisions(value,rows),/governed MCP authority/);
  }
  assert.throws(()=>authorityDecisions(policy(),[...rows,{surface:"mcp",operation:"tools/call:unknown"}]),/coverage/);
});
test("authority flags, fabricated wire, and unsupported public calls cannot replace the independent oracle", () => {
  const identity={sourceSha:"a".repeat(40),imageDigest:`sha256:${"b".repeat(64)}`};
  const client={canonicalClient:"Official MCP TypeScript SDK",version:"1.32.1"};
  for (const proof of [undefined,{}, {authenticated:true,anonymousRefused:true,freshSession:true},
    {schema:"honua.mcp-style-proof/v1",positive:true,negative:true,mediaSchema:true,
      observations:{calls:[{authenticated:true,wire:{method:"tools/call",expectedParams:{name:"honua_get_style"}}},
        {authenticated:false,wire:{method:"tools/call",expectedParams:{name:"honua_get_style"}}}]}}]) {
    assert.equal(verifyProtectedAuthority(proof,identity,"tools/call:get_style",client),false);
  }
  for (const operation of ["ping","tools/list","tools/call:query_features","tools/call:clarify_intent"])
    assert.equal(verifyProtectedAuthority({positive:true,negative:true},identity,operation,client),false);
});
