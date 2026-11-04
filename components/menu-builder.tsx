"use client";
import { useState, useEffect } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChefHat,
  Clock,
  History,
  Plus,
  RefreshCw,
  ShoppingBasket,
  Sparkles,
  Utensils,
  Scale,
} from "lucide-react";
import type { FoodState, MenuDraft, Recipe, Slot } from "@/lib/types";
import {
  allRecipes,
  format,
  multiply,
  portion,
  scaleRecipe,
} from "@/lib/domain";
import {
  applyMenu,
  approveChoice,
  chosenNutrition,
  cookingPlan,
  createDraft,
  draftWarnings,
  menuShopping,
  remainder,
  slots,
  slotTarget,
  suggest,
  targetMismatch,
  targets,
} from "@/lib/planning";
import { cookBatch } from "@/lib/inventory";
import { draftSchema } from "@/lib/validation";
import { RecipeDialog } from "./recipe-dialog";
import { GeneratorPanel } from "./recipe-generator";
type Props = {
  state: FoodState;
  update: (f: (s: FoodState) => FoodState) => void;
  notify: (message: string) => void;
  goShopping: () => void;
};
export function MenuBuilder({ state, update, notify, goShopping }: Props) {
  const d = state.wizard;
  const [page, setPage] = useState(0),
    [showHistory, setShowHistory] = useState(false),
    [error, setError] = useState(""),
    [deviation, setDeviation] = useState(false),
    [preview, setPreview] = useState<{
      recipe: Recipe;
      servings: number;
    } | null>(null);
  const [pick, setPick] = useState<{
    recipe: Recipe;
    factor: number;
    batch: number;
  } | null>(null);
  function persist(next: MenuDraft) {
    update((s) => ({ ...s, wizard: next }));
    setError("");
  }
  function fresh() {
    if (
      d &&
      Object.keys(d.choices).length &&
      !confirm("Начать новый черновик? Утверждённые меню останутся в истории.")
    )
      return;
    persist(createDraft(state));
    setPick(null);
    setPage(0);
  }
  if (!d)
    return (
      <section className="panel builder-intro">
        <span className="eyebrow">МЕНЮ В ВАШЕМ РИТМЕ</span>
        <h2>Соберём день по шагам</h2>
        <p>
          Цели и кухня → завтрак → обед → ужин. Каждое утверждение сохраняется,
          а следующий приём учитывает оставшиеся калории и БЖУ.
        </p>
        <button className="primary" onClick={fresh}>
          <Plus size={17} />
          Составить меню по шагам
        </button>
      </section>
    );
  const step = d.step,
    slot = slots[Math.max(0, step - 1)];
  const suggestions =
    step >= 1 && step <= 3 ? suggest(state, d, slot).slice(0, 3) : [];
  const remaining = remainder(d),
    used = chosenNutrition(d),
    warnings = draftWarnings(d);
  const approved = state.menuHistory.some((h) => h.id === d.id);
  function edit() {
    persist({ ...structuredClone(d!), id: crypto.randomUUID(), step: 0 });
    setPick(null);
    setDeviation(false);
  }
  function openBatch(which: Slot) {
    const c = d!.choices[which];
    if (!c) return;
    const r = scaleRecipe(c.recipe, c.batchPortions * c.factor);
    setPreview({
      recipe: { ...r, servings: c.batchPortions },
      servings: c.batchPortions,
    });
  }
  return (
    <section className="menu-builder">
      <div className="toolbar">
        <div>
          <span className="eyebrow">ПЕРСОНАЛЬНЫЙ ПЛАН</span>
          <h2>Ваше меню по шагам</h2>
        </div>
        <div className="actions">
          <button
            className="secondary"
            onClick={() => setShowHistory(!showHistory)}
          >
            <History size={16} />
            История меню ({state.menuHistory.length})
          </button>
          <button className="text-btn" onClick={fresh}>
            Новый план
          </button>
        </div>
      </div>
      {showHistory && (
        <div className="panel">
          <h3>Сохранённые меню</h3>
          {!state.menuHistory.length && (
            <p className="muted">
              История появится после утверждения первого меню.
            </p>
          )}
          {[...state.menuHistory].reverse().map((h) => (
            <div className="list-row" key={h.id}>
              <div>
                <b>{h.label}</b>
                <small className="block muted">
                  {new Date(h.createdAt).toLocaleString("ru-RU")} ·{" "}
                  {Object.values(h.draft.choices)
                    .map((c) => c.recipe.name)
                    .join(" / ")}
                </small>
              </div>
              <button
                className="secondary"
                onClick={() => {
                  if (
                    !confirm(
                      "Открыть копию этого меню как новый черновик? Текущие блюда в календаре сохранятся до нового утверждения.",
                    )
                  )
                    return;
                  persist({
                    ...structuredClone(h.draft),
                    id: crypto.randomUUID(),
                    step: 4,
                  });
                  setShowHistory(false);
                  setDeviation(false);
                }}
              >
                Восстановить копию
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="builder-steps">
        {["Цели и кухня", ...slots, "Готовое меню"].map((label, i) => (
          <button
            key={label}
            disabled={
              i > 0 && i < 4 && slots.slice(0, i - 1).some((x) => !d.choices[x])
            }
            className={
              step === i
                ? "active"
                : i > 0 && d.choices[slots[i - 1]]
                  ? "done"
                  : ""
            }
            onClick={() => {
              persist({ ...d, step: i });
              setPick(null);
              setPage(0);
            }}
          >
            <span>
              {i > 0 && i < 4 && d.choices[slots[i - 1]] ? (
                <Check size={13} />
              ) : (
                i + 1
              )}
            </span>
            {label}
          </button>
        ))}
      </div>
      {step > 0 && (
        <div className="builder-budget">
          <div>
            <strong>
              {Math.round(used.kcal)} / {Math.round(d.targets.kcal)}
            </strong>
            <small>ккал на человека в день</small>
          </div>
          {(["protein", "fat", "carbs"] as const).map((k, i) => (
            <div key={k}>
              <strong>
                {format(used[k])} / {format(d.targets[k])} г
              </strong>
              <small>{["Белки", "Жиры", "Углеводы"][i]}</small>
            </div>
          ))}
          <p>
            Осталось: {Math.round(remaining.kcal)} ккал · Б{" "}
            {format(remaining.protein)} · Ж {format(remaining.fat)} · У{" "}
            {format(remaining.carbs)}. {d.days} дн. × {d.people} чел.
          </p>
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {step === 0 && (
        <Setup
          draft={d}
          state={state}
          onDraftChange={persist}
          onSave={(next) => {
            update((s) => ({
              ...s,
              wizard: next,
              profile: {
                ...s.profile,
                ...next.targets,
                fatMode: next.fatMode,
                fatShare: next.fatShare,
                plateLimit: next.plateLimit,
              },
            }));
            setPage(0);
          }}
        />
      )}
      {step >= 1 && step <= 3 && (
        <>
          <div className="section-heading">
            <div>
              <h3>{slot}: выберите свою тарелку</h3>
              <p>
                Ориентир: {Math.round(slotTarget(d, slot).kcal)} ккал и{" "}
                {format(slotTarget(d, slot).protein)} г белка. Утверждённые
                блюда останутся на месте.
              </p>
            </div>
            {d.choices[slot] && (
              <span className="tag">
                Утверждено: {d.choices[slot]!.recipe.name}
              </span>
            )}
          </div>
          <div className="recipe-grid">
            {suggestions.map((x) => {
              const n = multiply(portion(x.recipe), x.factor);
              return (
                <article className="recipe-card builder-card" key={x.recipe.id}>
                  <div className="card-image">
                    <img
                      src={x.recipe.image}
                      alt={x.recipe.name}
                      onError={(e) => {
                        if (!e.currentTarget.src.endsWith("/food-bowl.png"))
                          e.currentTarget.src = "/food-bowl.png";
                      }}
                    />
                  </div>
                  <div className="card-body">
                    <h3>{x.recipe.name}</h3>
                    <p className="muted">
                      {x.recipe.equipment} · {x.recipe.minutes} мин
                    </p>
                    <div className="card-nutrition">
                      <span>{Math.round(n.kcal)} ккал</span>
                      <span className="protein">Б {format(n.protein)} г</span>
                      <span>
                        Ж {format(n.fat)} · У {format(n.carbs)}
                      </span>
                    </div>
                    <p className="reason">{x.reason}</p>
                    <button
                      className="primary"
                      onClick={() =>
                        setPick({
                          recipe: x.recipe,
                          factor: x.factor,
                          batch: d.days * d.people,
                        })
                      }
                    >
                      Выбрать блюдо
                    </button>
                    <button
                      className="text-btn"
                      onClick={() => {
                        persist({
                          ...d,
                          rejected: [...d.rejected, x.recipe.id],
                        });
                        setPage(0);
                      }}
                    >
                      Не предлагать в этом плане
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          {!suggestions.length && (
            <div className="empty">
              <p>
                Подходящих вариантов больше нет. Можно изменить ограничения,
                вернуть отклонённые варианты или добавить рецепт.
              </p>
              <button
                className="secondary"
                onClick={() => {
                  persist({ ...d, rejected: [], offered: [] });
                  setPage(0);
                }}
              >
                Вернуть варианты
              </button>
            </div>
          )}
          <div className="actions builder-next">
            <button
              className="secondary"
              onClick={() => {
                persist({
                  ...d,
                  offered: [
                    ...new Set([
                      ...d.offered,
                      ...suggestions.map((x) => x.recipe.id),
                    ]),
                  ],
                });
                setPage(0);
              }}
            >
              <RefreshCw size={16} />
              Другие варианты
            </button>
            <label className="flex-label">
              Выбрать из своих
              <select
                aria-label="Рецепт для приёма пищи"
                defaultValue=""
                onChange={(e) => {
                  const r = allRecipes(state).find(
                    (r) => r.id === e.target.value,
                  );
                  if (r) {
                    setPick({
                      recipe: r,
                      factor: Math.min(
                        1,
                        d.plateLimit / (r.yield / r.servings),
                      ),
                      batch: d.days * d.people,
                    });
                    e.target.value = "";
                  }
                }}
              >
                <option value="">Выберите рецепт…</option>
                {allRecipes(state)
                  .filter(
                    (r) =>
                      r.category === slot && d.equipment.includes(r.equipment),
                  )
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          {pick && (
            <div className="panel chosen-panel">
              <h3>Настройте порцию: {pick.recipe.name}</h3>
              <div className="form-grid">
                <label>
                  Готового блюда на одну тарелку, г
                  <input
                    type="number"
                    min="50"
                    max="1500"
                    value={Math.round(
                      (pick.recipe.yield / pick.recipe.servings) * pick.factor,
                    )}
                    onChange={(e) => {
                      const grams = Number(e.target.value);
                      if (grams >= 50 && grams <= 1500)
                        setPick({
                          ...pick,
                          factor:
                            grams / (pick.recipe.yield / pick.recipe.servings),
                        });
                    }}
                  />
                </label>
                <label>
                  Приготовить тарелок в партии
                  <input
                    type="number"
                    min={1}
                    max={140}
                    value={pick.batch}
                    onChange={(e) =>
                      setPick({ ...pick, batch: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <p>
                На одну тарелку:{" "}
                {Math.round(portion(pick.recipe).kcal * pick.factor)} ккал · Б{" "}
                {format(portion(pick.recipe).protein * pick.factor)} · Ж{" "}
                {format(portion(pick.recipe).fat * pick.factor)} · У{" "}
                {format(portion(pick.recipe).carbs * pick.factor)}.
              </p>
              <p className="notice">
                Рекомендуем {d.days * d.people} тарелок: {d.days} дней ×{" "}
                {d.people} человек. Это количество для готовки; дневные КБЖУ
                относятся к одной тарелке каждого приёма. Готовый вес оценочный
                до взвешивания.
              </p>
              <div className="actions">
                <button
                  className="primary"
                  onClick={() => {
                    try {
                      persist(
                        approveChoice(
                          d,
                          slot,
                          pick.recipe,
                          pick.factor,
                          pick.batch,
                        ),
                      );
                      setPick(null);
                      setPage(0);
                      setDeviation(false);
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "Проверьте порции",
                      );
                    }
                  }}
                >
                  <Check size={16} />
                  Утвердить {slot.toLowerCase()}
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    setPreview({
                      recipe: pick.recipe,
                      servings: pick.recipe.servings,
                    })
                  }
                >
                  Посмотреть рецепт
                </button>
              </div>
            </div>
          )}
          <GeneratorPanel
            state={state}
            slot={slot}
            draft={d}
            update={update}
            onRecipe={(r) =>
              setPick({
                recipe: r,
                factor: Math.min(1, d.plateLimit / (r.yield / r.servings)),
                batch: d.days * d.people,
              })
            }
            notify={notify}
          />
        </>
      )}
      {step === 4 && (
        <>
          <div className="section-heading">
            <div>
              <h3>
                {approved
                  ? "Меню утверждено и сохранено"
                  : "Проверьте меню перед утверждением"}
              </h3>
              <p>
                Каждая версия хранит состав и инструкции на момент утверждения.
              </p>
            </div>
            {approved && (
              <button className="secondary" onClick={edit}>
                Изменить копию меню
              </button>
            )}
          </div>
          <div className="approved-grid">
            {slots.map((which) => {
              const c = d.choices[which];
              return (
                <div className="panel" key={which}>
                  <span className="eyebrow">{which}</span>
                  <h3>{c?.recipe.name ?? "Ещё не выбрано"}</h3>
                  {c && (
                    <>
                      <p>
                        {format(
                          (c.recipe.yield / c.recipe.servings) * c.factor,
                        )}{" "}
                        г на тарелку ·{" "}
                        {Math.round(portion(c.recipe).kcal * c.factor)} ккал
                      </p>
                      <p className="muted">
                        Готовим {c.batchPortions} тарелок · {c.recipe.equipment}
                      </p>
                      <button
                        className="secondary"
                        onClick={() => openBatch(which)}
                      >
                        Рецепт на всю партию
                      </button>
                    </>
                  )}
                  <button
                    className="text-btn"
                    onClick={() => {
                      persist({
                        ...d,
                        id: approved ? crypto.randomUUID() : d.id,
                        step: slots.indexOf(which) + 1,
                      });
                      setPick(null);
                    }}
                  >
                    Изменить {which.toLowerCase()}
                  </button>
                </div>
              );
            })}
          </div>
          {warnings.length > 0 && (
            <div className="notice">
              <div>
                <b>Перед готовкой</b>
                <ul>
                  {warnings.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
                {!approved && (
                  <label className="check-line">
                    <input
                      type="checkbox"
                      checked={deviation}
                      onChange={(e) => setDeviation(e.target.checked)}
                    />
                    Я проверил(а) отклонения по КБЖУ, объёму и хранению
                  </label>
                )}
              </div>
            </div>
          )}
          <div className="actions">
            <button
              className="primary"
              disabled={approved}
              onClick={() => {
                try {
                  if (
                    state.plan.some((m) => m.date >= d.startDate) &&
                    !confirm(
                      "Добавить утверждённое меню в календарь? Блюда в совпадающие даты и приёмы будут заменены; история сохранится.",
                    )
                  )
                    return;
                  update((s) => applyMenu(s, d, deviation));
                  notify(
                    "Меню утверждено. Оно сохранено в календаре и истории.",
                  );
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Не удалось сохранить меню",
                  );
                }
              }}
            >
              <Check size={16} />
              {approved ? "Сохранено в истории" : "Утвердить всё меню"}
            </button>
            <button
              className="secondary"
              disabled={!approved}
              onClick={() => {
                if (
                  state.shopping.length &&
                  !confirm("Заменить покупки списком для этих партий?")
                )
                  return;
                update((s) => ({ ...s, shopping: menuShopping(s, d) }));
                notify(
                  "Покупки рассчитаны на все приготовленные порции, запасы вычтены один раз.",
                );
                goShopping();
              }}
            >
              <ShoppingBasket size={16} />
              Покупки для партий
            </button>
          </div>
          <div className="panel cooking-schedule">
            <h3>
              <ChefHat size={19} /> План готовки и хранения
            </h3>
            {cookingPlan(d).map((x) => (
              <div className="list-row" key={x.slot}>
                <div>
                  <b>{x.name}</b>
                  <p className="muted">
                    {x.equipment} · базовая партия ≈ {x.minutes} мин · выход ≈{" "}
                    {format(x.totalGrams)} г · {x.plates} тарелок
                    {x.extra ? ` · ${x.extra} запасных` : ""}
                  </p>
                </div>
                <button
                  className="secondary"
                  disabled={
                    !approved ||
                    state.stockEvents.includes(`cook:${d.id}:${x.slot}`)
                  }
                  onClick={() => {
                    const result = cookBatch(state, d, x.slot);
                    if (
                      result.missing.length &&
                      !confirm(
                        "Не все продукты заведены в запасы: " +
                          result.missing.join(", ") +
                          ". Списать доступные количества и отметить готовку?",
                      )
                    )
                      return;
                    update(() => result.state);
                    notify(
                      "Готовка отмечена, доступные продукты списаны один раз. В дневник питания запись не добавлена.",
                    );
                  }}
                >
                  {state.stockEvents.includes(`cook:${d.id}:${x.slot}`)
                    ? "Готовка учтена"
                    : "Партия приготовлена"}
                </button>
              </div>
            ))}
            <p className="notice">
              Вместимость и общее время проверьте по вашей технике. Увеличенную
              партию готовьте несколькими загрузками; время не умножается
              автоматически. Приборы, совпадающие у блюд, используйте
              последовательно. Охладите готовую еду в течение 2 часов, храните
              до 3–4 дней при ≤ 4 °C, порции на конец недели заморозьте.
              Разогрев — до 74 °C.
            </p>
          </div>
        </>
      )}
      {preview && (
        <RecipeDialog
          recipe={preview.recipe}
          state={state}
          initialServings={preview.servings}
          readOnly
          close={() => setPreview(null)}
          update={update}
          onShop={() =>
            notify(
              "Для полного списка используйте «Покупки для партий» после утверждения меню.",
            )
          }
          onPlan={() => notify("Рецепт уже выбран в пошаговом плане.")}
          onDelete={() => {}}
        />
      )}
    </section>
  );
}
function Setup({
  draft: d,
  state,
  onSave,
  onDraftChange,
}: {
  draft: MenuDraft;
  state: FoodState;
  onSave: (d: MenuDraft) => void;
  onDraftChange: (d: MenuDraft) => void;
}) {
  const [form, setForm] = useState(structuredClone(d)),
    [error, setError] = useState("");
  useEffect(() => {
    if (JSON.stringify(form) === JSON.stringify(d)) return;
    const timer = setTimeout(() => {
      try {
        const target = targets(
          form.targets.kcal,
          form.targets.protein,
          form.fatMode,
          form.targets.fat,
          form.targets.carbs,
          form.fatShare,
        );
        const result = draftSchema.safeParse({ ...form, targets: target });
        if (result.success) onDraftChange(result.data);
      } catch {}
    }, 350);
    return () => clearTimeout(timer);
  }, [form]);
  let t = form.targets;
  try {
    t = targets(
      form.targets.kcal,
      form.targets.protein,
      form.fatMode,
      form.targets.fat,
      form.targets.carbs,
      form.fatShare,
    );
  } catch {}
  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          const nextTargets = targets(
            form.targets.kcal,
            form.targets.protein,
            form.fatMode,
            form.targets.fat,
            form.targets.carbs,
            form.fatShare,
          );
          if (!form.equipment.length)
            throw Error("Выберите хотя бы одну технику");
          if (!form.startDate) throw Error("Укажите дату начала");
          onSave({ ...form, targets: nextTargets, step: 1 });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Проверьте настройки");
        }
      }}
    >
      <h3>Цели на человека и ваша кухня</h3>
      <div className="form-grid">
        <label>
          Начало меню
          <input
            type="date"
            required
            value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
          />
        </label>
        <label>
          Количество дней
          <input
            type="number"
            required
            min="1"
            max="14"
            value={form.days}
            onChange={(e) => setForm({ ...form, days: Number(e.target.value) })}
          />
        </label>
        <label>
          Человек
          <input
            type="number"
            required
            min="1"
            max="10"
            value={form.people}
            onChange={(e) =>
              setForm({ ...form, people: Number(e.target.value) })
            }
          />
        </label>
        <label>
          Комфортная тарелка целиком, г
          <input
            type="number"
            required
            min="150"
            max="1500"
            value={form.plateLimit}
            onChange={(e) =>
              setForm({ ...form, plateLimit: Number(e.target.value) })
            }
          />
        </label>
        <label>
          Калории на день
          <input
            type="number"
            required
            min="100"
            max="10000"
            value={form.targets.kcal}
            onChange={(e) =>
              setForm({
                ...form,
                targets: { ...form.targets, kcal: Number(e.target.value) },
              })
            }
          />
        </label>
        <label>
          Белок на день, г
          <input
            type="number"
            required
            min="1"
            max="600"
            value={form.targets.protein}
            onChange={(e) =>
              setForm({
                ...form,
                targets: { ...form.targets, protein: Number(e.target.value) },
              })
            }
          />
        </label>
        <label>
          Жиры и углеводы
          <select
            value={form.fatMode}
            onChange={(e) =>
              setForm({ ...form, fatMode: e.target.value as "auto" | "manual" })
            }
          >
            <option value="auto">Рассчитать автоматически</option>
            <option value="manual">Задать вручную</option>
          </select>
        </label>
        {form.fatMode === "auto" ? (
          <label>
            Доля калорий на жиры, %
            <input
              type="number"
              required
              min="15"
              max="50"
              value={form.fatShare}
              onChange={(e) =>
                setForm({ ...form, fatShare: Number(e.target.value) })
              }
            />
          </label>
        ) : (
          <>
            {(["fat", "carbs"] as const).map((k, i) => (
              <label key={k}>
                {i ? "Углеводы, г" : "Жиры, г"}
                <input
                  type="number"
                  required
                  min="0"
                  max="1000"
                  value={form.targets[k]}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      targets: { ...form.targets, [k]: Number(e.target.value) },
                    })
                  }
                />
              </label>
            ))}
          </>
        )}
      </div>
      <div className="nutrition-strip">
        <div>
          <strong>{Math.round(t.kcal)}</strong>
          <span>ккал в день</span>
        </div>
        <div>
          <strong>{format(t.protein)} г</strong>
          <span>белки</span>
        </div>
        <div>
          <strong>{format(t.fat)} г</strong>
          <span>жиры</span>
        </div>
        <div>
          <strong>{format(t.carbs)} г</strong>
          <span>углеводы</span>
        </div>
      </div>
      {form.fatMode === "manual" && Math.abs(targetMismatch(t)) > 50 && (
        <p className="notice">
          Энергия заданных БЖУ отличается от цели на{" "}
          {Math.round(targetMismatch(t))} ккал. Проверьте значения.
        </p>
      )}
      <h3>Что можно использовать для этого меню?</h3>
      <div className="equipment-choices">
        {state.profile.equipment.map((x) => (
          <label key={x} className="check-line">
            <input
              type="checkbox"
              checked={form.equipment.includes(x)}
              onChange={() =>
                setForm({
                  ...form,
                  equipment: form.equipment.includes(x)
                    ? form.equipment.filter((e) => e !== x)
                    : [...form.equipment, x],
                })
              }
            />
            {x}
          </label>
        ))}
      </div>
      <p className="muted">
        Вес тарелки включает основное блюдо, гарнир и соус. После готовки
        оцените порцию — подбор учтёт, если её оказалось много или мало. Для
        этого меню нужно {form.days * form.people * 3} тарелок: {form.days} дней
        × {form.people} человек × 3 приёма.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="primary">
        <ArrowRight size={16} />
        Выбрать завтрак
      </button>
    </form>
  );
}
