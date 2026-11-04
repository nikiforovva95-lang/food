import type { PriceQuote, ShoppingItem, ShoppingSettings } from "./types";
import { priceQuoteSchema } from "./validation";
const normalize = (s: string) =>
  s.trim().toLocaleLowerCase("ru").replace(/ё/g, "е");
export function quoteStatus(q: PriceQuote, now = Date.now()) {
  if (q.kind === "estimate") return "Оценка";
  if (q.validUntil && new Date(q.validUntil + "T23:59:59").getTime() < now)
    return "Срок цены истёк";
  if (now - new Date(q.observedAt).getTime() > 86400000)
    return "Устарела (>24 ч)";
  return q.kind === "manual" ? "Введено вручную" : "Обновлено из источника";
}
export function validQuote(q: PriceQuote, now = Date.now()) {
  return (
    Number.isFinite(new Date(q.observedAt).getTime()) &&
    new Date(q.observedAt).getTime() <= now + 60000 &&
    q.price > 0 &&
    q.packAmount > 0
  );
}
export function linePrice(
  item: ShoppingItem,
  quotes: PriceQuote[],
  settings: ShoppingSettings,
  store?: string,
) {
  const options = quotes.filter(
    (q) =>
      normalize(q.name) === normalize(item.name) &&
      q.unit === item.unit &&
      normalize(q.city) === normalize(settings.city) &&
      settings.stores.includes(q.store) &&
      (q.condition !== "loyalty" || settings.loyaltyStores.includes(q.store)) &&
      (!store || q.store === store) &&
      (!settings.location ||
        !q.location ||
        normalize(q.location) === normalize(settings.location)) &&
      validQuote(q) &&
      (!q.validUntil ||
        new Date(q.validUntil + "T23:59:59").getTime() >= Date.now()),
  );
  const latest = new Map<string, PriceQuote>();
  for (const q of options) {
    const key =
      q.store +
      "|" +
      q.packAmount +
      "|" +
      q.location +
      "|" +
      (q.condition || "regular");
    const old = latest.get(key);
    if (!old || q.observedAt > old.observedAt) latest.set(key, q);
  }
  return (
    [...latest.values()]
      .map((q) => {
        const packs = Math.ceil(Math.max(0, item.amount - 1e-9) / q.packAmount);
        return {
          item,
          quote: q,
          packs,
          total: packs * q.price,
          left: packs * q.packAmount - item.amount,
        };
      })
      .sort((a, b) => a.total - b.total)[0] ?? null
  );
}
export function basketComparison(
  items: ShoppingItem[],
  quotes: PriceQuote[],
  settings: ShoppingSettings,
) {
  const stores = settings.stores.slice(0, 4);
  const combinations: string[][] = [];
  if (settings.mode === "one-store")
    stores.forEach((s) => combinations.push([s]));
  else
    for (let mask = 1; mask < 1 << stores.length; mask++) {
      const group = stores.filter((_, i) => mask & (1 << i));
      if (group.length <= settings.maxStores) combinations.push(group);
    }
  return combinations
    .map((group) => {
      const selection = { ...settings, stores: group };
      const lines = items.map((item) => linePrice(item, quotes, selection));
      const missing = lines.filter((x) => !x).length;
      const usedStores = new Set(
        lines.flatMap((x) => (x ? [x.quote.store] : [])),
      );
      const delivery = usedStores.size * settings.delivery;
      const total =
        lines.reduce((sum, x) => sum + (x?.total ?? 0), 0) + delivery;
      return {
        stores: group,
        lines,
        missing,
        total,
        delivery,
        complete: missing === 0,
      };
    })
    .sort((a, b) => a.missing - b.missing || a.total - b.total);
}
export function parsePriceCsv(text: string): PriceQuote[] {
  if (text.length > 200000) throw Error("CSV больше 200 КБ");
  const first = text.split(/\r?\n/)[0];
  const delimiter = first.includes(";") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" && !quoted) {
      row.push(cell.replace(/\r$/, ""));
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw Error("Незакрытая кавычка CSV");
  row.push(cell.replace(/\r$/, ""));
  if (row.some((x) => x.trim())) rows.push(row);
  const headers = rows.shift()?.map((x) => x.trim().replace(/^\uFEFF/, ""));
  if (!headers) throw Error("Пустой CSV");
  for (const key of ["name", "store", "packAmount", "unit", "price"])
    if (!headers.includes(key))
      throw Error("Нужны колонки name, store, packAmount, unit, price");
  if (rows.length > 500) throw Error("Не больше 500 строк за импорт");
  return rows.map((cells, index) => {
    const v = Object.fromEntries(
      headers.map((h, i) => [h, cells[i]?.trim() ?? ""]),
    );
    let observedAt = v.observedAt || new Date().toISOString();
    if (/^\d{4}-\d{2}-\d{2}$/.test(observedAt)) observedAt += "T12:00:00.000Z";
    const q = priceQuoteSchema.parse({
      id: crypto.randomUUID(),
      name: v.name,
      store: v.store,
      city: v.city || "Краснодар",
      location: v.location || "",
      packAmount: Number(v.packAmount.replace(",", ".")),
      unit: v.unit,
      price: Number(v.price.replace(",", ".")),
      observedAt,
      source: v.source || "Ручной импорт CSV",
      kind: v.observedAt ? "manual" : "estimate",
      validUntil: v.validUntil || "",
      condition: v.condition || "regular",
      conditions: v.conditions || "",
    });
    if (!validQuote(q))
      throw Error(`Проверьте дату/цену в строке ${index + 2}`);
    return q;
  });
}
