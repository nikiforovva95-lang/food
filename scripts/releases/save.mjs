import { execFileSync, spawnSync } from "node:child_process";
import { access, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const root = process.cwd(),
  base = "/workspace/food-releases";
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
if (git("status", "--porcelain"))
  throw Error("Commit the reviewed source before saving an immutable build.");
const commit = git("rev-parse", "HEAD"),
  pkg = JSON.parse(await readFile("package.json", "utf8"));
const id = `${pkg.version}-${commit.slice(0, 8)}`;
const dest = path.join(base, id);
try {
  await access(dest);
  throw Error("This release already exists; it was preserved.");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const built = spawnSync("npm", ["run", "build"], {
  stdio: "inherit",
  env: { ...process.env, FOODLAB_COMMIT_SHA: commit },
});
if (built.status !== 0) process.exit(built.status || 1);
await mkdir(base, { recursive: true, mode: 0o700 });
await cp(".next/standalone", dest, { recursive: true });
const release = {
  id,
  version: pkg.version,
  commit,
  schemaVersion: 2,
  format: "standalone",
  channel: "testing",
  createdAt: new Date().toISOString(),
};
await writeFile(
  path.join(dest, ".foodlab-release.json"),
  JSON.stringify(release, null, 2),
);
let list = [];
try {
  list = JSON.parse(await readFile(path.join(base, "index.json"), "utf8"));
} catch {}
await writeFile(
  path.join(base, "index.json"),
  JSON.stringify([...list.filter((r) => r.id !== id), release], null, 2),
);
console.log(
  `Saved immutable release ${id}. Environment credentials are selected when starting it.`,
);
