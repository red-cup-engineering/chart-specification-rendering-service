#!/usr/bin/env node
// Skill entry: delegates to the repository CLI so the skill and the package cannot drift apart.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const cli = fileURLToPath(new URL("../../../../../scripts/infographic.mjs", import.meta.url));
const done = spawnSync(process.execPath, [cli, "render", ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(done.status ?? 2);
