"use client";
import { useEffect, useState } from "react";
import { Sparkles, Plus } from "lucide-react";
import { supabase } from "@/lib/storage";
import { allRecipes } from "@/lib/domain";
import { adaptRecipe, type Adaptation } from "@/lib/recipe-adaptation";
import { recipeSchema } from "@/lib/validation";
import type { FoodState, MenuDraft, Recipe, Slot } from "@/lib/types";
export function GeneratorPanel({
  state,
  slot = "Обед",
  draft = null,
  update,
  onRecipe,
  notify,
}: {
  state: FoodState;
  slot?: Slot;
  draft?: MenuDraft | null;
  update: (f: (s: FoodState) => FoodState) => void;
  onRecipe: (r: Recipe) => void;
  notify: (m: string) => void;
}) {
  const options = allRecipes(state).filter((r) => r.category === slot);
  const [open, setOpen] = useState(false),
    [mode, setMode] = useState<"local" | "ai">("local"),
    [base, setBase] = useState(""),
    [kind, setKind] = useState<Adaptation>("yogurt"),
    [prompt, setPrompt] = useState(""),
    [configured, setConfigured] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [proposal, setProposal] = useState<Recipe | null>(null);
  useEffect(() => {
    void fetch("/api/ai")
      .then((r) => r.json())
      .then((d) => setConfigured(d.configured === true))
      .catch(() => setConfigured(false));
  }, []);
  async function generate() {
    setError("");
    setProposal(null);
    setBusy(true);
    try {
      if (mode === "local") {
        const r = options.find((r) => r.id === base) ?? options[0];
        if (!r) throw Error("Сначала добавьте рецепт этой категории.");
        setProposal(
          adaptRecipe(r, kind, {
            ...state.profile,
            equipment: draft?.equipment ?? state.profile.equipment,
          }),
        );
      } else {
        const { data } = (await supabase?.auth.getSession()) ?? {
          data: { session: null },
        };
        if (!data.session)
          throw Error("Войдите в профиль, чтобы использовать ИИ.");
        const response = await fetch("/api/ai", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${data.session.access_token}`,
          },
          body: JSON.stringify({ prompt, slot, profile: state.profile, draft }),
        });
        const dataBody = await response.json();
        if (!response.ok) throw Error(dataBody.error || "ИИ недоступен");
        setProposal(recipeSchema.parse(dataBody.recipe));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать рецепт");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel generator-panel">
      <button className="text-btn" onClick={() => setOpen(!open)}>
        <Sparkles size={17} />
        {open
          ? "Скрыть создание рецепта"
          : "Создать новый рецепт или адаптацию"}
      </button>
      {open && (
        <>
          <h3>Расширяйте свою кулинарную книгу</h3>
          <div className="tabs">
            <button
              className={mode === "local" ? "active" : ""}
              onClick={() => setMode("local")}
            >
              Адаптация без ИИ
            </button>
            <button
              className={mode === "ai" ? "active" : ""}
              onClick={() => setMode("ai")}
            >
              Генерация с ИИ
            </button>
          </div>
          {mode === "local" ? (
            <div className="form-grid">
              <label>
                Основной рецепт
                <select
                  value={base || options[0]?.id || ""}
                  onChange={(e) => setBase(e.target.value)}
                >
                  {options.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Что изменить
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as Adaptation)}
                >
                  <option value="yogurt">Добавить йогуртовый соус</option>
                  <option value="lemon">Добавить лимон и тимьян</option>
                  <option value="vegetables">Свежий овощной гарнир</option>
                </select>
              </label>
            </div>
          ) : (
            <>
              <label>
                Какое блюдо хочется?
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  maxLength={2000}
                  placeholder="Например, сочный ужин из индейки без острого, на две порции…"
                />
              </label>
              <p className="muted">
                Учитываются ограничения профиля и кухня текущего плана. Пищевая
                ценность требует проверки. До 10 новых запросов в день на
                аккаунт.
              </p>
              {!configured && (
                <p className="notice">
                  ИИ пока не подключён: требуется серверный API-ключ. Адаптации
                  и добавление собственных рецептов работают без него.
                </p>
              )}
            </>
          )}
          <button
            className="primary"
            disabled={
              busy ||
              (mode === "ai" && (!configured || prompt.trim().length < 5))
            }
            onClick={() => void generate()}
          >
            <Sparkles size={16} />
            {busy
              ? "Готовим предложение…"
              : mode === "ai"
                ? "Предложить с ИИ"
                : "Собрать адаптацию"}
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {proposal && (
            <div className="proposal">
              <h3>{proposal.name}</h3>
              <p>{proposal.description}</p>
              <p className="muted">{proposal.source}</p>
              <details>
                <summary>Проверить состав и шаги</summary>
                <ul>
                  {proposal.ingredients.map((i, j) => (
                    <li key={j}>
                      {i.name}: {i.amount} {i.unit}
                    </li>
                  ))}
                </ul>
                <ol>
                  {proposal.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </details>
              <button
                className="secondary"
                onClick={() => {
                  update((s) => ({ ...s, recipes: [...s.recipes, proposal] }));
                  onRecipe(proposal);
                  setProposal(null);
                  notify("Новый рецепт сохранён в вашей книге.");
                }}
              >
                <Plus size={16} />
                Сохранить и выбрать
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
