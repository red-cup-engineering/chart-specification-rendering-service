#!/usr/bin/env node
// Skill entry: render with --png (the CLI refuses a size whose aspect differs from the canvas).
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const cli = fileURLToPath(new URL("../../../../../scripts/infographic.mjs", import.meta.url));
const args = process.argv.slice(2);
if (!args.includes("--png")) { process.stderr.write("refused: --png <sizes> is required\n"); process.exit(2); }
const done = spawnSync(process.execPath, [cli, "render", ...args], { stdio: "inherit" });
process.exit(done.status ?? 2);
