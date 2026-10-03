# Jev + ScriptC

A small, unofficial CLI for [TypeSafe Jev](https://docs.typesafe.ai/introduction/quickstart). Its TypeScript source runs with Node, and [ScriptC](https://scriptc.dev/docs) compiles the same source to a native executable. This repository currently tests the native build on **macOS Intel (x64)**.

## Quick start

Install Node.js 24 and npm. If you use nvm, run `nvm install` and `nvm use` from this directory. Then:

```sh
npm ci
cp -n .env.example .env
```

Put your TypeSafe API key in `.env`. The CLI itself reads `TYPESAFE_API_KEY` from the process environment; it never loads `.env` automatically. To run the Node source with that file:

```sh
node --env-file=.env --experimental-strip-types jev.ts run examples/support.json \
  --state 'My Stripe integration stopped working'
```

To build and run the native version:

```sh
npm run coverage:compile
npm run build
set -a
. ./.env
set +a
./dist/jev run examples/support.json --state 'Please refund my subscription'
```

The [example question pack](examples/support.json) asks Jev to choose a support team and judge urgency in one request. You can also pipe plain text into either version, or use `--state-json` to read an object or array from stdin:

```sh
printf '%s' '{"message":"The API is down","customer":"Acme"}' |
  ./dist/jev run examples/support.json --state-json
```

The command writes the complete TypeSafe response as one JSON line on stdout. Errors go to stderr. Exit codes are `2` for input or usage, `3` for authentication, `4` for an API response error, and `5` for a network or unexpected error. It retries HTTP 429 and 529 twice with short exponential backoff.

## Develop and verify

```sh
npm test
npm run coverage:compile
npm run build
npm run test:native
npm run check:public
```

`npm test` tests the Node path with a fetch mock. `test:native` uses a local HTTP server and tests the compiled executable without contacting TypeSafe. CI runs these checks on the [macOS Intel runner](.github/workflows/ci.yml). ScriptC is pinned to version 0.2.2 in [package.json](package.json) and [package-lock.json](package-lock.json); its coverage report should show 100% static compilation. The native binary and `.env` are ignored by Git.

The Node source also runs with Node.js 22.23 or newer using `--experimental-strip-types`. Node.js 24 is needed to install and run this pinned ScriptC compiler. [ScriptC's platform requirements](https://scriptc.dev/docs/quickstart) cover other targets, which this repository has not yet validated.

## Benchmark

```sh
npm run bench:start
node --env-file=.env scripts/bench-live.mjs 10
```

The first command compares cold startup without an API call. The second compares complete requests with the same pack and state, alternating versions; 10 measured runs plus one warmup per version make 22 API calls. Both commands rebuild a missing or stale native executable before timing. See [benchmark methodology and observed results](docs/benchmarks.md).

`TYPESAFE_API_URL` can override the default `https://api.typesafe.ai/v1/systemone` for local tests. Only set it to a server you trust: the CLI sends the bearer key to that URL.

## Sharing

This repository has no license yet, as chosen by its owner. `.env.example` contains a placeholder only. Before a public push, review `git diff --cached` for secrets and run `npm run check:public` after staging files.
