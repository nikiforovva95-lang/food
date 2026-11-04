import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
const args = process.argv.slice(2),
  index = args.indexOf("--port");
const port = Number(index >= 0 ? args[index + 1] : process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw Error("Choose a valid port from 1024 to 65535");
if (!existsSync(".next/standalone/server.js"))
  throw Error("Run npm run build before starting the application");
const child = spawn(
  process.execPath,
  [
    ...(existsSync(".env.local") ? ["--env-file=.env.local"] : []),
    ".next/standalone/server.js",
  ],
  {
    stdio: "inherit",
    env: { ...process.env, PORT: String(port), HOSTNAME: "0.0.0.0" },
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
