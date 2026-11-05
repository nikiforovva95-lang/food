"use client";
import { useState } from "react";
import { Coffee, Fish, Leaf, Utensils } from "lucide-react";
import type { Recipe } from "@/lib/types";

// A missing photograph should never be replaced with another dish's photograph.
export function RecipeImage({ recipe }: { recipe: Recipe }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const breakfast = recipe.category === "Завтрак";
  const fish = /лосось|треска|рыба|тунец|кревет/i.test(recipe.name);
  const vegetables = /салат|нут|тофу|чечевиц/i.test(recipe.name);
  const Icon = breakfast ? Coffee : fish ? Fish : vegetables ? Leaf : Utensils;
  const tone = breakfast
    ? "breakfast"
    : fish
      ? "fish"
      : vegetables
        ? "vegetables"
        : "meal";
  if (!recipe.image || failedSource === recipe.image)
    return (
      <div
        className={`recipe-placeholder ${tone}`}
        role="img"
        aria-label={`Нет фотографии: ${recipe.name}`}
      >
        <span className="placeholder-orbit" aria-hidden="true">
          <Icon size={42} strokeWidth={1.3} />
        </span>
        <span>{recipe.category}</span>
        <small>Фото пока нет</small>
      </div>
    );
  return (
    <img
      src={recipe.image}
      alt={recipe.name}
      loading="lazy"
      onError={() => setFailedSource(recipe.image)}
    />
  );
}
