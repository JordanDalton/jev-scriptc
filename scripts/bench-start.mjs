import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureBinary } from "./ensure-binary.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const binary = ensureBinary();
const build = JSON.parse(readFileSync(join(root, "dist", "build.json"), "utf8"));

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

function measure(kind) {
  const command = kind === "node" ? process.execPath : binary;
  const args = kind === "node"
    ? ["--experimental-strip-types", join(root, "jev.ts"), "--help"]
    : ["--help"];
  const start = performance.now();
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(`${kind} failed: ${result.error?.message || result.stderr || `exit ${result.status}`}`);
  }
  return performance.now() - start;
}

measure("node");
measure("native");
const samples = { node: [], native: [] };
for (let i = 0; i < 30; i++) {
  for (const kind of i % 2 === 0 ? ["node", "native"] : ["native", "node"]) {
    samples[kind].push(measure(kind));
  }
}
const nodeMedian = percentile(samples.node, 0.5);
const nativeMedian = percentile(samples.native, 0.5);
process.stdout.write(`${process.platform}/${process.arch}, Node ${process.version}, ScriptC ${build.scriptc}\n`);
process.stdout.write("Cold process start, 30 runs each, after one warmup each (--help only)\n");
process.stdout.write(`Node:   median ${nodeMedian.toFixed(1)} ms, p95 ${percentile(samples.node, 0.95).toFixed(1)} ms\n`);
process.stdout.write(`Native: median ${nativeMedian.toFixed(1)} ms, p95 ${percentile(samples.native, 0.95).toFixed(1)} ms\n`);
process.stdout.write(`Median speedup: ${(nodeMedian / nativeMedian).toFixed(2)}x\n`);
process.stdout.write(`Node samples (ms): ${samples.node.map((ms) => ms.toFixed(1)).join(", ")}\n`);
process.stdout.write(`Native samples (ms): ${samples.native.map((ms) => ms.toFixed(1)).join(", ")}\n`);
