import { readFile } from "node:fs/promises";
import path from "node:path";
import pkg from "@/package.json";
export const dynamic = "force-dynamic";
export async function GET() {
  let current = {
    version: pkg.version,
    channel:
      process.env.FOODLAB_RELEASE_CHANNEL ||
      process.env.NEXT_PUBLIC_RELEASE_CHANNEL ||
      "testing",
    commit: process.env.FOODLAB_COMMIT_SHA || "development",
    schemaVersion: 2,
  };
  try {
    current = {
      ...current,
      ...JSON.parse(
        await readFile(
          path.join(process.cwd(), ".foodlab-release.json"),
          "utf8",
        ),
      ),
    };
  } catch {}
  let releases: unknown[] = [];
  try {
    releases = JSON.parse(
      await readFile("/workspace/food-releases/index.json", "utf8"),
    );
  } catch {}
  return Response.json(
    {
      ...current,
      channel: process.env.FOODLAB_RELEASE_CHANNEL || current.channel,
      releases,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
