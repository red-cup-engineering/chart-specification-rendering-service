#!/usr/bin/env node
// Skill entry: delegates to the repository CLI's compare subcommand.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const cli = fileURLToPath(new URL("../../../../../scripts/infographic.mjs", import.meta.url));
const done = spawnSync(process.execPath, [cli, "compare", ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(done.status ?? 2);
