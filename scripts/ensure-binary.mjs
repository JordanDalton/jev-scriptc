import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const binary = join(root, "dist", "jev");

export function ensureBinary() {
  let needsBuild = !existsSync(binary);
  if (!needsBuild) {
    try {
      const build = JSON.parse(readFileSync(join(root, "dist", "build.json"), "utf8"));
      const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).devDependencies.scriptc;
      const sourceHash = createHash("sha256").update(readFileSync(join(root, "jev.ts"))).digest("hex");
      needsBuild = build.scriptc !== version || build.sourceHash !== sourceHash ||
        build.platform !== process.platform || build.arch !== process.arch;
    } catch {
      needsBuild = true;
    }
  }
  if (needsBuild) {
    process.stdout.write("Native binary missing or stale; building it now...\n");
    const result = spawnSync(process.execPath, [join(root, "scripts", "build.mjs")], {
      cwd: root,
      stdio: "inherit",
    });
    if (result.status !== 0 || !existsSync(binary)) process.exit(1);
  }
  return binary;
}
