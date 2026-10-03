# Benchmarking Node and ScriptC

The scripts compare the same `jev.ts` entry point running under Node and as a ScriptC compiled native executable. They exclude compilation time. `bench:start` invokes `--help` 30 times per version, after one warmup each. `bench-live.mjs` sends the same example pack and state to TypeSafe for the requested number of runs, also after one warmup each. Both alternate Node and native calls and report median, p95, individual samples, platform, Node version, and pinned ScriptC version. The reported median and p95 use the nearest-rank percentile method. The live benchmark checks that both paths return the same answer keys and resolved model.

## Run with recorded samples

On 2026-10-03, the project owner ran `node --env-file=.env scripts/bench-live.mjs 10` on macOS Intel with Node 24.21.0, ScriptC 0.2.2, and Jev 1.13.0. The script reported:

| Runtime | Median | p95 |
| --- | ---: | ---: |
| Node | 361.0 ms | 412.0 ms |
| Native | 160.6 ms | 246.2 ms |

The reported median speedup was 2.25×. Individual samples, in measurement order:

```text
Node (ms):   367.4, 360.2, 378.7, 354.0, 361.0, 412.0, 376.8, 375.3, 347.8, 346.8
Native (ms): 246.2, 160.9, 156.0, 172.3, 148.0, 159.9, 152.7, 189.6, 167.1, 160.6
```

## Earlier observed result

On 2026-10-03, the project owner ran `node --env-file=.env scripts/bench-live.mjs 10` on macOS Intel. This was recorded before the script printed runtime versions and individual samples, so those details are unavailable for this run.

| Runtime | Median | p95 |
| --- | ---: | ---: |
| Node | 363.7 ms | 433.9 ms |
| Native | 170.2 ms | 227.9 ms |

The native median was 2.14× faster for that run. The complete request includes process startup, network travel, and Jev inference. The result does not isolate model speed. Network and API load can change, so use multiple runs before generalizing the ratio.

To reproduce the measurement with current code:

```sh
npm ci
npm run coverage:compile
npm run build
npm run bench:start
node --env-file=.env scripts/bench-live.mjs 10
```
