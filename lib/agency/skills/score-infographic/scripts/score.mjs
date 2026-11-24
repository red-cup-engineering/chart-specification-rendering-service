#!/usr/bin/env node
// Skill entry: delegates to the repository CLI.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const cli = fileURLToPath(new URL("../../../../../scripts/infographic.mjs", import.meta.url));
const done = spawnSync(process.execPath, [cli, "score", ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(done.status ?? 2);
