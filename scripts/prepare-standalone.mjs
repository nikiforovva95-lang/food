import { cp, mkdir, access, readFile, writeFile, rm } from "node:fs/promises";
const root = ".next/standalone";
await access(root + "/server.js");
await mkdir(root + "/.next/static", { recursive: true });
await cp(".next/static", root + "/.next/static", { recursive: true });
await cp("public", root + "/public", { recursive: true });
console.log("Standalone assets prepared.");

const id = (await readFile(".next/BUILD_ID", "utf8")).trim();
const sw = await readFile(root + "/public/sw.js", "utf8");
await writeFile(
  root + "/public/sw.js",
  sw.replace(/foodlab-shell-v1/g, "foodlab-shell-" + id),
);
for (const file of [
  "scripts/price-worker.mjs",
  "lib/server/price-feed.ts",
  "lib/server/http.ts",
  "lib/validation.ts",
  "lib/catalog.ts",
  "lib/types.ts",
]) {
  await mkdir(root + "/" + file.slice(0, file.lastIndexOf("/")), {
    recursive: true,
  });
  await cp(file, root + "/" + file);
}
for (const pkg of ["undici", "zod"])
  await cp("node_modules/" + pkg, root + "/node_modules/" + pkg, {
    recursive: true,
  });

for (const file of [
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
])
  await rm(root + "/" + file, { force: true });
await writeFile(root + "/.dockerignore", ".env\n.env.*\n.git\n");
