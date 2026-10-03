import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..");
const program = join(root, "jev.ts");
const pack = join(root, "examples", "support.json");

function run(args, input = "", env = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, ["--import", join(root, "test", "mock-fetch.mjs"), "--experimental-strip-types", program, ...args], {
      cwd: root,
      env: { ...process.env, TYPESAFE_API_KEY: "test-key", ...env },
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

test("sends a saved pack and stdin state, then returns API JSON", async () => {
  const directory = mkdtempSync(join(tmpdir(), "jev-test-"));
  const requestFile = join(directory, "requests.jsonl");
  const responses = [{ status: 200, body: { model: "jev-test", answers: { department: { type: "choice", choice: "technical", confidence: 0.8 }, is_urgent: { type: "noul", noul: 0.7 } }, usage: { input_tokens: 10, output_tokens: 2 } } }];
  const result = await run(["run", pack], "My integration is broken", { JEV_TEST_RESPONSES: JSON.stringify(responses), JEV_TEST_REQUEST_FILE: requestFile });
  const request = JSON.parse(readFileSync(requestFile, "utf8").trim());
  assert.equal(result.code, 0);
  assert.equal(JSON.parse(result.stdout).answers.department.choice, "technical");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.Authorization, "Bearer test-key");
  assert.equal(request.body.state, "My integration is broken");
  assert.equal(request.body.model, "jev-latest");
  assert.equal(Object.keys(request.body.questions).length, 2);
});

test("retries rate limits and overloads", async () => {
  const directory = mkdtempSync(join(tmpdir(), "jev-test-"));
  const requestFile = join(directory, "requests.jsonl");
  const responses = [{ status: 429 }, { status: 529 }, { status: 200, body: { answers: {} } }];
  const result = await run(["run", pack, "--state", "hello"], "", { JEV_TEST_RESPONSES: JSON.stringify(responses), JEV_TEST_REQUEST_FILE: requestFile });
  assert.equal(result.code, 0);
  assert.equal(readFileSync(requestFile, "utf8").trim().split("\n").length, 3);
});

test("reports authentication failure without printing the key", async () => {
  const result = await run(["run", pack, "--state", "hello"], "", { JEV_TEST_RESPONSES: JSON.stringify([{ status: 401 }]) });
  assert.equal(result.code, 3);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /401/);
  assert.doesNotMatch(result.stderr, /test-key/);
});

test("rejects invalid packs before a request", async () => {
  const directory = mkdtempSync(join(tmpdir(), "jev-test-"));
  const path = join(directory, "invalid.json");
  writeFileSync(path, JSON.stringify({ questions: { bad: { type: "score", instructions: "rate", criteria: ["one"] } } }));
  const result = await run(["run", path, "--state", "hello"]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /2 to 10 score levels/);
});

test("accepts structured JSON state", async () => {
  const directory = mkdtempSync(join(tmpdir(), "jev-test-"));
  const requestFile = join(directory, "requests.jsonl");
  const responses = [{ status: 200, body: { answers: {} } }];
  const result = await run(["run", pack, "--state-json"], '{"ticket":"hello"}', { JEV_TEST_RESPONSES: JSON.stringify(responses), JEV_TEST_REQUEST_FILE: requestFile });
  const request = JSON.parse(readFileSync(requestFile, "utf8").trim());
  assert.equal(result.code, 0);
  assert.deepEqual(request.body.state, { ticket: "hello" });
});
