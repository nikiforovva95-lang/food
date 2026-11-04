import { catalog } from "./catalog.ts";
import { z } from "zod";
const num = z.number().finite().min(0).max(1000000),
  pos = num.gt(0),
  str = z.string().max(20000),
  unit = z.enum(["г", "мл", "шт"]);
const nutrients = z.object({ kcal: num, protein: num, fat: num, carbs: num });
const ingredient = z.object({
  id: str,
  name: str.min(1),
  amount: pos,
  unit,
  gramsPerUnit: pos,
  category: str,
  nutrition: nutrients,
  source: str.min(1),
});
export const recipeSchema = z.object({
  id: str,
  name: str.min(1),
  description: str,
  category: str,
  proteinGroup: str,
  minutes: pos,
  difficulty: z.enum(["Легко", "Средне"]),
  equipment: str,
  cost: num,
  servings: pos.max(100),
  yield: pos,
  yieldMeasured: z.boolean(),
  image: str,
  ingredients: z.array(ingredient).min(1).max(200),
  steps: z.array(str.min(1)).min(1).max(100),
  substitutions: str,
  tags: z.array(str),
  allergens: z.array(str),
  source: str,
});
const meal = z.object({
  id: str,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slot: str,
  recipeId: str,
  servings: pos.max(100),
});
const legacyStateSchema = z.object({
  version: z.literal(1),
  profile: z.object({
    name: str,
    goal: str,
    kcal: pos,
    protein: pos,
    fat: pos,
    carbs: pos,
    mealProtein: pos,
    weeklyServings: z.number().int().min(1).max(42),
    noPork: z.boolean(),
    dislikes: str,
    allergens: str,
    spices: str,
    budget: pos,
    maxMinutes: pos,
    difficulty: str,
    defaultServings: pos.max(100),
    equipment: z.array(str),
  }),
  feedback: z.record(
    str,
    z.object({
      rating: z.number().int().min(0).max(10),
      reaction: z.enum(["", "like", "dislike", "try"]),
      favorite: z.boolean(),
      cooked: z.boolean(),
      reasons: z.array(str),
      notes: str,
    }),
  ),
  recipes: z.array(recipeSchema),
  hidden: z.array(str),
  plan: z.array(meal),
  consumed: z.array(meal),
  pantry: z.array(
    z.object({ id: str, name: str.min(1), amount: pos, unit, expires: str }),
  ),
  shopping: z.array(
    z.object({
      id: str,
      name: str.min(1),
      amount: pos,
      unit,
      category: str,
      checked: z.boolean(),
    }),
  ),
});

export const targetsSchema = nutrients;
export const choiceSchema = z.object({
  recipe: recipeSchema,
  factor: pos.max(5),
  batchPortions: z.number().int().min(1).max(140),
  approvedAt: str,
});
export const draftSchema = z.object({
  id: str,
  startDate: z.iso.date(),
  days: z.number().int().min(1).max(14),
  people: z.number().int().min(1).max(10),
  equipment: z.array(str).min(1),
  targets: nutrients,
  fatMode: z.enum(["auto", "manual"]),
  fatShare: z.number().min(15).max(50),
  plateLimit: pos.max(1500),
  choices: z.object({
    Завтрак: choiceSchema.optional(),
    Обед: choiceSchema.optional(),
    Ужин: choiceSchema.optional(),
  }),
  rejected: z.array(str),
  offered: z.array(str).default([]),
  step: z.number().int().min(0).max(4),
});
export const priceQuoteSchema = z.object({
  id: str,
  name: str.min(1),
  store: str.min(1),
  city: str.min(1),
  location: str,
  packAmount: pos,
  unit,
  price: pos,
  observedAt: z.iso.datetime(),
  source: str.min(1),
  kind: z.enum(["manual", "estimate", "feed"]),
  condition: z.enum(["regular", "loyalty", "promo"]).default("regular"),
  conditions: str.default(""),
  validUntil: z.union([z.literal(""), z.iso.date()]),
});
const v2Schema = legacyStateSchema.extend({
  version: z.literal(2),
  profile: legacyStateSchema.shape.profile.extend({
    fat: num,
    carbs: num,
    fatMode: z.enum(["auto", "manual"]).default("auto"),
    fatShare: z.number().min(15).max(50).default(30),
    plateLimit: pos.max(1500).default(450),
    novelty: z.enum(["balanced", "familiar", "new"]).default("balanced"),
  }),
  feedback: z.record(
    str,
    legacyStateSchema.shape.feedback.valueType.extend({
      comfort: z.enum(["small", "right", "large"]).optional(),
    }),
  ),
  plan: z.array(
    meal.extend({
      recipeSnapshot: recipeSchema.optional(),
      menuId: str.optional(),
      people: z.number().int().min(1).max(10).optional(),
    }),
  ),
  consumed: z.array(
    meal.extend({
      recipeSnapshot: recipeSchema.optional(),
      menuId: str.optional(),
      people: z.number().int().min(1).max(10).optional(),
    }),
  ),
  wizard: draftSchema.nullable().default(null),
  menuHistory: z
    .array(
      z.object({
        id: str,
        createdAt: str,
        label: str,
        draft: draftSchema,
        meals: z.array(
          meal.extend({
            recipeSnapshot: recipeSchema.optional(),
            menuId: str.optional(),
            people: z.number().int().min(1).max(10).optional(),
          }),
        ),
      }),
    )
    .default([]),
  recipeHistory: z
    .array(z.object({ id: str, createdAt: str, recipe: recipeSchema }))
    .default([]),
  priceQuotes: z.array(priceQuoteSchema).default([]),
  shoppingSettings: z
    .object({
      city: str,
      location: str,
      stores: z.array(str),
      mode: z.enum(["one-store", "cheapest"]),
      delivery: num,
      maxStores: z.number().int().min(1).max(4),
      chosenStores: z.array(str).default([]),
      loyaltyStores: z.array(str).default([]),
    })
    .default({
      city: "Краснодар",
      location: "",
      stores: ["Магнит", "Пятёрочка", "Лента", "Перекрёсток"],
      mode: "one-store",
      delivery: 0,
      maxStores: 2,
      chosenStores: [],
      loyaltyStores: [],
    }),
  stockEvents: z.array(str).default([]),
});
export function readState(input: unknown) {
  const value = z.object({ version: z.number() }).passthrough().parse(input);
  if (value.version === 1) {
    const old = legacyStateSchema.parse(input);
    const recipes = [...catalog, ...old.recipes];
    const freeze = (m: (typeof old.plan)[number]) => ({
      ...m,
      recipeSnapshot: structuredClone(
        [...recipes].reverse().find((r) => r.id === m.recipeId),
      ),
    });
    return v2Schema.parse({
      ...old,
      version: 2,
      profile: { ...old.profile, fatMode: "manual" },
      plan: old.plan.map(freeze),
      consumed: old.consumed.map(freeze),
    });
  }
  return v2Schema.parse(input);
}
export { v2Schema };

export const stateSchema = v2Schema;
