import { ingredient } from "./catalog";
import { eligible } from "./domain";
import type { Profile, Recipe } from "./types";
export type Adaptation = "yogurt" | "lemon" | "vegetables";
export function adaptRecipe(
  base: Recipe,
  kind: Adaptation,
  profile: Profile,
): Recipe {
  const r = structuredClone(base);
  r.id = crypto.randomUUID();
  r.tags = ["Моя адаптация", ...r.tags];
  r.yieldMeasured = false;
  const f = base.servings / 2;
  const additions =
    kind === "yogurt"
      ? [ingredient("yogurt", 100 * f), ingredient("lemon", 10 * f)]
      : kind === "lemon"
        ? [ingredient("lemon", 20 * f), ingredient("thyme", 1 * f)]
        : [ingredient("cucumber", 140 * f)];
  for (const item of additions) {
    const existing = r.ingredients.find((i) => i.id === item.id);
    if (existing) existing.amount += item.amount;
    else r.ingredients.push(item);
  }
  const suffix = {
    yogurt: "с йогуртовым соусом",
    lemon: "с лимоном и тимьяном",
    vegetables: "со свежим огурцом",
  }[kind];
  r.name = `${base.name} — ${suffix}`;
  if (kind === "yogurt") {
    r.allergens = [...new Set([...r.allergens, "Молоко"])];
    r.steps.push(
      `Без нагрева: смешайте ${100 * f} г йогурта с ${10 * f} г лимонного сока. Подавайте отдельно к готовому блюду; это дополнительный соус, включённый в состав.`,
    );
  }
  if (kind === "lemon")
    r.steps.push(
      `Снимите готовое блюдо с нагрева. Добавьте дополнительные ${20 * f} г лимонного сока и ${1 * f} г тимьяна, перемешайте. Начните с части лимона и отрегулируйте вкус; фактический расход измените в составе.`,
    );
  if (kind === "vegetables")
    r.steps.push(
      `Без нагрева: вымойте и нарежьте дополнительные ${140 * f} г огурца, подайте рядом с основным блюдом. Огурец входит в общий вес тарелки.`,
    );
  // The uncooked side/sauce is added to the estimated cooked yield, not used to infer cooking losses.
  r.yield += additions.reduce((n, i) => n + i.amount, 0);
  r.cost = base.cost;
  r.minutes += 3;
  r.source = `Локальная адаптация «${base.name}», не генерация ИИ. Холодная добавка учтена по массе; исходный готовый выход остаётся оценкой. Стоимость новых добавок ещё не оценена. ${base.source}`;
  if (!eligible(r, profile))
    throw Error(
      "Этот вариант не соответствует вашим ограничениям или доступной технике. Выберите другой рецепт/адаптацию.",
    );
  return r;
}
