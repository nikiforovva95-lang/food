"use client";
import { useEffect, useState } from "react";
import { Plus, RefreshCw, Upload, Trash2, MapPin } from "lucide-react";
import { format } from "@/lib/domain";
import {
  basketComparison,
  parsePriceCsv,
  quoteStatus,
  validQuote,
} from "@/lib/pricing";
import { priceQuoteSchema } from "@/lib/validation";
import { supabase } from "@/lib/storage";
import type { FoodState, PriceQuote, Unit } from "@/lib/types";
const storeNames = ["Магнит", "Пятёрочка", "Лента", "Перекрёсток"];
export function ShoppingPrices({
  state,
  update,
  notify,
}: {
  state: FoodState;
  update: (f: (s: FoodState) => FoodState) => void;
  notify: (m: string) => void;
}) {
  const settings = state.shoppingSettings;
  const [show, setShow] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [feed, setFeed] = useState({
      configured: false,
      updatedAt: null as string | null,
      job: null as null | {
        active: boolean;
        lastSuccess: string | null;
        nextRun: string | null;
        lastError: string | null;
      },
    }),
    [quote, setQuote] = useState<PriceQuote | null>(null),
    [view, setView] = useState(0);
  useEffect(() => {
    void fetch("/api/prices")
      .then((r) => r.json())
      .then(setFeed)
      .catch(() => {});
  }, []);
  const comparisons = basketComparison(
      state.shopping,
      state.priceQuotes,
      settings,
    ),
    basket =
      comparisons.find(
        (b) => b.stores.join("|") === settings.chosenStores.join("|"),
      ) ??
      comparisons[view] ??
      comparisons[0];
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      const { data } = (await supabase?.auth.getSession()) ?? {
        data: { session: null },
      };
      if (!data.session)
        throw Error("Войдите в аккаунт для обновления из источника.");
      const response = await fetch("/api/prices", {
        method: "POST",
        headers: { authorization: `Bearer ${data.session.access_token}` },
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || "Не удалось обновить");
      const incoming: PriceQuote[] = body.quotes.map((q: unknown) =>
        priceQuoteSchema.parse(q),
      );
      update((s) => ({
        ...s,
        priceQuotes: [
          ...s.priceQuotes.filter((q) => q.kind !== "feed"),
          ...incoming,
        ],
      }));
      setFeed((old) => ({
        ...old,
        configured: true,
        updatedAt: body.updatedAt,
      }));
      notify(
        `Получено цен: ${incoming.length}. Даты наблюдений сохранены из источника.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Источник недоступен");
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    try {
      const quotes = parsePriceCsv(await file.text());
      update((s) => ({ ...s, priceQuotes: [...s.priceQuotes, ...quotes] }));
      notify(
        `Импортировано ${quotes.length} цен. Они отмечены как ручные/оценочные.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Проверьте CSV");
    }
  }
  function newQuote() {
    setQuote({
      id: crypto.randomUUID(),
      name: state.shopping[0]?.name ?? "",
      store: settings.stores[0] ?? "Магнит",
      city: settings.city,
      location: settings.location,
      packAmount: 1000,
      unit: "г",
      price: 1,
      observedAt: new Date().toISOString(),
      source: "Введено пользователем по чеку/ценнику",
      kind: "manual",
      condition: "regular",
      conditions: "",
      validUntil: "",
    });
    setShow(true);
  }
  return (
    <section className="panel price-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">КРАСНОДАР · ВАШИ МАГАЗИНЫ</span>
          <h2>Стоимость корзины и упаковки</h2>
        </div>
        <button className="text-btn" onClick={() => setShow(!show)}>
          {show ? "Скрыть настройки" : "Магазины и цены"}
        </button>
      </div>
      <div className="actions">
        <button className="secondary" onClick={newQuote}>
          <Plus size={16} />
          Добавить цену
        </button>
        <label className="secondary file-label">
          <Upload size={16} />
          Импорт цен CSV
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
        </label>
        <button
          className="secondary"
          disabled={busy || !feed.configured}
          onClick={() => void refresh()}
        >
          <RefreshCw size={16} />
          {busy ? "Обновляем…" : "Обновить из источника"}
        </button>
      </div>
      <p className="muted">
        {feed.configured
          ? `Источник подключён. Последняя успешная загрузка: ${feed.updatedAt ? new Date(feed.updatedAt).toLocaleString("ru-RU") : "ещё не выполнялась"}.`
          : "Автоматический источник магазинных цен ещё не подключён. Реальные цены можно ввести по чеку или импортировать; приложение не выдаёт оценки за актуальные цены магазинов."}
      </p>
      {feed.configured && (
        <p className="muted">
          {feed.job?.active
            ? `Фоновое обновление работает. Следующая попытка: ${feed.job.nextRun ? new Date(feed.job.nextRun).toLocaleString("ru-RU") : "сейчас"}.`
            : "Фоновое обновление не запущено; доступно обновление по кнопке."}
          {feed.job?.lastError ? ` ${feed.job.lastError}` : ""}
        </p>
      )}
      {show && (
        <>
          <div className="form-grid">
            <label>
              Город
              <input
                value={settings.city}
                onChange={(e) => {
                  setView(0);
                  update((s) => ({
                    ...s,
                    shoppingSettings: {
                      ...s.shoppingSettings,
                      city: e.target.value,
                    },
                  }));
                }}
              />
            </label>
            <label>
              Район/точка магазина
              <input
                value={settings.location}
                placeholder="Необязательно, должно совпадать с источником"
                onChange={(e) =>
                  update((s) => ({
                    ...s,
                    shoppingSettings: {
                      ...s.shoppingSettings,
                      location: e.target.value,
                    },
                  }))
                }
              />
            </label>
            <label>
              Способ сравнения
              <select
                value={settings.mode}
                onChange={(e) => {
                  setView(0);
                  update((s) => ({
                    ...s,
                    shoppingSettings: {
                      ...s.shoppingSettings,
                      mode: e.target.value as "one-store" | "cheapest",
                    },
                  }));
                }}
              >
                <option value="one-store">Всё в одном магазине</option>
                <option value="cheapest">
                  Дешевле, с ограничением магазинов
                </option>
              </select>
            </label>
            <label>
              Максимум магазинов
              <input
                type="number"
                min="1"
                max="4"
                value={settings.maxStores}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (n >= 1 && n <= 4)
                    update((s) => ({
                      ...s,
                      shoppingSettings: { ...s.shoppingSettings, maxStores: n },
                    }));
                }}
              />
            </label>
            <label>
              Известная доставка/сборка на магазин, ₽
              <input
                type="number"
                min="0"
                value={settings.delivery}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (n >= 0)
                    update((s) => ({
                      ...s,
                      shoppingSettings: { ...s.shoppingSettings, delivery: n },
                    }));
                }}
              />
            </label>
          </div>
          <div className="actions">
            {storeNames.map((store) => (
              <label key={store} className="check-line">
                <input
                  type="checkbox"
                  checked={settings.stores.includes(store)}
                  onChange={() => {
                    setView(0);
                    update((s) => ({
                      ...s,
                      shoppingSettings: {
                        ...s.shoppingSettings,
                        stores: s.shoppingSettings.stores.includes(store)
                          ? s.shoppingSettings.stores.filter((x) => x !== store)
                          : [...s.shoppingSettings.stores, store],
                      },
                    }));
                  }}
                />
                {store}
              </label>
            ))}
          </div>
          <div className="actions" style={{ marginTop: 16 }}>
            {storeNames
              .filter((store) => settings.stores.includes(store))
              .map((store) => (
                <label key={store} className="check-line">
                  <input
                    type="checkbox"
                    checked={settings.loyaltyStores.includes(store)}
                    onChange={() =>
                      update((s) => ({
                        ...s,
                        shoppingSettings: {
                          ...s.shoppingSettings,
                          loyaltyStores:
                            s.shoppingSettings.loyaltyStores.includes(store)
                              ? s.shoppingSettings.loyaltyStores.filter(
                                  (x) => x !== store,
                                )
                              : [...s.shoppingSettings.loyaltyStores, store],
                        },
                      }))
                    }
                  />
                  Есть карта: {store}
                </label>
              ))}
          </div>
          <p className="muted">
            Для CSV:
            name;store;packAmount;unit;price;observedAt;source;city;location;validUntil.
            Без даты наблюдения строка считается оценкой. Шаблон колонок можно
            скачать:{" "}
            <a href="/prices-template.csv" download>
              CSV без вымышленных цен
            </a>
            .
          </p>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {quote && (
        <form
          className="quote-form"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const q = priceQuoteSchema.parse({
                ...quote,
                name: quote.name.trim(),
              });
              if (!validQuote(q))
                throw Error(
                  "Укажите дату не из будущего, положительную цену и размер упаковки",
                );
              update((s) => ({
                ...s,
                priceQuotes: [...s.priceQuotes.filter((x) => x.id !== q.id), q],
              }));
              setQuote(null);
              setError("");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Проверьте поля");
            }
          }}
        >
          <h3>Цена целой упаковки</h3>
          <div className="form-grid">
            <label>
              Название как в покупках
              <input
                required
                list="shopping-ingredients"
                value={quote.name}
                onChange={(e) => setQuote({ ...quote, name: e.target.value })}
              />
            </label>
            <datalist id="shopping-ingredients">
              {state.shopping.map((i) => (
                <option key={i.id} value={i.name} />
              ))}
            </datalist>
            <label>
              Магазин
              <select
                value={quote.store}
                onChange={(e) => setQuote({ ...quote, store: e.target.value })}
              >
                {storeNames.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Размер упаковки
              <input
                required
                type="number"
                min="0.1"
                step="any"
                value={quote.packAmount}
                onChange={(e) =>
                  setQuote({ ...quote, packAmount: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Единица
              <select
                value={quote.unit}
                onChange={(e) =>
                  setQuote({ ...quote, unit: e.target.value as Unit })
                }
              >
                <option>г</option>
                <option>мл</option>
                <option>шт</option>
              </select>
            </label>
            <label>
              Цена упаковки, ₽
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={quote.price}
                onChange={(e) =>
                  setQuote({ ...quote, price: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Когда наблюдалась цена
              <input
                type="datetime-local"
                required
                value={new Date(quote.observedAt)
                  .toLocaleString("sv-SE")
                  .slice(0, 16)
                  .replace(" ", "T")}
                onChange={(e) => {
                  if (e.target.value)
                    setQuote({
                      ...quote,
                      observedAt: new Date(e.target.value).toISOString(),
                    });
                }}
              />
            </label>
            <label>
              Источник (чек, ценник, ссылка)
              <input
                required
                value={quote.source}
                onChange={(e) => setQuote({ ...quote, source: e.target.value })}
              />
            </label>
            <label>
              Статус
              <select
                value={quote.kind}
                onChange={(e) =>
                  setQuote({
                    ...quote,
                    kind: e.target.value as "manual" | "estimate",
                  })
                }
              >
                <option value="manual">Введено по наблюдению вручную</option>
                <option value="estimate">Примерная оценка</option>
              </select>
            </label>
            <label>
              Тип цены
              <select
                value={quote.condition ?? "regular"}
                onChange={(e) =>
                  setQuote({
                    ...quote,
                    condition: e.target.value as
                      "regular" | "loyalty" | "promo",
                  })
                }
              >
                <option value="regular">Обычная</option>
                <option value="loyalty">Только с картой магазина</option>
                <option value="promo">Акционная</option>
              </select>
            </label>
            <label>
              Условия цены
              <input
                value={quote.conditions ?? ""}
                onChange={(e) =>
                  setQuote({ ...quote, conditions: e.target.value })
                }
              />
            </label>
            <label>
              Акция действует до
              <input
                type="date"
                value={quote.validUntil}
                onChange={(e) =>
                  setQuote({ ...quote, validUntil: e.target.value })
                }
              />
            </label>
          </div>
          <div className="actions">
            <button className="primary">Сохранить цену</button>
            <button
              type="button"
              className="secondary"
              onClick={() => setQuote(null)}
            >
              Отмена
            </button>
          </div>
        </form>
      )}
      {basket && state.shopping.length > 0 && (
        <>
          <div className="tabs">
            {comparisons.slice(0, 6).map((b, i) => (
              <button
                key={b.stores.join()}
                className={view === i ? "active" : ""}
                onClick={() => {
                  setView(i);
                  update((s) => ({
                    ...s,
                    shoppingSettings: {
                      ...s.shoppingSettings,
                      chosenStores: b.stores,
                    },
                  }));
                }}
              >
                {b.stores.join(" + ")} · {format(b.total)} ₽
                {b.missing ? " · неполная" : ""}
              </button>
            ))}
          </div>
          <div className="basket-total">
            <strong>
              {basket.complete
                ? "Корзина по доступным ценам"
                : "Известная часть корзины"}
              : {format(basket.total)} ₽
            </strong>
            <span>
              {basket.missing
                ? `Нет цен для ${basket.missing} товаров`
                : "Все позиции имеют цену"}{" "}
              · доставка/сборка {format(basket.delivery)} ₽
            </span>
          </div>
          {basket.lines.map((line, i) => (
            <div className="list-row price-line" key={state.shopping[i].id}>
              <div>
                <b>{state.shopping[i].name}</b>
                {line ? (
                  <>
                    <p>
                      {line.packs} уп. × {format(line.quote.packAmount)}{" "}
                      {line.quote.unit} · {line.quote.store} ·{" "}
                      <strong>{format(line.total)} ₽</strong>
                    </p>
                    <small className="muted">
                      Использовать {format(line.item.amount)} {line.item.unit} ·
                      остаток {format(line.left)} {line.item.unit}.{" "}
                      {line.quote.condition === "loyalty"
                        ? "По карте · "
                        : line.quote.condition === "promo"
                          ? "Акция · "
                          : ""}
                      {line.quote.conditions
                        ? line.quote.conditions + " · "
                        : ""}
                      {quoteStatus(line.quote)} ·{" "}
                      {new Date(line.quote.observedAt).toLocaleDateString(
                        "ru-RU",
                      )}{" "}
                      · {line.quote.source}
                    </small>
                    {line.left > 0 && (
                      <small className="block muted">
                        Остаток оставьте в запасах; для скоропортящихся
                        продуктов запланируйте следующее блюдо или заморозку.
                        Порцию увеличивать не нужно.
                      </small>
                    )}
                  </>
                ) : (
                  <p className="muted">
                    Нет сопоставимой цены для этого города/магазина/единицы.
                  </p>
                )}
              </div>
            </div>
          ))}
          <p className="muted">
            Это расчёт упаковок по сохранённым наблюдениям, без подтверждения
            наличия. Условия карты, минимального заказа и неуказанные сборы
            проверяйте у магазина. Отмеченные товары остаются в расчёте всей
            корзины.
          </p>
        </>
      )}
      {show && state.priceQuotes.length > 0 && (
        <details>
          <summary>Все сохранённые цены ({state.priceQuotes.length})</summary>
          {state.priceQuotes.map((q) => (
            <div className="list-row" key={q.id}>
              <button className="text-btn" onClick={() => setQuote(q)}>
                {q.name} · {q.store} · {format(q.price)} ₽ /{" "}
                {format(q.packAmount)} {q.unit}
              </button>
              <button
                className="icon-btn"
                aria-label={`Удалить цену ${q.name}`}
                onClick={() =>
                  update((s) => ({
                    ...s,
                    priceQuotes: s.priceQuotes.filter((x) => x.id !== q.id),
                  }))
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
