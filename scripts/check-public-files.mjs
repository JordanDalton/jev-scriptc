import { spawnSync } from "node:child_process";

const result = spawnSync("git", ["ls-files", "-z"], { encoding: "utf8" });
if (result.status !== 0) {
  process.stderr.write("Run this check from a Git repository.\n");
  process.exit(1);
}

const forbidden = result.stdout.split("\0").filter((path) =>
  path !== "" && (
    /(^|\/)\.env(?:\.|$)/.test(path) && !path.endsWith(".env.example") ||
    path.startsWith("dist/") ||
    path.startsWith("node_modules/") ||
    path.startsWith(".scriptc/")
  ),
);

const possibleKeys = [];
for (const path of result.stdout.split("\0").filter(Boolean)) {
  if (path === ".env.example") continue;
  const staged = spawnSync("git", ["show", `:${path}`], { encoding: "utf8" });
  if (staged.status !== 0) {
    process.stderr.write(`Could not inspect staged file: ${path}\n`);
    process.exit(1);
  }
  if (/\bTYPESAFE_API_KEY\s*=\s*['"]?[^\s'"]+/.test(staged.stdout)) possibleKeys.push(path);
}

if (forbidden.length > 0) {
  process.stderr.write(`Remove generated files or private env files from Git:\n${forbidden.join("\n")}\n`);
  process.exitCode = 1;
} else if (possibleKeys.length > 0) {
  process.stderr.write(`Review possible API key assignments in staged files:\n${possibleKeys.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Staged filenames and API key assignments look safe for a public repository.\n");
}
