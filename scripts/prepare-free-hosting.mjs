import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Prepare a deterministic handoff, never credentials or remote paid resources.
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const destination = path.resolve(process.argv[2] || `/workspace/food-free-hosting/${commit.slice(0, 8)}`);
const migrations = (await readdir("supabase/migrations")).filter(file => file.endsWith(".sql")).sort();
const files = ["supabase/schema.sql", ...migrations.map(file => `supabase/migrations/${file}`)];
const sql = ["-- FoodLab: run once per separate hosted Supabase project in SQL Editor.", "BEGIN;"];
for (const file of files) sql.push(`\n-- ${file}\n${await readFile(file, "utf8")}`);
sql.push("NOTIFY pgrst, 'reload schema';", "COMMIT;", "");
const contents = {
  "supabase-setup.sql": sql.join("\n"),
  "hosting.env.example": `# Set separately for each Vercel project; never copy self-hosted loopback URLs.
# Hosted Supabase project URL and its public anon/publishable key, never service_role.
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SUPABASE_AUTH_MODE=password
FOODLAB_RELEASE_CHANNEL=testing
# Set to the commit deployed by the hosting provider.
FOODLAB_COMMIT_SHA=${commit}
# Optional AI key belongs only in server environment settings, never Git or chat.
# FOODLAB_AI_KEY=
# FOODLAB_AI_MODEL=gpt-4.1-mini
# No background price worker or persistent filesystem is assumed on serverless hosting.
`,
  "README.md": await readFile("deploy/FREE_HOSTING.md", "utf8"),
  "manifest.json": JSON.stringify({ commit, sqlSources: files, hostedSupabase: true, separateProjects: true, published: false }, null, 2) + "\n",
};
await mkdir(destination, { recursive: true, mode: 0o700 });
for (const [name, content] of Object.entries(contents)) {
  try {
    if ((await readFile(path.join(destination, name), "utf8")) !== content)
      throw Error(`Existing ${name} differs; choose another output directory. Nothing was overwritten.`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
for (const [name, content] of Object.entries(contents)) {
  try { await writeFile(path.join(destination, name), content, { flag: "wx", mode: 0o600 }); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
}
console.log(`Prepared ${Object.keys(contents).length} non-secret files in ${destination}. No site was published.`);
