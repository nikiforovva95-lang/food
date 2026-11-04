import { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { authenticatedUser } from "@/lib/server/auth";
import {
  feedConfigured,
  priceRuntime,
  readPriceCache,
  refreshPriceFeed,
} from "@/lib/server/price-feed";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let lastRequest = 0;
export async function GET() {
  const cache = await readPriceCache();
  let job = null;
  try {
    const raw = JSON.parse(
      await readFile(path.join(priceRuntime(), "price-worker.json"), "utf8"),
    );
    job = {
      ...raw,
      active: Date.now() - new Date(raw.heartbeatAt).getTime() < 120000,
    };
  } catch {}
  return Response.json(
    {
      configured: feedConfigured(),
      updatedAt: cache.updatedAt,
      job,
      sourceType: process.env.FOODLAB_PRICE_FEED_URL
        ? "remote"
        : process.env.FOODLAB_PRICE_FEED_FILE
          ? "file"
          : "none",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
export async function POST(request: NextRequest) {
  if (!(await authenticatedUser(request)))
    return Response.json(
      { error: "Войдите для обновления цен из подключённого источника." },
      { status: 401 },
    );
  if (!feedConfigured())
    return Response.json(
      {
        error:
          "Источник магазинных цен ещё не подключён. Можно добавить цены вручную или импортировать CSV. Текущие цены не изменены.",
      },
      { status: 503 },
    );
  const old = await readPriceCache();
  if (Date.now() - lastRequest < 60000 && old.quotes.length)
    return Response.json({ ...old, cached: true });
  try {
    const result = await refreshPriceFeed();
    lastRequest = Date.now();
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json(
      {
        error:
          "Источник не вернул корректные цены. Сохранённые данные и даты последней успешной проверки не изменены.",
      },
      { status: 502 },
    );
  }
}
