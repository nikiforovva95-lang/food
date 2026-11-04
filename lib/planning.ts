import {
  allRecipes,
  dateKey,
  eligible,
  format,
  multiply,
  portion,
  recommend,
  shoppingFor,
  sumMeals,
} from "./domain";
import type {
  FoodState,
  Meal,
  MealChoice,
  MenuDraft,
  MenuRevision,
  Nutrition,
  Recipe,
  Slot,
} from "./types";
export const slots: Slot[] = ["Завтрак", "Обед", "Ужин"];
export const zero: Nutrition = { kcal: 0, protein: 0, fat: 0, carbs: 0 };
export function targets(
  kcal: number,
  protein: number,
  mode: "auto" | "manual" = "auto",
  fat = 0,
  carbs = 0,
  fatShare = 30,
): Nutrition {
  if (
    !Number.isFinite(kcal) ||
    !Number.isFinite(protein) ||
    kcal <= 0 ||
    protein <= 0
  )
    throw Error("Укажите положительные калории и белок.");
  const f = mode === "auto" ? (kcal * fatShare) / 900 : fat;
  const c = mode === "auto" ? (kcal - protein * 4 - f * 9) / 4 : carbs;
  if (!Number.isFinite(f) || !Number.isFinite(c) || f < 0 || c < 0)
    throw Error(
      "Для выбранного белка и жиров не хватает калорий. Уменьшите белок/жиры или увеличьте калории.",
    );
  return { kcal, protein, fat: f, carbs: c };
}
export function targetMismatch(t: Nutrition) {
  return t.protein * 4 + t.fat * 9 + t.carbs * 4 - t.kcal;
}
export function createDraft(s: FoodState): MenuDraft {
  return {
    id: crypto.randomUUID(),
    startDate: dateKey(new Date()),
    days: 3,
    people: 1,
    equipment: [...s.profile.equipment],
    targets: targets(
      s.profile.kcal,
      s.profile.protein,
      s.profile.fatMode,
      s.profile.fat,
      s.profile.carbs,
      s.profile.fatShare,
    ),
    fatMode: s.profile.fatMode,
    fatShare: s.profile.fatShare,
    plateLimit: s.profile.plateLimit,
    choices: {},
    rejected: [],
    offered: [],
    step: 0,
  };
}
export function chosenNutrition(d: MenuDraft): Nutrition {
  return Object.values(d.choices).reduce(
    (total, c) => {
      const n = multiply(portion(c.recipe), c.factor);
      return {
        kcal: total.kcal + n.kcal,
        protein: total.protein + n.protein,
        fat: total.fat + n.fat,
        carbs: total.carbs + n.carbs,
      };
    },
    { ...zero },
  );
}
export function remainder(d: MenuDraft): Nutrition {
  const n = chosenNutrition(d);
  return {
    kcal: d.targets.kcal - n.kcal,
    protein: d.targets.protein - n.protein,
    fat: d.targets.fat - n.fat,
    carbs: d.targets.carbs - n.carbs,
  };
}
export function slotTarget(d: MenuDraft, slot: Slot): Nutrition {
  const remaining = remainder({
    ...d,
    choices: Object.fromEntries(
      Object.entries(d.choices).filter(([k]) => k !== slot),
    ),
  });
  const shares: Record<Slot, number> = { Завтрак: 0.25, Обед: 0.4, Ужин: 0.35 };
  const empty = slots.filter((x) => x === slot || !d.choices[x]);
  const share = shares[slot] / empty.reduce((sum, x) => sum + shares[x], 0);
  return {
    kcal: Math.max(0, remaining.kcal * share),
    protein: Math.max(0, remaining.protein * share),
    fat: Math.max(0, remaining.fat * share),
    carbs: Math.max(0, remaining.carbs * share),
  };
}
export function suggest(
  s: FoodState,
  d: MenuDraft,
  slot: Slot,
  exclude: string[] = [],
) {
  const target = slotTarget(d, slot);
  const profile = { ...s.profile, equipment: d.equipment };
  const ranked = recommend({ ...s, profile });
  const weights = { kcal: 1.4, protein: 2.2, fat: 0.45, carbs: 0.45 };
  return ranked
    .filter(
      (x) =>
        x.recipe.category === slot &&
        !d.rejected.includes(x.recipe.id) &&
        !d.offered.includes(x.recipe.id) &&
        !exclude.includes(x.recipe.id),
    )
    .map((x) => {
      const r = x.recipe,
        n = portion(r),
        weight = r.yield / r.servings;
      const comfort = s.feedback[r.id]?.comfort;
      const limit =
        d.plateLimit *
        (comfort === "large" ? 0.85 : comfort === "small" ? 1.1 : 1);
      const candidates = [0.5, 0.65, 0.8, 1, 1.15, 1.3, 1.5].filter(
        (f) => weight * f <= limit,
      );
      if (!candidates.length) candidates.push(Math.min(1, limit / weight));
      const fit = (factor: number) =>
        (Object.keys(weights) as (keyof Nutrition)[]).reduce(
          (penalty, k) =>
            penalty +
            (Math.abs(n[k] * factor - target[k]) / Math.max(target[k], 20)) *
              weights[k],
          0,
        );
      const factor = candidates.sort((a, b) => fit(a) - fit(b))[0];
      const recent = s.menuHistory
        .slice(-5)
        .filter((h) =>
          Object.values(h.draft.choices).some((c) => c.recipe.id === r.id),
        ).length;
      const novelty =
        s.profile.novelty === "new"
          ? 14
          : s.profile.novelty === "familiar"
            ? 2
            : 7;
      return {
        ...x,
        factor,
        grams: weight * factor,
        score: x.score - fit(factor) * 12 - recent * novelty,
        reason: `${x.reason} · ${format(weight * factor)} г на тарелку${comfort === "large" ? " · уменьшено по вашей оценке порции" : ""}`,
      };
    })
    .sort((a, b) => b.score - a.score);
}
export function approveChoice(
  d: MenuDraft,
  slot: Slot,
  recipe: Recipe,
  factor: number,
  batchPortions: number,
): MenuDraft {
  if (!Number.isFinite(factor) || factor <= 0 || factor > 5)
    throw Error("Неверный размер тарелки");
  if (
    !Number.isInteger(batchPortions) ||
    batchPortions < 1 ||
    batchPortions > 140
  )
    throw Error("От 1 до 140 порций в партии");
  const copy = structuredClone(recipe);
  const choice: MealChoice = {
    recipe: copy,
    factor,
    batchPortions,
    approvedAt: new Date().toISOString(),
  };
  return {
    ...d,
    choices: { ...d.choices, [slot]: choice },
    step: Math.min(4, slots.indexOf(slot) + 2),
  };
}
export function draftWarnings(d: MenuDraft) {
  const messages: string[] = [];
  const n = chosenNutrition(d),
    need = d.days * d.people;
  for (const slot of slots) {
    const c = d.choices[slot];
    if (!c) {
      messages.push(`Не утверждён ${slot.toLowerCase()}.`);
      continue;
    }
    if (c.batchPortions < need)
      messages.push(
        `${slot}: ${c.batchPortions} порц. на ${need} запланированных тарелок — увеличьте партию.`,
      );
    if ((c.recipe.yield / c.recipe.servings) * c.factor > d.plateLimit)
      messages.push(`${slot}: тарелка больше выбранного комфортного веса.`);
    if (!d.equipment.includes(c.recipe.equipment))
      messages.push(`${slot}: техника больше не выбрана.`);
  }
  if (Math.abs(n.kcal - d.targets.kcal) > d.targets.kcal * 0.05)
    messages.push(
      `План ${Math.round(n.kcal)} ккал: отклонение от цели больше 5%. Измените блюда/тарелку или подтвердите это явно.`,
    );
  if (n.protein < d.targets.protein * 0.9)
    messages.push(
      `До цели белка не хватает ${format(d.targets.protein - n.protein)} г. Можно пересмотреть состав или добавить отдельный перекус.`,
    );
  if (d.days > 3)
    messages.push(
      "Порции на конец периода заморозьте: план не предполагает хранение всех блюд неделю в холодильнике.",
    );
  return messages;
}
export function batchMeals(d: MenuDraft): Meal[] {
  return slots.flatMap((slot) => {
    const c = d.choices[slot];
    return c
      ? [
          {
            id: `${d.id}:batch:${slot}`,
            date: d.startDate,
            slot,
            recipeId: c.recipe.id,
            servings: c.batchPortions * c.factor,
            recipeSnapshot: structuredClone(c.recipe),
            menuId: d.id,
          },
        ]
      : [];
  });
}
export function applyMenu(
  s: FoodState,
  d: MenuDraft,
  acceptDeviation = false,
): FoodState {
  if (s.menuHistory.some((h) => h.id === d.id)) return s;
  const need = d.days * d.people;
  for (const slot of slots) {
    const c = d.choices[slot];
    if (!c) throw Error(`Сначала утвердите ${slot.toLowerCase()}`);
    if (c.batchPortions < need)
      throw Error(`${slot}: порций в партии меньше числа тарелок в плане`);
    if (!eligible(c.recipe, { ...s.profile, equipment: d.equipment }))
      throw Error(
        `${slot}: рецепт больше не соответствует ограничениям профиля. Перевыберите блюдо.`,
      );
  }
  if (draftWarnings(d).length && !acceptDeviation)
    throw Error("Проверьте предупреждения и подтвердите отклонения.");
  const meals: Meal[] = [];
  for (let day = 0; day < d.days; day++) {
    const date = new Date(d.startDate + "T12:00:00");
    date.setDate(date.getDate() + day);
    for (const slot of slots) {
      const c = d.choices[slot]!;
      meals.push({
        id: crypto.randomUUID(),
        date: dateKey(date),
        slot,
        recipeId: c.recipe.id,
        servings: c.factor * d.people,
        recipeSnapshot: structuredClone(c.recipe),
        menuId: d.id,
        people: d.people,
      });
    }
  }
  const revision: MenuRevision = {
    id: d.id,
    createdAt: new Date().toISOString(),
    label: `${d.startDate} · ${d.days} дн. · ${d.people} чел.`,
    draft: structuredClone({ ...d, step: 4 }),
    meals: structuredClone(meals),
  };
  const keys = new Set(meals.map((m) => m.date + "|" + m.slot));
  return {
    ...s,
    wizard: { ...d, step: 4 },
    menuHistory: [...s.menuHistory, revision],
    plan: [...s.plan.filter((m) => !keys.has(m.date + "|" + m.slot)), ...meals],
  };
}
export function menuShopping(s: FoodState, d: MenuDraft) {
  return shoppingFor(batchMeals(d), allRecipes({ ...s, hidden: [] }), s.pantry);
}
export function recipeForMeal(m: Meal, recipes: Recipe[]) {
  return m.recipeSnapshot ?? recipes.find((r) => r.id === m.recipeId);
}
export function consumeOne(m: Meal, date = dateKey(new Date())): Meal {
  return {
    ...structuredClone(m),
    id: crypto.randomUUID(),
    date,
    servings: m.servings / (m.people ?? 1),
    people: 1,
  };
}
export function cookingPlan(d: MenuDraft) {
  return slots.flatMap((slot) => {
    const c = d.choices[slot];
    if (!c) return [];
    return [
      {
        slot,
        name: c.recipe.name,
        equipment: c.recipe.equipment,
        plates: c.batchPortions,
        extra: Math.max(0, c.batchPortions - d.days * d.people),
        grams: (c.recipe.yield / c.recipe.servings) * c.factor,
        totalGrams:
          (c.recipe.yield / c.recipe.servings) * c.factor * c.batchPortions,
        minutes: c.recipe.minutes,
        estimated: true,
      },
    ];
  });
}
