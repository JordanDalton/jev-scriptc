import { readFileSync } from "node:fs";

type Question = {
  type: "noul" | "choice" | "score";
  instructions: unknown;
  criteria?: unknown;
};

type Pack = {
  model?: string;
  questions: Record<string, Question>;
};

class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number) {
    super(message);
    this.exitCode = exitCode;
  }
}

const usage = `Usage: jev run <pack.json> [--state <text> | --state-json]

Reads state from stdin by default. --state-json parses stdin as a JSON object or array.
Set TYPESAFE_API_KEY to your TypeSafe API key.
`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parsePack(contents: string): Pack {
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new CliError("Pack is not valid JSON", 2);
  }
  if (!isRecord(value) || !isRecord(value.questions)) {
    throw new CliError("Pack must contain a questions object", 2);
  }
  if (value.model !== undefined && (typeof value.model !== "string" || value.model.length === 0)) {
    throw new CliError("Pack model must be a nonempty string", 2);
  }
  const entries = Object.entries(value.questions);
  if (entries.length === 0) {
    throw new CliError("Pack must contain at least one question", 2);
  }
  for (const [id, raw] of entries) {
    if (!isRecord(raw) || !["noul", "choice", "score"].includes(String(raw.type))) {
      throw new CliError(`Question ${id} has an invalid type`, 2);
    }
    if (raw.instructions === undefined || raw.instructions === null || raw.instructions === "") {
      throw new CliError(`Question ${id} needs instructions`, 2);
    }
    if (raw.type === "choice" && (!isRecord(raw.criteria) || Object.keys(raw.criteria).length < 2 || Object.keys(raw.criteria).length > 255)) {
      throw new CliError(`Question ${id} needs 2 to 255 choices`, 2);
    }
    if (raw.type === "score" && (!Array.isArray(raw.criteria) || raw.criteria.length < 2 || raw.criteria.length > 10)) {
      throw new CliError(`Question ${id} needs 2 to 10 score levels`, 2);
    }
  }
  return value as Pack;
}

function parseArgs(args: string[]): { packPath: string; stateText?: string; jsonState: boolean } {
  if (args[0] !== "run" || !args[1]) {
    throw new CliError(usage, 2);
  }
  let stateText: string | undefined;
  let jsonState = false;
  for (let i = 2; i < args.length; i++) {
    if (args[i] === "--state" && args[i + 1] !== undefined) {
      stateText = args[++i];
    } else if (args[i] === "--state-json") {
      jsonState = true;
    } else {
      throw new CliError(`Unknown or incomplete option: ${args[i]}`, 2);
    }
  }
  if (jsonState && stateText !== undefined) {
    throw new CliError("Use --state or --state-json, not both", 2);
  }
  return { packPath: args[1], stateText, jsonState };
}

function readState(stateText: string | undefined, jsonState: boolean): unknown {
  let input = stateText;
  if (input === undefined) {
    input = readFileSync(0, "utf8");
  }
  if (input.length === 0) {
    throw new CliError("State is empty", 2);
  }
  if (!jsonState) return input;
  let state: unknown;
  try {
    state = JSON.parse(input);
  } catch {
    throw new CliError("State is not valid JSON", 2);
  }
  if (!isRecord(state) && !Array.isArray(state)) {
    throw new CliError("JSON state must be an object or array", 2);
  }
  return state;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function evaluate(pack: Pack, state: unknown, apiKey: string): Promise<unknown> {
  const endpoint = process.env.TYPESAFE_API_URL || "https://api.typesafe.ai/v1/systemone";
  const payload = JSON.stringify({ state, model: pack.model || "jev-latest", questions: pack.questions });
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: payload,
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new CliError("Could not reach the TypeSafe API", 5);
    }
    if (response.status === 401) throw new CliError("TypeSafe rejected the API key (401)", 3);
    if ((response.status === 429 || response.status === 529) && attempt < 2) {
      await delay(250 * 2 ** attempt);
      continue;
    }
    if (!response.ok) throw new CliError(`TypeSafe API returned HTTP ${response.status}`, 4);
    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw new CliError("TypeSafe API returned invalid JSON", 4);
    }
    if (!isRecord(result) || !isRecord(result.answers)) {
      throw new CliError("TypeSafe API response has no answers", 4);
    }
    return result;
  }
  throw new CliError("TypeSafe API did not accept the request after retries", 4);
}

async function main(): Promise<void> {
  if (process.argv[2] === "--help" || process.argv[2] === "help") {
    process.stdout.write(usage);
    return;
  }
  const args = parseArgs(process.argv.slice(2));
  let contents: string;
  try {
    contents = readFileSync(args.packPath, "utf8");
  } catch {
    throw new CliError(`Could not read pack: ${args.packPath}`, 2);
  }
  const pack = parsePack(contents);
  const state = readState(args.stateText, args.jsonState);
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) throw new CliError("TYPESAFE_API_KEY is not set", 3);
  const result = await evaluate(pack, state, apiKey);
  process.stdout.write(JSON.stringify(result) + "\n");
}

main().catch((error: unknown) => {
  if (error instanceof CliError) {
    process.stderr.write(error.message + "\n");
    process.exitCode = error.exitCode;
  } else {
    process.stderr.write("Unexpected CLI error\n");
    process.exitCode = 5;
  }
});
