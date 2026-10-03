import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, "jev.ts");
const binary = join(root, "dist", "jev");
const localCompiler = join(root, "node_modules", ".bin", "scriptc");
const compiler = existsSync(localCompiler) ? localCompiler : "scriptc";
const expectedVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).devDependencies.scriptc;
const version = spawnSync(compiler, ["--version"], { cwd: root, encoding: "utf8" });

if (version.error) {
  process.stderr.write("ScriptC is unavailable. Use Node.js 24 or newer, then run `npm ci`.\n");
  process.exitCode = 1;
} else if (version.status !== 0 || version.stdout.trim() !== expectedVersion) {
  process.stderr.write(`Expected ScriptC ${expectedVersion}; found ${version.stdout.trim() || "an unusable installation"}. Run \`npm ci\`.\n`);
  process.exitCode = 1;
} else {
  mkdirSync(join(root, "dist"), { recursive: true });
  const result = spawnSync(compiler, ["build", source, "-o", binary], { cwd: root, stdio: "inherit" });
  if (result.status === 0) {
    const sourceHash = createHash("sha256").update(readFileSync(source)).digest("hex");
    writeFileSync(join(root, "dist", "build.json"), JSON.stringify({
      scriptc: expectedVersion,
      sourceHash,
      platform: process.platform,
      arch: process.arch,
    }) + "\n");
  }
  process.exitCode = result.status ?? 1;
}
