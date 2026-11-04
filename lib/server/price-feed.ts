import {
  readFile,
  mkdir,
  writeFile,
  rename,
  appendFile,
} from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import path from "node:path";
import { priceQuoteSchema } from "../validation.ts";
import { externalFetch } from "./http.ts";
export function feedConfigured() {
  return Boolean(
    process.env.FOODLAB_PRICE_FEED_URL || process.env.FOODLAB_PRICE_FEED_FILE,
  );
}
export function priceRuntime() {
  return process.env.FOODLAB_RUNTIME || "/workspace/food-runtime-staging";
}
export async function readPriceCache() {
  try {
    return JSON.parse(
      await readFile(path.join(priceRuntime(), "prices-cache.json"), "utf8"),
    );
  } catch {
    return { quotes: [], updatedAt: null };
  }
}
export async function refreshPriceFeed() {
  if (!feedConfigured()) throw Error("Источник цен не настроен");
  let text: string;
  if (process.env.FOODLAB_PRICE_FEED_URL) {
    const url = new URL(process.env.FOODLAB_PRICE_FEED_URL);
    if (url.protocol !== "https:" || url.username || url.password)
      throw Error("Нужен HTTPS-источник без встроенных паролей");
    const response = await externalFetch(url.toString(), {
      headers: process.env.FOODLAB_PRICE_FEED_TOKEN
        ? { authorization: `Bearer ${process.env.FOODLAB_PRICE_FEED_TOKEN}` }
        : {},
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    if (!response.ok) throw Error("Источник недоступен");
    text = await response.text();
  } else text = await readFile(process.env.FOODLAB_PRICE_FEED_FILE!, "utf8");
  if (text.length > 1000000) throw Error("Слишком большой ответ источника");
  const input = JSON.parse(text),
    entries = Array.isArray(input) ? input : input?.quotes;
  if (!Array.isArray(entries) || entries.length > 2000)
    throw Error("Неверный формат источника");
  const quotes = entries.map((source) => {
    const id = createHash("sha256")
      .update(
        JSON.stringify([
          source.name,
          source.store,
          source.location,
          source.packAmount,
          source.unit,
          source.observedAt,
        ]),
      )
      .digest("hex");
    const q = priceQuoteSchema.parse({ ...source, id, kind: "feed" });
    if (new Date(q.observedAt).getTime() > Date.now() + 60000)
      throw Error("Цена датирована будущим");
    return q;
  });
  const result = { quotes, updatedAt: new Date().toISOString() };
  await mkdir(priceRuntime(), { recursive: true, mode: 0o700 });
  const target = path.join(priceRuntime(), "prices-cache.json"),
    temp = target + "." + randomUUID() + ".tmp";
  await writeFile(temp, JSON.stringify(result), { mode: 0o600 });
  await rename(temp, target);
  await appendFile(
    path.join(priceRuntime(), "price-refresh-history.jsonl"),
    JSON.stringify({ updatedAt: result.updatedAt, count: quotes.length }) +
      "\n",
    { mode: 0o600 },
  );
  return result;
}
