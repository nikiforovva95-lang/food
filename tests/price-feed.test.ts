import { afterEach, describe, it, expect, vi } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { refreshPriceFeed, readPriceCache } from "../lib/server/price-feed";
let root = "";
afterEach(async () => {
  vi.unstubAllEnvs();
  if (root) await rm(root, { recursive: true, force: true });
  root = "";
});
describe("Проверяемый источник цен", () => {
  it("сохраняет реальные даты наблюдений источника и не заменяет успешный кэш при ошибке", async () => {
    root = await mkdtemp(path.join(tmpdir(), "foodlab-feed-"));
    const feed = path.join(root, "fixture.json");
    vi.stubEnv("FOODLAB_RUNTIME", root);
    vi.stubEnv("FOODLAB_PRICE_FEED_FILE", feed);
    vi.stubEnv("FOODLAB_PRICE_FEED_URL", "");
    await writeFile(
      feed,
      JSON.stringify([
        {
          name: "Тестовая фасовка",
          store: "Магнит",
          city: "Краснодар",
          location: "",
          packAmount: 500,
          unit: "г",
          price: 123,
          observedAt: "2026-11-01T12:00:00.000Z",
          source: "Синтетическая фикстура, не рыночная цена",
          validUntil: "",
        },
      ]),
    );
    const first = await refreshPriceFeed();
    expect(first.quotes[0].observedAt).toBe("2026-11-01T12:00:00.000Z");
    expect(first.quotes[0].kind).toBe("feed");
    await writeFile(feed, "invalid");
    await expect(refreshPriceFeed()).rejects.toThrow();
    expect(await readPriceCache()).toEqual(first);
  });
  it("отклоняет будущие наблюдения", async () => {
    root = await mkdtemp(path.join(tmpdir(), "foodlab-feed-"));
    const feed = path.join(root, "fixture.json");
    vi.stubEnv("FOODLAB_RUNTIME", root);
    vi.stubEnv("FOODLAB_PRICE_FEED_FILE", feed);
    vi.stubEnv("FOODLAB_PRICE_FEED_URL", "");
    await writeFile(
      feed,
      JSON.stringify([
        {
          name: "Тест",
          store: "Магнит",
          city: "Краснодар",
          location: "",
          packAmount: 500,
          unit: "г",
          price: 123,
          observedAt: "2099-01-01T12:00:00.000Z",
          source: "Фикстура",
          validUntil: "",
        },
      ]),
    );
    await expect(refreshPriceFeed()).rejects.toThrow();
    expect((await readPriceCache()).updatedAt).toBeNull();
  });
});
