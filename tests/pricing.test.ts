import { describe, it, expect } from "vitest";
import {
  basketComparison,
  linePrice,
  parsePriceCsv,
  quoteStatus,
} from "../lib/pricing";
import { initialState } from "../lib/domain";
import type { PriceQuote, ShoppingItem } from "../lib/types";
const item: ShoppingItem = {
  id: "one",
  name: "Куриное филе",
  amount: 700,
  unit: "г",
  category: "Мясо",
  checked: false,
};
function quote(extra: Partial<PriceQuote> = {}): PriceQuote {
  return {
    id: crypto.randomUUID(),
    name: item.name,
    store: "Магнит",
    city: "Краснодар",
    location: "",
    packAmount: 500,
    unit: "г",
    price: 200,
    observedAt: new Date().toISOString(),
    source: "Тестовый ценник, не реальные рыночные данные",
    kind: "manual",
    validUntil: "",
    ...extra,
  };
}
describe("Корзина по упаковкам и качество цен", () => {
  it("считает стоимость целых упаковок и остаток, а не только расход граммов", () => {
    const p = linePrice(item, [quote()], initialState().shoppingSettings)!;
    expect(p.packs).toBe(2);
    expect(p.total).toBe(400);
    expect(p.left).toBe(300);
  });
  it("выбирает наиболее выгодную полную фасовку", () => {
    const p = linePrice(
      item,
      [quote(), quote({ packAmount: 1000, price: 350 })],
      initialState().shoppingSettings,
    )!;
    expect(p.packs).toBe(1);
    expect(p.total).toBe(350);
  });
  it("различает несовместимые единицы и город/точку", () => {
    expect(
      linePrice(item, [quote({ unit: "шт" })], initialState().shoppingSettings),
    ).toBeNull();
    expect(
      linePrice(
        item,
        [quote({ city: "Москва" })],
        initialState().shoppingSettings,
      ),
    ).toBeNull();
    expect(
      linePrice(item, [quote({ location: "Центр" })], {
        ...initialState().shoppingSettings,
        location: "Другой район",
      }),
    ).toBeNull();
  });
  it("сравнивает число магазинов и учитывает заданные сборы", () => {
    const second = { ...item, id: "two", name: "Рис сухой", amount: 100 };
    const quotes = [
      quote(),
      quote({ name: second.name, store: "Лента", price: 50 }),
      quote({ name: second.name, price: 500 }),
    ];
    const settings = {
      ...initialState().shoppingSettings,
      stores: ["Магнит", "Лента"],
      mode: "cheapest" as const,
      maxStores: 2,
      delivery: 30,
    };
    const result = basketComparison([item, second], quotes, settings);
    expect(result[0].total).toBe(510);
    expect(result[0].missing).toBe(0);
    expect(result[0].delivery).toBe(60);
  });
  it("не объявляет неполную корзину полной", () => {
    const result = basketComparison(
      [item, { ...item, id: "missing", name: "Неизвестно" }],
      [quote()],
      initialState().shoppingSettings,
    );
    expect(result[0].complete).toBe(false);
    expect(result[0].missing).toBe(1);
  });
  it("показывает устаревшие и оценочные цены и исключает истёкшую акцию", () => {
    expect(quoteStatus(quote({ kind: "estimate" }))).toBe("Оценка");
    expect(
      quoteStatus(quote({ observedAt: "2020-01-01T00:00:00.000Z" })),
    ).toContain("Устарела");
    expect(
      linePrice(
        item,
        [quote({ validUntil: "2020-01-01" })],
        initialState().shoppingSettings,
      ),
    ).toBeNull();
  });
  it("импортирует CSV с кавычками и десятичной запятой без заявления о live-данных", () => {
    const q = parsePriceCsv(
      'name;store;packAmount;unit;price;source\n"Рис; длинный";Магнит;500;г;"99,50";Чек',
    )[0];
    expect(q.name).toBe("Рис; длинный");
    expect(q.price).toBe(99.5);
    expect(q.kind).toBe("estimate");
  });
  it("отклоняет невалидные, будущие цены и повреждённый CSV", () => {
    expect(() =>
      parsePriceCsv("name;store;packAmount;unit;price\nТовар;Магнит;0;г;100"),
    ).toThrow();
    expect(() =>
      parsePriceCsv(
        "name;store;packAmount;unit;price;observedAt\nТовар;Магнит;100;г;100;2099-01-01",
      ),
    ).toThrow();
    expect(() =>
      parsePriceCsv(
        'name;store;packAmount;unit;price\n"Товар;Магнит;100;г;100',
      ),
    ).toThrow();
  });
});
it("не использует цену по карте, пока пользователь не отметил наличие карты", () => {
  const q = quote({ condition: "loyalty" });
  const settings = initialState().shoppingSettings;
  expect(linePrice(item, [q], settings)).toBeNull();
  expect(
    linePrice(item, [q], { ...settings, loyaltyStores: ["Магнит"] })?.total,
  ).toBe(400);
});
