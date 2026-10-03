import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureBinary } from "./ensure-binary.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, "jev.ts");
const pack = join(root, "examples", "support.json");
const state = process.env.JEV_BENCH_STATE || "My Stripe integration stopped working. Please refund my subscription.";
const runs = process.argv[2] === undefined ? 10 : Number(process.argv[2]);

if (!Number.isInteger(runs) || runs < 2 || runs > 100) {
  process.stderr.write("Usage: node scripts/bench-live.mjs [runs: 2-100]\n");
  process.exit(2);
}
if (!process.env.TYPESAFE_API_KEY) {
  process.stderr.write("TYPESAFE_API_KEY is not set. Load .env or export the key first.\n");
  process.exit(2);
}
const binary = ensureBinary();
const build = JSON.parse(readFileSync(join(root, "dist", "build.json"), "utf8"));

function percentile(samples, fraction) {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

function run(kind) {
  const command = kind === "node" ? process.execPath : binary;
  const args = kind === "node"
    ? ["--experimental-strip-types", source, "run", pack, "--state", state]
    : ["run", pack, "--state", state];
  const start = performance.now();
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", timeout: 30000 });
  const elapsed = performance.now() - start;
  if (result.error || result.status !== 0) {
    throw new Error(`${kind} failed: ${result.error?.message || result.stderr || `exit ${result.status}`}`);
  }
  const response = JSON.parse(result.stdout);
  if (response.answers === null || typeof response.answers !== "object") {
    throw new Error(`${kind} returned no answers`);
  }
  return { elapsed, answerKeys: Object.keys(response.answers).sort().join(","), model: response.model };
}

try {
  const warmupNode = run("node");
  const warmupNative = run("native");
  const expected = warmupNode.answerKeys;
  if (warmupNative.answerKeys !== expected || warmupNative.model !== warmupNode.model) {
    throw new Error("Node and native responses differ in answer keys or resolved model");
  }

  const samples = { node: [], native: [] };
  for (let i = 0; i < runs; i++) {
    const order = i % 2 === 0 ? ["node", "native"] : ["native", "node"];
    for (const kind of order) {
      const result = run(kind);
      if (result.answerKeys !== expected || result.model !== warmupNode.model) {
        throw new Error(`${kind} answer keys or resolved model changed`);
      }
      samples[kind].push(result.elapsed);
    }
  }

  const nodeMedian = percentile(samples.node, 0.5);
  const nativeMedian = percentile(samples.native, 0.5);
  process.stdout.write(`${process.platform}/${process.arch}, Node ${process.version}, ScriptC ${build.scriptc}, Jev ${warmupNode.model}\n`);
  process.stdout.write(`End-to-end time, ${runs} runs each, after one warmup each\n`);
  process.stdout.write(`Node:   median ${nodeMedian.toFixed(1)} ms, p95 ${percentile(samples.node, 0.95).toFixed(1)} ms\n`);
  process.stdout.write(`Native: median ${nativeMedian.toFixed(1)} ms, p95 ${percentile(samples.native, 0.95).toFixed(1)} ms\n`);
  process.stdout.write(`Median speedup: ${(nodeMedian / nativeMedian).toFixed(2)}x\n`);
  process.stdout.write(`Node samples (ms): ${samples.node.map((ms) => ms.toFixed(1)).join(", ")}\n`);
  process.stdout.write(`Native samples (ms): ${samples.native.map((ms) => ms.toFixed(1)).join(", ")}\n`);
} catch (error) {
  process.stderr.write(`Benchmark stopped: ${error.message}\n`);
  process.exitCode = 1;
}
