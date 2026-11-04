import { describe, it, expect } from "vitest";
import { catalog } from "../lib/catalog";
import {
  initialState,
  nutrition,
  portion,
  scaleRecipe,
  shoppingFor,
} from "../lib/domain";
import {
  applyMenu,
  approveChoice,
  batchMeals,
  chosenNutrition,
  consumeOne,
  createDraft,
  menuShopping,
  remainder,
  slots,
  slotTarget,
  suggest,
  targets,
} from "../lib/planning";
import { readState, stateSchema } from "../lib/validation";
import { cookBatch, purchasedToPantry } from "../lib/inventory";
import { adaptRecipe } from "../lib/recipe-adaptation";
function ready() {
  const s = initialState();
  let d = createDraft(s);
  d.days = 2;
  d.people = 2;
  for (const slot of slots) {
    const r = catalog.find((r) => r.category === slot)!;
    d = approveChoice(d, slot, r, 1, 4);
  }
  return { s, d };
}
describe("Пошаговое меню и цели", () => {
  it("автоматически распределяет энергию без потери суточной цели", () => {
    const t = targets(2200, 150);
    expect(t.fat).toBeCloseTo(73.33333);
    expect(t.carbs).toBe(235);
    expect(t.protein * 4 + t.fat * 9 + t.carbs * 4).toBeCloseTo(2200);
    expect(targets(2200, 180).carbs).toBe(205);
  });
  it("отвергает невозможные цели и не создаёт отрицательные углеводы", () => {
    expect(() => targets(100, 150)).toThrow();
    expect(() => targets(NaN, 150)).toThrow();
  });
  it("сохраняет ручные цели без их незаметной подмены", () => {
    expect(targets(2000, 140, "manual", 60, 200)).toEqual({
      kcal: 2000,
      protein: 140,
      fat: 60,
      carbs: 200,
    });
  });
  it("утверждённый завтрак остаётся неизменным при выборе обеда", () => {
    const s = initialState();
    let d = createDraft(s);
    d = approveChoice(d, "Завтрак", catalog[8], 1, 3);
    const breakfast = structuredClone(d.choices["Завтрак"]);
    const targetBefore = slotTarget(d, "Обед");
    d = approveChoice(d, "Обед", catalog[0], 1, 3);
    expect(d.choices["Завтрак"]).toEqual(breakfast);
    expect(remainder(d).kcal).toBeCloseTo(
      d.targets.kcal - portion(catalog[8]).kcal - portion(catalog[0]).kcal,
    );
    expect(targetBefore.kcal).toBeGreaterThan(0);
  });
  it("отделяет дневную тарелку от людей, дней и партии", () => {
    const { s, d } = ready();
    const daily = chosenNutrition(d);
    expect(daily.kcal).toBeCloseTo(
      slots.reduce((n, slot) => n + portion(d.choices[slot]!.recipe).kcal, 0),
    );
    const next = applyMenu(s, d, true);
    expect(next.plan).toHaveLength(6);
    expect(next.plan[0].servings).toBe(2);
    expect(batchMeals(d)[0].servings).toBe(4);
  });
  it("не подтверждает недостаточное количество приготовленных порций", () => {
    const { s, d } = ready();
    d.choices["Обед"]!.batchPortions = 1;
    expect(() => applyMenu(s, d, true)).toThrow(/порций/);
  });
  it("требует явного принятия отклонений и неполного выбора", () => {
    const { s, d } = ready();
    d.targets.kcal = 10000;
    expect(() => applyMenu(s, d)).toThrow(/предупреждения/);
    delete d.choices["Ужин"];
    expect(() => applyMenu(s, d, true)).toThrow(/ужин/);
  });
  it("повторное подтверждение не дублирует меню", () => {
    const { s, d } = ready();
    const next = applyMenu(s, d, true);
    expect(applyMenu(next, d, true)).toBe(next);
    expect(next.menuHistory).toHaveLength(1);
  });
  it("снимок защищает меню от последующей правки и удаления исходного рецепта", () => {
    const { s, d } = ready();
    const next = applyMenu(s, d, true);
    const name = next.plan[0].recipeSnapshot!.name;
    d.choices["Завтрак"]!.recipe.name = "Другая версия";
    expect(next.plan[0].recipeSnapshot!.name).toBe(name);
    expect(next.menuHistory[0].draft.choices["Завтрак"]!.recipe.name).toBe(
      name,
    );
  });
  it("записывает съеденное одного человека и сохраняет снимок", () => {
    const { s, d } = ready();
    const next = applyMenu(s, d, true);
    const meal = consumeOne(next.plan[0]);
    expect(meal.servings).toBe(1);
    expect(meal.recipeSnapshot).not.toBe(next.plan[0].recipeSnapshot);
    expect(next.consumed).toHaveLength(0);
  });
  it("покупки учитывают именно приготовленные партии и снимки", () => {
    const { s, d } = ready();
    d.choices["Обед"]!.batchPortions = 6;
    const shopping = menuShopping(s, d);
    const expected = d.choices["Обед"]!.recipe.ingredients.find(
      (i) => i.id === "chicken",
    )!;
    const chicken = shopping.find((i) => i.name === expected.name)!;
    expect(chicken.amount).toBeGreaterThanOrEqual(expected.amount * 3);
  });
  it("подбор соблюдает комфортный вес, историю и отклонённые варианты", () => {
    const { s, d } = ready();
    d.choices = {};
    d.plateLimit = 300;
    const found = suggest(s, d, "Обед");
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((x) => x.grams <= 300.001)).toBe(true);
    d.rejected = [found[0].recipe.id];
    expect(
      suggest(s, d, "Обед").some((x) => x.recipe.id === d.rejected[0]),
    ).toBe(false);
  });
  it("масштабирует граммы в шагах, сохраняя температуры и время", () => {
    const r = {
      ...catalog[0],
      steps: [
        "Добавьте 220 г воды и 100 г крупы. Готовьте 15 минут при 200 °C.",
      ],
    };
    const scaled = scaleRecipe(r, 4);
    expect(scaled.steps[0]).toContain("440 г воды");
    expect(scaled.steps[0]).toContain("200 г крупы");
    expect(scaled.steps[0]).toContain("15 минут");
    expect(scaled.steps[0]).toContain("200 °C");
  });
});
describe("Миграция и запасы", () => {
  it("переносит v1 без потери рецептов, плана и ручных целей", () => {
    const s = initialState();
    const legacy = {
      ...s,
      version: 1,
      recipes: [catalog[0]],
      plan: [
        {
          id: "meal",
          date: "2026-11-04",
          slot: "Обед",
          recipeId: catalog[0].id,
          servings: 1,
        },
      ],
    };
    const migrated = readState(legacy);
    expect(migrated.version).toBe(2);
    expect(migrated.recipes).toEqual([catalog[0]]);
    expect(migrated.plan).toHaveLength(1);
    expect(migrated.profile.fatMode).toBe("manual");
    expect(migrated.menuHistory).toEqual([]);
    expect(stateSchema.safeParse(migrated).success).toBe(true);
  });
  it("не принимает неизвестный формат вместо тихой потери данных", () => {
    expect(() => readState({ ...initialState(), version: 99 })).toThrow();
  });
  it("переносит купленное однократно и объединяет совместимые единицы", () => {
    const s = initialState();
    s.shopping = [
      {
        id: "a",
        name: "Куриное филе",
        amount: 400,
        unit: "г",
        category: "Мясо",
        checked: true,
      },
    ];
    s.pantry = [
      { id: "p", name: "Куриное филе", amount: 100, unit: "г", expires: "" },
    ];
    const next = purchasedToPantry(s);
    expect(next.pantry[0].amount).toBe(500);
    expect(purchasedToPantry(next)).toBe(next);
  });
  it("списание партии не делает запасы отрицательными и не записывает съеденное", () => {
    const { s, d } = ready();
    s.pantry = [
      { id: "p", name: "Куриное филе", amount: 10, unit: "г", expires: "" },
    ];
    const result = cookBatch(s, d, "Обед");
    expect(result.missing).toContain("Куриное филе");
    expect(result.state.pantry.every((p) => p.amount >= 0)).toBe(true);
    expect(result.state.consumed).toEqual([]);
    expect(cookBatch(result.state, d, "Обед").state).toBe(result.state);
  });
  it("локальная адаптация пересчитывает состав и сохраняет исходник", () => {
    const base = catalog[0];
    const r = adaptRecipe(base, "yogurt", initialState().profile);
    expect(r.id).not.toBe(base.id);
    expect(r.allergens).toContain("Молоко");
    expect(nutrition(r).protein).toBeGreaterThan(nutrition(base).protein);
    expect(r.yieldMeasured).toBe(false);
    expect(base.allergens).not.toContain("Молоко");
  });
  it("не адаптирует блюдо с исключённым аллергеном", () => {
    expect(() =>
      adaptRecipe(catalog[0], "yogurt", {
        ...initialState().profile,
        allergens: "Молоко",
      }),
    ).toThrow();
  });
});

describe("Дополнительные гарантии рецептов и запасов", () => {
  it("экстраполированный новый выход не выдаётся за взвешенный", () => {
    const measured = { ...catalog[0], yieldMeasured: true };
    expect(scaleRecipe(measured, 4).yieldMeasured).toBe(false);
    expect(scaleRecipe(measured, 2).yieldMeasured).toBe(true);
  });
  it("при наличии выбранной фасовки в запасы переносится полная покупка", () => {
    const s = initialState();
    s.shopping = [
      {
        id: "item",
        name: "Куриное филе",
        amount: 700,
        unit: "г",
        category: "Мясо",
        checked: true,
      },
    ];
    s.priceQuotes = [
      {
        id: "q",
        name: "Куриное филе",
        store: "Магнит",
        city: "Краснодар",
        location: "",
        packAmount: 500,
        unit: "г",
        price: 200,
        observedAt: new Date().toISOString(),
        source: "Синтетический тест",
        kind: "manual",
        validUntil: "",
      },
    ];
    expect(purchasedToPantry(s).pantry[0].amount).toBe(1000);
  });
});
