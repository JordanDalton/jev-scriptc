import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..");
const binary = resolve(root, "dist/jev");
const pack = resolve(root, "examples/support.json");

function run(args, endpoint, input = "") {
  return new Promise((resolveRun, reject) => {
    const child = spawn(binary, args, {
      cwd: root,
      env: { ...process.env, TYPESAFE_API_KEY: "native-test-key", TYPESAFE_API_URL: endpoint },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolveRun({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

async function withServer(handler, action) {
  const server = createServer(handler);
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  try {
    const address = server.address();
    return await action(`http://127.0.0.1:${address.port}/v1/systemone`);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

test("native binary sends the API request and prints the response", async () => {
  let received;
  await withServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    received = { authorization: request.headers.authorization, body: JSON.parse(body) };
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ model: "jev-test", answers: { department: { type: "choice", choice: "technical" }, is_urgent: { type: "noul", noul: 0.7 } } }));
  }, async (endpoint) => {
    const result = await run(["run", pack, "--state", "The integration is broken"], endpoint);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).answers.department.choice, "technical");
  });
  assert.equal(received.authorization, "Bearer native-test-key");
  assert.equal(received.body.state, "The integration is broken");
  assert.equal(received.body.model, "jev-latest");
  assert.deepEqual(Object.keys(received.body.questions).sort(), ["department", "is_urgent"]);
});

test("native binary retries 429 and 529 responses", async () => {
  let calls = 0;
  await withServer((_request, response) => {
    calls++;
    response.statusCode = calls === 1 ? 429 : calls === 2 ? 529 : 200;
    response.setHeader("Content-Type", "application/json");
    response.end(calls === 3 ? JSON.stringify({ answers: {} }) : "{}");
  }, async (endpoint) => {
    const result = await run(["run", pack, "--state", "hello"], endpoint);
    assert.equal(result.code, 0, result.stderr);
  });
  assert.equal(calls, 3);
});

test("native binary preserves structured state and authentication errors", async () => {
  let receivedState;
  await withServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    receivedState = JSON.parse(body).state;
    response.statusCode = 401;
    response.end("{}");
  }, async (endpoint) => {
    const result = await run(["run", pack, "--state-json"], endpoint, '{"ticket":"hello"}');
    assert.equal(result.code, 3);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /401/);
    assert.doesNotMatch(result.stderr, /native-test-key/);
  });
  assert.deepEqual(receivedState, { ticket: "hello" });
});
