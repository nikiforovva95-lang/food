import type { FoodState, MenuDraft, Slot } from "./types";
import { basketComparison } from "./pricing";
import { dateKey, emptyFeedback } from "./domain";
export function purchasedToPantry(s: FoodState): FoodState {
  const items = s.shopping.filter(
    (i) => i.checked && !s.stockEvents.includes(`purchase:${i.id}`),
  );
  if (!items.length) return s;
  const comparisons = basketComparison(
    s.shopping,
    s.priceQuotes,
    s.shoppingSettings,
  );
  const basket =
    comparisons.find(
      (b) => b.stores.join("|") === s.shoppingSettings.chosenStores.join("|"),
    ) ?? comparisons[0];
  const pantry = structuredClone(s.pantry);
  for (const item of items) {
    const priced = basket?.lines.find((l) => l?.item.id === item.id);
    const bought = priced
      ? priced.packs * priced.quote.packAmount
      : item.amount;
    const existing = pantry.find(
      (p) =>
        p.name.trim().toLowerCase() === item.name.trim().toLowerCase() &&
        p.unit === item.unit &&
        !p.expires,
    );
    if (existing) existing.amount += bought;
    else
      pantry.push({
        id: crypto.randomUUID(),
        name: item.name,
        amount: bought,
        unit: item.unit,
        expires: "",
      });
  }
  return {
    ...s,
    pantry,
    stockEvents: [...s.stockEvents, ...items.map((i) => `purchase:${i.id}`)],
  };
}
export function cookBatch(
  s: FoodState,
  d: MenuDraft,
  slot: Slot,
): { state: FoodState; missing: string[] } {
  const key = `cook:${d.id}:${slot}`,
    c = d.choices[slot];
  if (!c || s.stockEvents.includes(key)) return { state: s, missing: [] };
  const pantry = structuredClone(s.pantry),
    missing: string[] = [];
  const factor = (c.batchPortions * c.factor) / c.recipe.servings;
  for (const i of c.recipe.ingredients) {
    if (i.id === "water") continue;
    let need = i.amount * factor;
    for (const p of pantry
      .filter(
        (p) =>
          p.name.trim().toLowerCase() === i.name.trim().toLowerCase() &&
          p.unit === i.unit &&
          (!p.expires || p.expires >= dateKey(new Date())),
      )
      .sort((a, b) =>
        (a.expires || "9999").localeCompare(b.expires || "9999"),
      )) {
      const take = Math.min(p.amount, need);
      p.amount -= take;
      need -= take;
    }
    if (need > 0.001) missing.push(i.name);
  }
  return {
    state: {
      ...s,
      pantry: pantry.filter((p) => p.amount > 0.001),
      stockEvents: [...s.stockEvents, key],
      feedback: {
        ...s.feedback,
        [c.recipe.id]: {
          ...emptyFeedback,
          ...s.feedback[c.recipe.id],
          cooked: true,
        },
      },
    },
    missing,
  };
}
