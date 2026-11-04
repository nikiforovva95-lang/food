import { execFileSync, spawn } from "node:child_process";
import { readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
const [id, channel = "testing"] = process.argv.slice(2);
if (
  !id ||
  !/^[-a-zA-Z0-9._]+$/.test(id) ||
  !["testing", "stable"].includes(channel)
)
  throw Error(
    "Usage: node scripts/releases/switch.mjs RELEASE_ID testing|stable",
  );
const base = "/workspace/food-releases",
  dir = path.join(base, id),
  root = process.cwd();
const release = JSON.parse(
  await readFile(path.join(dir, ".foodlab-release.json"), "utf8"),
);
await access(path.join(dir, "server.js"));
if (release.format !== "standalone")
  throw Error(
    "Legacy artifact requires its own verified startup procedure; current server was preserved.",
  );
const runtime =
  channel === "stable"
    ? "/workspace/food-runtime"
    : "/workspace/food-runtime-staging";
const args = [
  "--host=unix:///var/run/docker.sock",
  "compose",
  "--env-file",
  runtime + "/.env",
  "-f",
  "supabase/selfhost/compose.yml",
];
const localEnv = {
  ...process.env,
  FOODLAB_RUNTIME: runtime,
  FOODLAB_APP_ENV: runtime + "/app.env",
};
for (const k of [
  "FOODLAB_STACK_NAME",
  "FOODLAB_AUTH_PORT",
  "FOODLAB_REST_PORT",
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete localEnv[k];
const highest = Number(
  execFileSync(
    "docker",
    [
      ...args,
      "exec",
      "-T",
      "db",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-Atc",
      "select coalesce(max((payload->>'version')::int),1) from public.foodlab_states",
    ],
    { encoding: "utf8", env: localEnv },
  ).trim(),
);
if (release.schemaVersion < highest)
  throw Error(
    "This build cannot read current user data. It was not activated; database restoration is a separate decision.",
  );
execFileSync("bash", ["scripts/backup-supabase.sh"], {
  stdio: "inherit",
  env: localEnv,
});
execFileSync("bash", ["scripts/start-supabase.sh"], {
  stdio: "inherit",
  env: localEnv,
});
const port = channel === "stable" ? 3000 : 3001;
// Verify the selected artifact before stopping the currently running server.
const probePort = port + 100;
const probe = spawn(
  process.execPath,
  ["--env-file=" + runtime + "/app.env", path.join(dir, "server.js")],
  {
    cwd: dir,
    stdio: "ignore",
    env: {
      ...localEnv,
      PORT: String(probePort),
      HOSTNAME: "127.0.0.1",
      FOODLAB_RELEASE_CHANNEL: channel,
    },
  },
);
let healthy = false;
for (let attempt = 0; attempt < 40; attempt++) {
  try {
    const r = await fetch("http://127.0.0.1:" + probePort + "/api/config", {
      signal: AbortSignal.timeout(1000),
    });
    if (r.ok) {
      healthy = true;
      break;
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 250));
}
probe.kill("SIGTERM");
if (!healthy)
  throw Error(
    "Candidate did not become healthy; current server was preserved.",
  );
let running;
try {
  running = JSON.parse(
    await readFile(path.join(base, `running-${port}.json`), "utf8"),
  );
} catch {}
if (running) {
  try {
    const command = await readFile(`/proc/${running.pid}/cmdline`, "utf8");
    if (!command.includes(path.join(base, running.id, "server.js")))
      throw Error(
        "Saved PID does not match its release. Stop the intended server manually.",
      );
    process.kill(running.pid, "SIGTERM");
  } catch (e) {
    if (e.code !== "ENOENT" && e.code !== "ESRCH") throw e;
  }
}
if (running) {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      await fetch("http://127.0.0.1:" + port + "/api/config", {
        signal: AbortSignal.timeout(500),
      });
    } catch {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
const child = spawn(
  process.execPath,
  ["scripts/releases/run.mjs", id, channel],
  { cwd: root, stdio: "inherit", env: localEnv },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
