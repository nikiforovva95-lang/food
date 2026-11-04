"use client";
import { useEffect, useState } from "react";
import { History, RotateCcw } from "lucide-react";
import type { FoodState, Recipe } from "@/lib/types";
export function VersionHistory({
  state,
  update,
  notify,
  goPlan,
  onRecipe,
}: {
  state: FoodState;
  update: (f: (s: FoodState) => FoodState) => void;
  notify: (m: string) => void;
  goPlan: () => void;
  onRecipe: (r: Recipe) => void;
}) {
  const [release, setRelease] = useState<{
    version: string;
    channel: string;
    commit: string;
    schemaVersion: number;
    releases: {
      version: string;
      commit: string;
      schemaVersion: number;
      createdAt: string;
    }[];
  } | null>(null);
  useEffect(() => {
    void fetch("/api/releases")
      .then((r) => r.json())
      .then(setRelease)
      .catch(() => {});
  }, []);
  return (
    <>
      <section className="panel">
        <h2>Версия приложения</h2>
        <p>
          {release
            ? `${release.version} · ${release.channel === "testing" ? "Тестовая версия" : "Основная версия"} · ${release.commit.slice(0, 8)}`
            : "Загружаем сведения о версии…"}
        </p>
        <p className="muted">
          История меню и рецептов сохраняет ваши данные отдельно от выпусков
          приложения. Возврат сборки выполняется из сохранённых совместимых
          выпусков; восстановление всей БД — отдельная операция.
        </p>
        {release?.releases.map((r) => (
          <div className="list-row" key={r.commit + r.version}>
            <span>
              {r.version} · {r.commit.slice(0, 8)}
            </span>
            <span className="muted">
              {r.schemaVersion === release.schemaVersion
                ? "Совместимый формат данных"
                : "Другой формат данных — требуется проверка совместимости"}
            </span>
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>История утверждённого меню</h2>
        {!state.menuHistory.length && (
          <p className="muted">
            Утвердите меню в пошаговом мастере — здесь появится его сохранённая
            версия.
          </p>
        )}
        {[...state.menuHistory].reverse().map((h) => (
          <div className="list-row" key={h.id}>
            <div>
              <b>{h.label}</b>
              <p className="muted">
                {new Date(h.createdAt).toLocaleString("ru-RU")} ·{" "}
                {Object.values(h.draft.choices)
                  .map((c) => c.recipe.name)
                  .join(" / ")}
              </p>
            </div>
            <button
              className="secondary"
              onClick={() => {
                if (
                  !confirm(
                    "Создать редактируемую копию сохранённого меню? Текущий черновик будет заменён.",
                  )
                )
                  return;
                update((s) => ({
                  ...s,
                  wizard: {
                    ...structuredClone(h.draft),
                    id: crypto.randomUUID(),
                    step: 4,
                  },
                }));
                goPlan();
              }}
            >
              <RotateCcw size={15} />
              Вернуть копию
            </button>
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>Предыдущие редакции рецептов</h2>
        <p className="muted">
          Перед сохранением изменений приложение сохраняет прежний состав.
          Восстановление не переписывает блюда в уже утверждённом меню.
        </p>
        {!state.recipeHistory.length && (
          <p className="muted">
            Здесь появятся версии после первого изменения рецепта.
          </p>
        )}
        {[...state.recipeHistory].reverse().map((h) => (
          <div className="list-row" key={h.id}>
            <div>
              <b>{h.recipe.name}</b>
              <small className="block muted">
                {new Date(h.createdAt).toLocaleString("ru-RU")}
              </small>
            </div>
            <div className="actions">
              <button className="text-btn" onClick={() => onRecipe(h.recipe)}>
                Посмотреть
              </button>
              <button
                className="secondary"
                onClick={() => {
                  if (
                    !confirm(
                      "Восстановить эту редакцию в книге рецептов? Текущая редакция также останется в истории.",
                    )
                  )
                    return;
                  update((s) => ({
                    ...s,
                    recipes: [
                      ...s.recipes.filter((r) => r.id !== h.recipe.id),
                      structuredClone(h.recipe),
                    ],
                    hidden: s.hidden.filter((id) => id !== h.recipe.id),
                  }));
                  notify("Редакция восстановлена в книге рецептов.");
                }}
              >
                Восстановить
              </button>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
