import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:net";
const [id, channel = "testing"] = process.argv.slice(2);
if (
  !id ||
  !/^[-a-zA-Z0-9._]+$/.test(id) ||
  !["testing", "stable"].includes(channel)
)
  throw Error("Usage: node scripts/releases/run.mjs RELEASE_ID testing|stable");
const base = "/workspace/food-releases",
  dir = path.join(base, id);
const release = JSON.parse(
  await readFile(path.join(dir, ".foodlab-release.json"), "utf8"),
);
await access(path.join(dir, "server.js"));
const port = channel === "stable" ? 3000 : 3001,
  runtime =
    channel === "stable"
      ? "/workspace/food-runtime"
      : "/workspace/food-runtime-staging";
const envFile = path.join(runtime, "app.env");
await new Promise((resolve, reject) => {
  const socket=createServer();
  socket.once('error',()=>reject(Error(`Port ${port} is occupied; the running server and its release record were preserved.`)));
  socket.listen(port,'0.0.0.0',()=>socket.close(resolve));
});
const serverEnv = {
  ...process.env,
  PORT: String(port),
  HOSTNAME: "0.0.0.0",
  FOODLAB_RELEASE_CHANNEL: channel,
  FOODLAB_RUNTIME: runtime,
  FOODLAB_COMMIT_SHA: release.commit,
};
for (const k of [
  "FOODLAB_PUBLIC_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "FOODLAB_SUPABASE_AUTH_URL",
  "FOODLAB_SUPABASE_REST_URL",
])
  delete serverEnv[k];
const child = spawn(
  process.execPath,
  [`--env-file=${envFile}`, path.join(dir, "server.js")],
  { cwd: dir, stdio: "inherit", env: serverEnv },
);
let ready=false;
for(let attempt=0;attempt<40;attempt++){
  if(child.exitCode!==null)throw Error('Release exited before readiness; previous release record was preserved.');
  try{const response=await fetch(`http://127.0.0.1:${port}/api/releases`,{signal:AbortSignal.timeout(1000)});const info=await response.json();if(response.ok&&info.commit===release.commit){ready=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,250));
}
if(!ready){child.kill('SIGTERM');throw Error('Release did not become ready; previous release record was preserved.');}
await mkdir(base, { recursive: true, mode: 0o700 });
await writeFile(
  path.join(base, `running-${port}.json`),
  JSON.stringify({ id, pid: child.pid, port, channel }),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
