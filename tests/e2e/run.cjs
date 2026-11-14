// Runs the browser walkthroughs one after another against a running app.
//
//   npm run test:e2e              every walkthrough
//   npm run test:e2e -- 04 08     only the ones whose file name starts so
//
// Needs: the app running (E2E_BASE_URL, default http://localhost:3000) on a
// local Supabase (`npx supabase start`), whose Mailpit catches the emails.
// The Telegram walkthrough also needs the app started with
// TELEGRAM_API_BASE=http://127.0.0.1:8099 and TELEGRAM_BOT_TOKEN=test-token;
// this runner starts that stand-in Telegram itself.
const { spawn } = require("node:child_process");
const { existsSync, mkdirSync, readdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..", "..");

// The Supabase URL and key, for walkthroughs that seed data directly.
const envFile = join(root, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

require("./mock-telegram.cjs");

const only = process.argv.slice(2);
const flows = readdirSync(__dirname)
  .filter((file) => /^\d\d-.+\.cjs$/.test(file))
  .filter((file) => only.length === 0 || only.some((prefix) => file.startsWith(prefix)))
  .sort();

// Run each walkthrough as its own process. Not spawnSync: the stand-in
// Telegram server above lives in this process and must keep answering.
function runFlow(file, shots) {
  return new Promise((resolve) => {
    spawn(process.execPath, [join(__dirname, file), shots], { stdio: "inherit", env: process.env }).on("exit", (code) =>
      resolve(code === 0)
    );
  });
}

(async () => {
  const failed = [];
  for (const flow of flows) {
    const shots = join(root, "test-results", "e2e", flow.replace(/\.cjs$/, ""));
    mkdirSync(shots, { recursive: true });
    console.log(`\n=== ${flow}`);
    if (!(await runFlow(flow, shots))) failed.push(flow);
  }

  console.log(`\n${flows.length - failed.length} of ${flows.length} walkthroughs passed.`);
  if (failed.length) {
    console.log(`Failed: ${failed.join(", ")} (screenshots in test-results/e2e/)`);
    process.exit(1);
  }
  process.exit(0);
})();
