"use client";
import { useMemo, useState } from "react";
import {
  LayoutDashboard,
  Search,
  BookHeart,
  CalendarDays,
  ShoppingBasket,
  Refrigerator,
  Settings2,
  Leaf,
  ChevronRight,
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  Plus,
  Heart,
  Clock,
  ChefHat,
  Check,
  Trash2,
  Sparkles,
  LogOut,
  Download,
  Upload,
  Copy,
  Menu,
  X,
  Flame,
  SlidersHorizontal,
  RefreshCw,
  History,
} from "lucide-react";
import {
  useFoodState,
  supabase,
  passwordAuth,
  releaseChannel,
} from "@/lib/storage";
import {
  allRecipes,
  dateKey,
  emptyFeedback,
  format,
  generateWeek,
  initialState,
  newIngredient,
  portion,
  recommend,
  shoppingFor,
  sumMeals,
  weekDays,
} from "@/lib/domain";
import { stateSchema, readState } from "@/lib/validation";
import type {
  FoodState,
  Meal,
  PantryItem,
  Profile,
  Recipe,
  ShoppingItem,
  Unit,
} from "@/lib/types";
import { MenuBuilder } from "./menu-builder";
import { ShoppingPrices } from "./shopping-prices";
import { GeneratorPanel } from "./recipe-generator";
import { VersionHistory } from "./version-history";
import { targets, consumeOne, recipeForMeal } from "@/lib/planning";
import { purchasedToPantry } from "@/lib/inventory";
import { RecipeDialog } from "./recipe-dialog";
const nav = [
  ["home", "Главная", LayoutDashboard],
  ["discover", "Подобрать рецепт", Search],
  ["saved", "Мои рецепты", BookHeart],
  ["plan", "Меню на неделю", CalendarDays],
  ["shopping", "Список покупок", ShoppingBasket],
  ["pantry", "Продукты дома", Refrigerator],
  ["profile", "Профиль и настройки", Settings2],
  ["history", "История и версии", History],
] as const;
type Page = (typeof nav)[number][0];
const headings: Record<Page, [string, string]> = {
  history: [
    "Всё важное можно вернуть",
    "Сохранённые меню, редакции рецептов и версии приложения.",
  ],
  home: [
    "Питаться хорошо — проще, чем кажется",
    "Всё для вкусной и сбалансированной недели в одном месте.",
  ],
  discover: [
    "Что приготовим сегодня?",
    "Подбираем рецепты под ваш вкус, технику и ритм жизни.",
  ],
  saved: [
    "Ваша личная кулинарная книга",
    "Любимые блюда, новые открытия и ваши собственные рецепты.",
  ],
  plan: [
    "Неделя с хорошим вкусом",
    "Планируйте основные приёмы пищи и готовьте на несколько порций.",
  ],
  shopping: [
    "Только нужные покупки",
    "Один список для всех блюд. Ничего не забудется.",
  ],
  pantry: [
    "Хорошее уже есть дома",
    "Учитывайте запасы и используйте продукты вовремя.",
  ],
  profile: [
    "Всё начинается с вас",
    "Настройте цели, предпочтения и вашу кухню.",
  ],
};
function shortDate(s: string) {
  return new Date(s + "T12:00:00").toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
}
export default function FoodApp() {
  const [snapshotRecipe, setSnapshotRecipe] = useState<Recipe | null>(null);
  const [partial, setPartial] = useState<{
    meal: Meal;
    grams: number;
    date: string;
  } | null>(null);
  const {
    state,
    update,
    ready,
    user,
    status,
    error,
    setError,
    saveNow,
    recoverLocal,
  } = useFoodState();
  const [page, setPage] = useState<Page>("home"),
    [mobile, setMobile] = useState(false),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("Все рецепты"),
    [onlyFit, setOnlyFit] = useState(true),
    [selected, setSelected] = useState<string | null>(null),
    [toast, setToast] = useState(""),
    [week, setWeek] = useState(0),
    [savedFilter, setSavedFilter] = useState("Избранное");
  const [mealForm, setMealForm] = useState<{
      date: string;
      slot: string;
      recipeId: string;
      servings: number;
      id?: string;
    } | null>(null),
    [pantryForm, setPantryForm] = useState<PantryItem | null>(null),
    [shopForm, setShopForm] = useState<ShoppingItem | null>(null),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [newAccount, setNewAccount] = useState(false),
    [otp, setOtp] = useState(""),
    [authSent, setAuthSent] = useState(false),
    [authBusy, setAuthBusy] = useState(false),
    [equipment, setEquipment] = useState("");
  useEffect(() => {
    if (!mobile) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobile]);
  const recipes = useMemo(() => allRecipes(state), [state]);
  const everyRecipe = useMemo(
    () => allRecipes({ ...state, hidden: [] }),
    [state],
  );
  const ranked = useMemo(() => recommend(state), [state]);
  const days = weekDays(week);
  const weekMeals = state.plan.filter((m) => days.includes(m.date));
  const today = dateKey(new Date());
  const todayPlan = state.plan.filter((m) => m.date === today),
    eaten = state.consumed.filter((m) => m.date === today);
  const eatenTotal = sumMeals(eaten, everyRecipe);
  const recipe = snapshotRecipe ?? recipes.find((r) => r.id === selected);
  function notify(s: string) {
    setToast(s);
    setTimeout(() => setToast(""), 5000);
  }
  function go(p: Page) {
    setPage(p);
    setMobile(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function profile(p: Partial<Profile>) {
    try {
      const next = { ...state.profile, ...p };
      if (next.fatMode === "auto") {
        const t = targets(next.kcal, next.protein, "auto", 0, 0, next.fatShare);
        next.fat = t.fat;
        next.carbs = t.carbs;
      }
      update((s) => ({ ...s, profile: next }));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Проверьте цели");
    }
  }
  function toggleFavorite(id: string) {
    update((s) => ({
      ...s,
      feedback: {
        ...s.feedback,
        [id]: {
          ...emptyFeedback,
          ...s.feedback[id],
          favorite: !s.feedback[id]?.favorite,
        },
      },
    }));
  }
  function deleteRecipe(r: Recipe) {
    if (
      !confirm(
        "Удалить рецепт из каталога и будущего меню? История съеденного останется.",
      )
    )
      return;
    update((s) => ({
      ...s,
      hidden: [...s.hidden, r.id],
      plan: s.plan.filter((m) => m.recipeId !== r.id),
    }));
    setSelected(null);
    notify("Рецепт удалён");
  }
  function addRecipe() {
    const r: Recipe = {
      id: crypto.randomUUID(),
      name: "Мой новый рецепт",
      description: "Ваш семейный рецепт",
      category: "Обед",
      proteinGroup: "Другое",
      minutes: 20,
      difficulty: "Легко",
      equipment: state.profile.equipment[0] ?? "Без нагрева",
      cost: 0,
      servings: 2,
      yield: 200,
      yieldMeasured: false,
      image: "/food-bowl.png",
      ingredients: [newIngredient()],
      steps: ["Добавьте шаги приготовления через кнопку «Изменить»."],
      substitutions: "",
      tags: ["Мой рецепт"],
      allergens: [],
      source: "Пользовательский рецепт. Заполните состав и пищевую ценность.",
    };
    update((s) => ({ ...s, recipes: [...s.recipes, r] }));
    setSelected(r.id);
  }
  function addToShopping(r: Recipe, n: number) {
    const list = shoppingFor(
      [{ id: "", date: today, slot: "", recipeId: r.id, servings: n }],
      [r],
      [],
    );
    update((s) => {
      const merged = [...s.shopping];
      for (const item of list) {
        const index = merged.findIndex(
          (i) =>
            i.name.toLowerCase() === item.name.toLowerCase() &&
            i.unit === item.unit,
        );
        if (index >= 0)
          merged[index] = {
            ...merged[index],
            amount: merged[index].amount + item.amount,
            checked: false,
          };
        else merged.push({ ...item, id: crypto.randomUUID() });
      }
      return { ...s, shopping: merged };
    });
    notify(
      "Ингредиенты добавлены. Запасы вычитаются при сборке списка из меню.",
    );
  }
  function createShopping() {
    if (!weekMeals.length) {
      notify("Сначала добавьте блюда в выбранную неделю");
      return;
    }
    if (
      state.shopping.length &&
      !confirm(
        "Заменить текущий список покупок списком из меню? Ручные товары и отметки будут заменены.",
      )
    )
      return;
    update((s) => ({
      ...s,
      shopping: shoppingFor(weekMeals, everyRecipe, s.pantry),
    }));
    notify(
      "Список собран. Неистёкшие запасы в тех же единицах вычтены один раз.",
    );
  }
  function autoPlan() {
    const result = generateWeek(state, days);
    if (!result.meals.length) {
      notify(result.warnings.join(" "));
      return;
    }
    if (
      weekMeals.length &&
      !confirm("Заменить блюда выбранной недели новым меню?")
    )
      return;
    update((s) => ({
      ...s,
      plan: [...s.plan.filter((m) => !days.includes(m.date)), ...result.meals],
    }));
    notify(result.warnings.join(" "));
  }
  function exportData() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `foodlab-${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  async function importData(file: File) {
    try {
      if (file.size > 5_000_000) throw Error("Файл больше 5 МБ");
      const data = readState(JSON.parse(await file.text()));
      if (confirm("Заменить текущие данные резервной копией?")) {
        update(() => data);
        notify("Копия загружена");
      }
    } catch {
      setError(
        "Не удалось импортировать файл. Нужна корректная резервная копия FoodLab версии 1 или 2.",
      );
    }
  }
  async function passwordLogin() {
    if (!supabase) return;
    setAuthBusy(true);
    try {
      const result = newAccount
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (!result.data.session)
        throw Error(
          "Аккаунт создан, но вход требует подтверждения. Проверьте настройки авторизации.",
        );
      setPassword("");
      setError("");
      notify(
        newAccount
          ? "Аккаунт создан, облачное хранение включено"
          : "Вход выполнен",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось войти");
    } finally {
      setAuthBusy(false);
    }
  }
  async function auth() {
    if (!supabase) return;
    setAuthBusy(true);
    try {
      const result = authSent
        ? await supabase.auth.verifyOtp({ email, token: otp, type: "email" })
        : await supabase.auth.signInWithOtp({
            email,
            options: {
              emailRedirectTo: window.location.origin,
              shouldCreateUser: true,
            },
          });
      if (result.error) throw result.error;
      if (authSent) {
        notify("Вход выполнен");
        setAuthSent(false);
        setOtp("");
      } else {
        setAuthSent(true);
        notify("Проверьте почту: откройте ссылку или введите код");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось войти");
    } finally {
      setAuthBusy(false);
    }
  }
  const displayRecipes = (
    page === "discover"
      ? onlyFit
        ? ranked.map((x) => x.recipe)
        : recipes
      : recipes.filter((r) =>
          savedFilter === "Избранное"
            ? state.feedback[r.id]?.favorite
            : savedFilter === "Хочу попробовать"
              ? state.feedback[r.id]?.reaction === "try"
              : savedFilter === "Приготовлено"
                ? state.feedback[r.id]?.cooked
                : state.recipes.some((x) => x.id === r.id),
        )
  ).filter(
    (r) =>
      (category === "Все рецепты" || r.category === category) &&
      r.name.toLowerCase().includes(query.toLowerCase()),
  );
  function card(r: Recipe, reason?: string) {
    const n = portion(r);
    return (
      <article className="recipe-card" key={r.id}>
        <div className="card-image">
          <button
            onClick={() => setSelected(r.id)}
            aria-label={`Открыть ${r.name}`}
            className="image-link"
          >
            <img
              src={r.image}
              alt={r.name}
              loading="lazy"
              onError={(e) => {
                if (!e.currentTarget.src.endsWith("/food-bowl.png"))
                  e.currentTarget.src = "/food-bowl.png";
              }}
            />
          </button>
          <span className="image-tag">{r.tags[0] ?? r.category}</span>
          <button
            className={`favorite-btn ${state.feedback[r.id]?.favorite ? "favorited" : ""}`}
            aria-label={`Избранное: ${r.name}`}
            aria-pressed={!!state.feedback[r.id]?.favorite}
            onClick={() => toggleFavorite(r.id)}
          >
            <Heart
              size={18}
              fill={state.feedback[r.id]?.favorite ? "currentColor" : "none"}
            />
          </button>
        </div>
        <div className="card-body">
          <div className="card-meta">
            <span>
              <Clock size={13} />
              {r.minutes} мин
            </span>
            <span>•</span>
            <span>{r.difficulty}</span>
            <span className="price">≈ {format(r.cost / r.servings)} ₽</span>
          </div>
          <button className="card-title" onClick={() => setSelected(r.id)}>
            {r.name}
          </button>
          <p className="card-equipment">{r.equipment}</p>
          <div className="card-nutrition">
            <span>
              <Flame size={14} />
              <b>{Math.round(n.kcal)}</b> ккал
            </span>
            <span className="protein">
              <b>{Math.round(n.protein)} г</b> белка
            </span>
            <span>
              Ж {Math.round(n.fat)} · У {Math.round(n.carbs)}
            </span>
          </div>
          {reason && (
            <p className="reason">
              <Sparkles size={13} />
              {reason}
            </p>
          )}
        </div>
      </article>
    );
  }
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("home");
          }}
        >
          <span className="brand-mark">
            <Leaf size={24} />
          </span>
          Food<span>Lab</span>
          <span className="brand-dot">®</span>
        </a>
        <p className="brand-caption">Еда, которая подходит вам</p>
        <button
          className="icon-btn mobile-close"
          onClick={() => setMobile(false)}
          aria-label="Закрыть меню"
        >
          <X />
        </button>
        <nav aria-label="Основная навигация">
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              aria-label={label}
              onClick={() => go(id)}
              className={`nav-link ${page === id ? "active" : ""}`}
              aria-current={page === id ? "page" : undefined}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "shopping" &&
                state.shopping.filter((x) => !x.checked).length > 0 && (
                  <b className="nav-count">
                    {state.shopping.filter((x) => !x.checked).length}
                  </b>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar-tip">
          <div className="tip-icon">
            <Leaf size={20} />
          </div>
          <strong>
            Маленькие шаги.
            <br />
            Большие перемены.
          </strong>
          <p>Сбалансированное питание начинается с одного блюда.</p>
          <button onClick={() => go("discover")}>
            Найти своё блюдо <ArrowUpRight size={15} />
          </button>
        </div>
        <button className="sidebar-user" onClick={() => go("profile")}>
          <span className="avatar">
            {state.profile.name.slice(0, 1) || "В"}
          </span>
          <span>
            <b>{state.profile.name || "Ваш профиль"}</b>
            <small>{user ? "Облачный профиль" : "Личный профиль"}</small>
          </span>
          <Settings2 size={17} />
        </button>
      </aside>
      {mobile && (
        <button
          className="sidebar-overlay"
          aria-label="Закрыть меню"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="actions">
            <button
              className="icon-btn mobile-menu"
              onClick={() => setMobile(true)}
              aria-label="Открыть меню"
            >
              <Menu />
            </button>
            <span className="breadcrumb">
              {releaseChannel === "testing" && (
                <span className="tag testing-label">ТЕСТОВАЯ</span>
              )}
              Моё пространство <ChevronRight size={13} />
              <b>{nav.find((n) => n[0] === page)?.[1]}</b>
            </span>
          </div>
          <div className="actions">
            <span className="save-status">
              <i className={status === "Не сохранено" ? "bad" : ""} />
              {status}
            </span>
            <button
              className="avatar small"
              aria-label="Профиль"
              onClick={() => go("profile")}
            >
              {state.profile.name.slice(0, 1) || "В"}
            </button>
          </div>
        </header>
        <main>
          <div className="page-intro">
            <div>
              <p className="eyebrow">
                {page === "home"
                  ? new Date().toLocaleDateString("ru-RU", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })
                  : "ВАШ FOODLAB"}
              </p>
              {page === "home" && (
                <p className="hello">
                  Хорошего дня, {state.profile.name || "друг"} <span>☀</span>
                </p>
              )}
              <h1>{headings[page][0]}</h1>
              <p className="subtitle">{headings[page][1]}</p>
            </div>
            {page === "home" && (
              <button className="secondary" onClick={() => go("profile")}>
                <SlidersHorizontal size={16} />
                Мои предпочтения
              </button>
            )}
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
              <button className="text-btn" onClick={exportData}>
                Скачать копию
              </button>
              {ready && (
                <button className="text-btn" onClick={() => void saveNow()}>
                  Повторить сохранение
                </button>
              )}
            </div>
          )}
          {!ready ? (
            <div className="empty">
              <Leaf size={32} />
              <h3>{error ? "Данные недоступны" : "Открываем вашу кухню…"}</h3>
              <p>
                При ошибке облачного профиля можно выйти, чтобы вернуться к
                локальным данным.
              </p>
              {supabase && (
                <button
                  className="secondary"
                  onClick={() => void supabase?.auth.signOut()}
                >
                  Выйти
                </button>
              )}
              {error && !user && (
                <button
                  className="secondary"
                  onClick={() => {
                    if (
                      confirm(
                        "Создать новый локальный профиль? Повреждённый документ останется в localStorage с суффиксом recovery.",
                      )
                    )
                      recoverLocal();
                  }}
                >
                  Восстановить локальный профиль
                </button>
              )}
            </div>
          ) : (
            <>
              {page === "home" && (
                <>
                  <section className="hero">
                    <div className="hero-content">
                      <span className="hero-label">
                        <Sparkles size={13} />
                        ПИТАНИЕ В ВАШЕМ РИТМЕ
                      </span>
                      <h2>
                        Меньше думать о еде.
                        <br />
                        Больше наслаждаться.
                      </h2>
                      <p>
                        Рецепты под ваши цели. Меню без суеты.
                        <br />И только нужные продукты в корзине.
                      </p>
                      <button
                        className="primary"
                        onClick={() => go("discover")}
                      >
                        Подобрать рецепт <ArrowRight size={17} />
                      </button>
                      <div className="hero-foot">
                        <span className="mini-dot" />С учётом ваших вкусов и
                        техники
                      </div>
                    </div>
                    <div className="hero-image">
                      <img
                        src="/food-bowl.png"
                        alt="Свежая тарелка с овощами и крупой"
                      />
                      <div className="hero-float">
                        <span className="float-icon">
                          <Leaf size={19} />
                        </span>
                        <div>
                          <b>Баланс в каждой тарелке</b>
                          <small>Просто. Вкусно. По-вашему.</small>
                        </div>
                      </div>
                    </div>
                  </section>
                  <section className="stats-grid">
                    {[
                      {
                        label: "Калории сегодня",
                        value: Math.round(eatenTotal.kcal),
                        target: state.profile.kcal,
                        unit: "ккал",
                        color: "orange",
                        key: "kcal",
                      },
                      {
                        label: "Белки сегодня",
                        value: Math.round(eatenTotal.protein),
                        target: state.profile.protein,
                        unit: "г",
                        color: "green",
                        key: "protein",
                      },
                      {
                        label: "Порций на неделю",
                        value: weekMeals.reduce((n, m) => n + m.servings, 0),
                        target: state.profile.weeklyServings,
                        unit: "порций",
                        color: "blue",
                        key: "portions",
                      },
                    ].map((x) => (
                      <div className={`stat-card ${x.color}`} key={x.key}>
                        <div className="actions between">
                          <span>{x.label}</span>
                          {x.key === "kcal" ? (
                            <Flame size={18} />
                          ) : x.key === "protein" ? (
                            <Leaf size={18} />
                          ) : (
                            <CalendarDays size={18} />
                          )}
                        </div>
                        <div className="stat-value">
                          {x.value}
                          <small>
                            / {x.target} {x.unit}
                          </small>
                        </div>
                        <div className="progress">
                          <span
                            style={{
                              width: `${Math.min(100, (x.value / x.target) * 100)}%`,
                            }}
                          />
                        </div>
                        <small>
                          {x.key === "portions"
                            ? "Запланировано, ещё не съедено"
                            : "Только отмеченное как съеденное"}
                        </small>
                      </div>
                    ))}
                  </section>
                  <section>
                    <div className="section-heading">
                      <div>
                        <h2>
                          Вам может понравиться{" "}
                          <span className="tag">Подобрано для вас</span>
                        </h2>
                        <p>С учётом предпочтений и вашей обратной связи</p>
                      </div>
                      <button
                        className="text-btn"
                        onClick={() => go("discover")}
                      >
                        Все рецепты <ArrowRight size={16} />
                      </button>
                    </div>
                    <div className="recipe-grid">
                      {ranked.slice(0, 3).map((x) => card(x.recipe, x.reason))}
                    </div>
                    {!ranked.length && (
                      <Empty text="Нет подходящих рецептов. Проверьте ограничения в профиле." />
                    )}
                  </section>
                  <section className="home-bottom">
                    <div className="panel">
                      <div className="section-heading">
                        <h2>Сегодня в меню</h2>
                        <button className="text-btn" onClick={() => go("plan")}>
                          Открыть план <ArrowRight size={15} />
                        </button>
                      </div>
                      {todayPlan.length ? (
                        todayPlan.map((m) => (
                          <MealRow
                            key={m.id}
                            meal={m}
                            recipe={recipeForMeal(m, everyRecipe)}
                            onOpen={() =>
                              m.recipeSnapshot
                                ? setSnapshotRecipe(m.recipeSnapshot)
                                : setSelected(m.recipeId)
                            }
                            onEat={() => {
                              update((s) => ({
                                ...s,
                                consumed: [
                                  ...s.consumed,
                                  consumeOne(
                                    {
                                      ...m,
                                      recipeSnapshot: recipeForMeal(
                                        m,
                                        everyRecipe,
                                      ),
                                    },
                                    today,
                                  ),
                                ],
                              }));
                              notify("Записано как съеденное сегодня");
                            }}
                          />
                        ))
                      ) : (
                        <Empty
                          text="Пока без плана. Выберите блюда — мы поможем с остальным."
                          action={() => go("plan")}
                          label="Составить меню"
                        />
                      )}
                    </div>
                    <div className="green-panel">
                      <span className="eyebrow">НАЧНИТЕ С МАЛЕНЬКОГО</span>
                      <h2>
                        Ваша кухня —<br />
                        ваши возможности.
                      </h2>
                      <p>
                        Добавьте продукты, которые уже есть дома. Подскажем, что
                        с ними приготовить.
                      </p>
                      <button
                        className="secondary"
                        onClick={() => go("pantry")}
                      >
                        Мои продукты <ArrowRight size={16} />
                      </button>
                      <Refrigerator className="decor-icon" size={94} />
                    </div>
                  </section>
                  <section className="panel">
                    <div className="section-heading">
                      <h2>Съедено сегодня</h2>
                      <span className="muted">
                        Жиры {format(eatenTotal.fat)} г · Углеводы{" "}
                        {format(eatenTotal.carbs)} г
                      </span>
                    </div>
                    {eaten.length ? (
                      eaten.map((m) => (
                        <div className="list-row" key={m.id}>
                          <span>
                            {everyRecipe.find((r) => r.id === m.recipeId)
                              ?.name ?? "Удалённый рецепт"}{" "}
                            · {m.servings} порц.
                          </span>
                          <button
                            className="icon-btn"
                            aria-label="Удалить запись о съеденном"
                            onClick={() =>
                              update((s) => ({
                                ...s,
                                consumed: s.consumed.filter(
                                  (x) => x.id !== m.id,
                                ),
                              }))
                            }
                          >
                            <Trash2 size={17} />
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="muted">
                        Записей пока нет. Кнопка «Съедено» у блюда в меню
                        добавит запись; приготовление само по себе её не
                        создаёт.
                      </p>
                    )}
                  </section>
                </>
              )}
              {(page === "discover" || page === "saved") && (
                <>
                  {page === "discover" && (
                    <GeneratorPanel
                      state={state}
                      slot={
                        category === "Завтрак"
                          ? "Завтрак"
                          : category === "Ужин"
                            ? "Ужин"
                            : "Обед"
                      }
                      update={update}
                      onRecipe={(r) => setSelected(r.id)}
                      notify={notify}
                    />
                  )}
                  <div className="toolbar">
                    <label className="search-field">
                      <Search size={18} />
                      <input
                        placeholder="Найти своё любимое блюдо…"
                        aria-label="Поиск рецептов"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    <button className="primary" onClick={addRecipe}>
                      <Plus size={17} />
                      Мой рецепт
                    </button>
                  </div>
                  {page === "saved" && (
                    <div className="tabs">
                      {[
                        "Избранное",
                        "Хочу попробовать",
                        "Приготовлено",
                        "Мои изменения",
                      ].map((x) => (
                        <button
                          key={x}
                          className={savedFilter === x ? "active" : ""}
                          onClick={() => setSavedFilter(x)}
                        >
                          {x}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="filter-row">
                    <div className="actions">
                      {["Все рецепты", "Завтрак", "Обед", "Ужин"].map((x) => (
                        <button
                          key={x}
                          className={`chip ${category === x ? "active" : ""}`}
                          onClick={() => setCategory(x)}
                        >
                          {x}
                        </button>
                      ))}
                    </div>
                    {page === "discover" && (
                      <label className="check-line">
                        <input
                          type="checkbox"
                          checked={onlyFit}
                          onChange={(e) => setOnlyFit(e.target.checked)}
                        />
                        Под мои предпочтения
                      </label>
                    )}
                  </div>
                  <p className="muted">
                    Найдено: {displayRecipes.length} · КБЖУ, выход и цены
                    стартового каталога — оценки. Фото иллюстративные.
                  </p>
                  <div className="recipe-grid">
                    {displayRecipes.map((r) =>
                      card(r, ranked.find((x) => x.recipe.id === r.id)?.reason),
                    )}
                  </div>
                  {!displayRecipes.length && (
                    <Empty text="Здесь пока пусто. Попробуйте изменить поиск или сохраните рецепт из каталога." />
                  )}
                </>
              )}
              {page === "plan" && (
                <>
                  <MenuBuilder
                    state={state}
                    update={update}
                    notify={notify}
                    goShopping={() => go("shopping")}
                  />
                  <div className="toolbar">
                    <div className="actions">
                      <button
                        className="icon-btn"
                        aria-label="Предыдущая неделя"
                        onClick={() => setWeek(week - 1)}
                      >
                        <ArrowLeft size={18} />
                      </button>
                      <b>
                        {shortDate(days[0])} — {shortDate(days[6])}
                      </b>
                      <button
                        className="icon-btn"
                        aria-label="Следующая неделя"
                        onClick={() => setWeek(week + 1)}
                      >
                        <ArrowRight size={18} />
                      </button>
                    </div>
                    <div className="actions">
                      <button className="secondary" onClick={createShopping}>
                        <ShoppingBasket size={16} />
                        Собрать покупки
                      </button>
                      <button className="primary" onClick={autoPlan}>
                        <Sparkles size={16} />
                        Предложить меню
                      </button>
                    </div>
                  </div>
                  <p className="notice">
                    План — это намерение, а не дневник питания. Автоподбор
                    распределяет {state.profile.weeklyServings} порций основных
                    блюд, учитывает предпочтения, ориентир калорий, белка и
                    бюджет. Это не полный суточный рацион.
                  </p>
                  <div className="week-grid">
                    {days.map((date) => (
                      <section
                        key={date}
                        className={`day-card ${date === today ? "today" : ""}`}
                      >
                        <div className="day-heading">
                          <b>
                            {new Date(date + "T12:00:00").toLocaleDateString(
                              "ru-RU",
                              { weekday: "short" },
                            )}
                          </b>
                          <span>{shortDate(date)}</span>
                        </div>
                        {state.plan
                          .filter((m) => m.date === date)
                          .map((m) => {
                            const r = recipeForMeal(m, everyRecipe);
                            return (
                              <div className="meal-card" key={m.id}>
                                <small>
                                  {m.slot} · {m.servings} порц.
                                </small>
                                <button
                                  className="meal-title"
                                  onClick={() =>
                                    m.recipeSnapshot
                                      ? setSnapshotRecipe(m.recipeSnapshot)
                                      : setSelected(m.recipeId)
                                  }
                                >
                                  {r?.name ?? "Рецепт недоступен"}
                                </button>
                                {r && (
                                  <span>
                                    {Math.round(portion(r).kcal * m.servings)}{" "}
                                    ккал
                                  </span>
                                )}
                                <div className="actions">
                                  <button
                                    className="text-btn"
                                    onClick={() => setMealForm(m)}
                                  >
                                    Изменить
                                  </button>
                                  <button
                                    className="icon-btn"
                                    aria-label="Удалить блюдо из плана"
                                    onClick={() =>
                                      update((s) => ({
                                        ...s,
                                        plan: s.plan.filter(
                                          (x) => x.id !== m.id,
                                        ),
                                      }))
                                    }
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                                <button
                                  className="chip"
                                  onClick={() => {
                                    update((s) => ({
                                      ...s,
                                      consumed: [
                                        ...s.consumed,
                                        consumeOne(
                                          {
                                            ...m,
                                            recipeSnapshot: recipeForMeal(
                                              m,
                                              everyRecipe,
                                            ),
                                          },
                                          today,
                                        ),
                                      ],
                                    }));
                                    notify(
                                      "Записано как съеденное сегодня. План сохранён.",
                                    );
                                  }}
                                >
                                  <Check size={13} />
                                  Съедено сегодня
                                </button>
                                <button
                                  className="text-btn"
                                  onClick={() => {
                                    const r = recipeForMeal(m, everyRecipe);
                                    if (r)
                                      setPartial({
                                        meal: { ...m, recipeSnapshot: r },
                                        grams: Math.round(
                                          ((r.yield / r.servings) *
                                            m.servings) /
                                            (m.people ?? 1),
                                        ),
                                        date: today,
                                      });
                                  }}
                                >
                                  Указать съеденный вес
                                </button>
                              </div>
                            );
                          })}
                        <button
                          className="day-add"
                          onClick={() =>
                            setMealForm({
                              date,
                              slot: "Обед",
                              recipeId: recipes[0]?.id ?? "",
                              servings: 1,
                            })
                          }
                        >
                          <Plus size={16} />
                          Добавить
                        </button>
                        <small className="day-total">
                          В плане:{" "}
                          {Math.round(
                            sumMeals(
                              state.plan.filter((m) => m.date === date),
                              everyRecipe,
                            ).kcal,
                          )}{" "}
                          ккал
                        </small>
                      </section>
                    ))}
                  </div>
                  <div className="panel summary-line">
                    <strong>
                      {weekMeals.reduce((n, m) => n + m.servings, 0)} порций
                    </strong>
                    <span>
                      ≈ {Math.round(sumMeals(weekMeals, everyRecipe).kcal)} ккал
                    </span>
                    <span>
                      Б {format(sumMeals(weekMeals, everyRecipe).protein)} г · Ж{" "}
                      {format(sumMeals(weekMeals, everyRecipe).fat)} г · У{" "}
                      {format(sumMeals(weekMeals, everyRecipe).carbs)} г
                    </span>
                    <span>
                      ≈{" "}
                      {Math.round(
                        weekMeals.reduce((sum, m) => {
                          const r = recipeForMeal(m, everyRecipe);
                          return (
                            sum + (r ? (r.cost / r.servings) * m.servings : 0)
                          );
                        }, 0),
                      )}{" "}
                      ₽ по расходу продуктов
                    </span>
                  </div>
                </>
              )}
              {page === "shopping" && (
                <>
                  <ShoppingPrices
                    state={state}
                    update={update}
                    notify={notify}
                  />
                  <button
                    className="secondary inventory-transfer"
                    onClick={() => {
                      update(purchasedToPantry);
                      notify(
                        "Купленные позиции добавлены в запасы. Повторное нажатие не удваивает количество.",
                      );
                    }}
                  >
                    Добавить купленное в продукты дома
                  </button>
                  <div className="toolbar">
                    <div>
                      <strong>
                        {state.shopping.filter((x) => x.checked).length} из{" "}
                        {state.shopping.length} куплено
                      </strong>
                      <p className="muted">
                        Меню: {shortDate(days[0])} — {shortDate(days[6])}
                      </p>
                    </div>
                    <div className="actions">
                      <button
                        className="secondary"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              state.shopping
                                .map(
                                  (i) =>
                                    `${i.checked ? "☑" : "☐"} ${i.name} — ${format(i.amount)} ${i.unit}`,
                                )
                                .join("\n"),
                            );
                            notify("Список скопирован");
                          } catch {
                            notify(
                              "Браузер запретил копирование. Используйте экспорт данных.",
                            );
                          }
                        }}
                      >
                        <Copy size={16} />
                        Копировать
                      </button>
                      <button className="secondary" onClick={createShopping}>
                        <RefreshCw size={16} />
                        Из меню
                      </button>
                      <button
                        className="primary"
                        onClick={() =>
                          setShopForm({
                            id: crypto.randomUUID(),
                            name: "",
                            amount: 1,
                            unit: "шт",
                            category: "Другое",
                            checked: false,
                          })
                        }
                      >
                        <Plus size={16} />
                        Товар
                      </button>
                    </div>
                  </div>
                  <p className="notice">
                    При сборке из меню одинаковые продукты объединяются по
                    названию и единице. Запасы с истёкшим сроком не вычитаются.
                    Граммы, миллилитры и штуки не переводятся друг в друга без
                    данных о массе.
                  </p>
                  {[...new Set(state.shopping.map((x) => x.category))].map(
                    (group) => (
                      <section className="panel shopping-group" key={group}>
                        <h3>{group}</h3>
                        {state.shopping
                          .filter((x) => x.category === group)
                          .map((i) => (
                            <div
                              className={`list-row ${i.checked ? "checked" : ""}`}
                              key={i.id}
                            >
                              <label className="check-line">
                                <input
                                  type="checkbox"
                                  checked={i.checked}
                                  onChange={() =>
                                    update((s) => ({
                                      ...s,
                                      shopping: s.shopping.map((x) =>
                                        x.id === i.id
                                          ? { ...x, checked: !x.checked }
                                          : x,
                                      ),
                                    }))
                                  }
                                />
                                <span>{i.name}</span>
                              </label>
                              <div className="actions">
                                <button
                                  className="amount-btn"
                                  onClick={() => setShopForm(i)}
                                >
                                  {format(i.amount)} {i.unit}
                                </button>
                                <button
                                  className="icon-btn"
                                  aria-label={`Удалить ${i.name}`}
                                  onClick={() =>
                                    update((s) => ({
                                      ...s,
                                      shopping: s.shopping.filter(
                                        (x) => x.id !== i.id,
                                      ),
                                    }))
                                  }
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          ))}
                      </section>
                    ),
                  )}
                  {!state.shopping.length && (
                    <Empty text="Список свободен. Соберите его из меню или добавьте товар вручную." />
                  )}
                </>
              )}
              {page === "pantry" && (
                <>
                  <div className="toolbar">
                    <p className="muted">
                      {state.pantry.length} продуктов дома · Названия должны
                      совпадать с ингредиентами рецептов
                    </p>
                    <button
                      className="primary"
                      onClick={() =>
                        setPantryForm({
                          id: crypto.randomUUID(),
                          name: "",
                          amount: 100,
                          unit: "г",
                          expires: "",
                        })
                      }
                    >
                      <Plus size={16} />
                      Добавить продукт
                    </button>
                  </div>
                  <datalist id="ingredient-names">
                    {[
                      ...new Set(
                        recipes.flatMap((r) =>
                          r.ingredients.map((i) => i.name),
                        ),
                      ),
                    ].map((x) => (
                      <option key={x} value={x} />
                    ))}
                  </datalist>
                  <div className="pantry-grid">
                    {state.pantry.map((i) => (
                      <section className="panel pantry-card" key={i.id}>
                        <div className="pantry-symbol">
                          <Refrigerator size={23} />
                        </div>
                        <h3>{i.name}</h3>
                        <p>
                          {format(i.amount)} {i.unit}
                        </p>
                        <small
                          className={
                            i.expires && i.expires < today ? "danger" : "muted"
                          }
                        >
                          {i.expires
                            ? `Годен до ${shortDate(i.expires)}${i.expires < today ? " · срок истёк" : ""}`
                            : "Без срока годности"}
                        </small>
                        <div className="actions">
                          <button
                            className="text-btn"
                            onClick={() => setPantryForm(i)}
                          >
                            Изменить
                          </button>
                          <button
                            className="icon-btn"
                            aria-label={`Удалить ${i.name}`}
                            onClick={() =>
                              update((s) => ({
                                ...s,
                                pantry: s.pantry.filter((x) => x.id !== i.id),
                              }))
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </section>
                    ))}
                  </div>
                  {!state.pantry.length && (
                    <Empty text="Что есть в холодильнике? Добавьте первый продукт, чтобы улучшить подбор рецептов." />
                  )}
                </>
              )}
              {page === "history" && (
                <VersionHistory
                  state={state}
                  update={update}
                  notify={notify}
                  goPlan={() => go("plan")}
                  onRecipe={setSnapshotRecipe}
                />
              )}
              {page === "profile" && (
                <>
                  <section className="panel">
                    <div className="section-heading">
                      <div>
                        <h2>Мой профиль</h2>
                        <p>Изменения сохраняются автоматически</p>
                      </div>
                      <span className="tag">
                        {user
                          ? "Приватный облачный профиль"
                          : "Локальный режим"}
                      </span>
                    </div>
                    <div className="form-grid">
                      <label>
                        Как вас зовут
                        <input
                          value={state.profile.name}
                          onChange={(e) => profile({ name: e.target.value })}
                        />
                      </label>
                      <label>
                        Цель питания
                        <input
                          value={state.profile.goal}
                          onChange={(e) => profile({ goal: e.target.value })}
                        />
                      </label>
                      {(
                        [
                          "kcal",
                          "protein",
                          "fat",
                          "carbs",
                          "mealProtein",
                          "weeklyServings",
                          "budget",
                          "maxMinutes",
                          "defaultServings",
                        ] as const
                      ).map((k, i) => (
                        <label key={k}>
                          {
                            [
                              "Калории в день, ккал",
                              "Белки в день, г",
                              "Жиры в день, г",
                              "Углеводы в день, г",
                              "Белок на основной приём, г",
                              "Основных порций в неделю (1–42)",
                              "Бюджет на неделю, ₽",
                              "Максимум минут на блюдо",
                              "Порций для готовки по умолчанию",
                            ][i]
                          }
                          <input
                            type="number"
                            min="1"
                            max={
                              k === "weeklyServings"
                                ? 42
                                : k === "defaultServings"
                                  ? 100
                                  : 1000000
                            }
                            value={state.profile[k]}
                            onChange={(e) => {
                              const value = Number(e.target.value);
                              if (
                                value > 0 &&
                                value <= 1000000 &&
                                (k !== "weeklyServings" ||
                                  (Number.isInteger(value) && value <= 42)) &&
                                (k !== "defaultServings" || value <= 100)
                              )
                                profile({
                                  [k]: value,
                                  ...(k === "fat" || k === "carbs"
                                    ? { fatMode: "manual" as const }
                                    : {}),
                                });
                            }}
                          />
                        </label>
                      ))}
                      <label>
                        Сложность
                        <select
                          value={state.profile.difficulty}
                          onChange={(e) =>
                            profile({ difficulty: e.target.value })
                          }
                        >
                          <option>Любая</option>
                          <option>Легко</option>
                          <option>Средне</option>
                        </select>
                      </label>
                      <label>
                        Нелюбимые продукты через запятую
                        <input
                          value={state.profile.dislikes}
                          onChange={(e) =>
                            profile({ dislikes: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Аллергены через запятую
                        <input
                          placeholder="Молоко, рыба, глютен…"
                          value={state.profile.allergens}
                          onChange={(e) =>
                            profile({ allergens: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Любимые специи
                        <input
                          value={state.profile.spices}
                          onChange={(e) => profile({ spices: e.target.value })}
                        />
                      </label>
                    </div>
                    <label className="check-line">
                      <input
                        type="checkbox"
                        checked={state.profile.noPork}
                        onChange={(e) => profile({ noPork: e.target.checked })}
                      />
                      Предлагать блюда без свинины
                    </label>
                    <p className="muted">
                      По умолчанию — простые быстрые блюда с белком около 40–50
                      г на основную тарелку. Проверяйте состав продукта:
                      текстовый фильтр аллергенов не выявляет следы и
                      перекрёстное загрязнение.
                    </p>
                  </section>
                  <section className="panel">
                    <h2>Предпочтения по порциям и разнообразию</h2>
                    <div className="form-grid">
                      <label>
                        Жиры и углеводы
                        <select
                          value={state.profile.fatMode}
                          onChange={(e) =>
                            profile({
                              fatMode: e.target.value as "auto" | "manual",
                            })
                          }
                        >
                          <option value="auto">
                            Автоматически под калории и белок
                          </option>
                          <option value="manual">Вручную</option>
                        </select>
                      </label>
                      <label>
                        Доля калорий на жиры, %
                        <input
                          type="number"
                          min="15"
                          max="50"
                          value={state.profile.fatShare}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            if (n >= 15 && n <= 50) profile({ fatShare: n });
                          }}
                        />
                      </label>
                      <label>
                        Комфортный вес всей тарелки, г
                        <input
                          type="number"
                          min="150"
                          max="1500"
                          value={state.profile.plateLimit}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            if (n >= 150 && n <= 1500)
                              profile({ plateLimit: n });
                          }}
                        />
                      </label>
                      <label>
                        Новизна рецептов
                        <select
                          value={state.profile.novelty}
                          onChange={(e) =>
                            profile({
                              novelty: e.target.value as Profile["novelty"],
                            })
                          }
                        >
                          <option value="balanced">
                            Баланс знакомого и нового
                          </option>
                          <option value="familiar">Чаще любимые блюда</option>
                          <option value="new">Больше новых вариантов</option>
                        </select>
                      </label>
                    </div>
                    <h2>Моя кухня</h2>
                    <p className="muted">
                      Название техники используется при подборе. Редактирование
                      названия не изменяет технику в уже сохранённых рецептах.
                    </p>
                    {state.profile.equipment.map((item, i) => (
                      <div className="equipment-row" key={i}>
                        <ChefHat size={19} />
                        <input
                          aria-label={`Техника ${i + 1}`}
                          value={item}
                          onChange={(e) =>
                            profile({
                              equipment: state.profile.equipment.map((x, j) =>
                                i === j ? e.target.value : x,
                              ),
                            })
                          }
                        />
                        <button
                          className="icon-btn"
                          aria-label={`Удалить технику ${item}`}
                          onClick={() =>
                            profile({
                              equipment: state.profile.equipment.filter(
                                (_, j) => i !== j,
                              ),
                            })
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    <form
                      className="inline-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (equipment.trim()) {
                          profile({
                            equipment: [
                              ...state.profile.equipment,
                              equipment.trim(),
                            ],
                          });
                          setEquipment("");
                        }
                      }}
                    >
                      <input
                        aria-label="Название новой техники"
                        placeholder="Добавить технику…"
                        value={equipment}
                        onChange={(e) => setEquipment(e.target.value)}
                      />
                      <button className="secondary">
                        <Plus size={16} />
                        Добавить
                      </button>
                    </form>
                  </section>
                  <section className="panel">
                    <h2>Данные и синхронизация</h2>
                    <p className="muted">
                      {user
                        ? "Данные хранятся в Supabase с доступом только для вашего аккаунта. При одновременных изменениях приложение обнаруживает конфликт и предлагает сохранить копию правок перед загрузкой актуальных данных."
                        : "Без входа данные хранятся только в этом браузере. Это не защищённый аккаунт: не используйте локальный режим на общем устройстве. Очистка данных браузера удалит их."}
                    </p>
                    <div className="actions">
                      <button className="secondary" onClick={exportData}>
                        <Download size={16} />
                        Экспорт JSON
                      </button>
                      <label className="secondary file-label">
                        <Upload size={16} />
                        Импорт копии
                        <input
                          type="file"
                          accept="application/json"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void importData(file);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                    {supabase ? (
                      user ? (
                        <div className="actions auth-panel">
                          <span>Аккаунт подключён</span>
                          <button
                            className="secondary"
                            onClick={async () => {
                              if (!(await saveNow())) return;
                              const r = await supabase?.auth.signOut();
                              if (r?.error) setError(r.error.message);
                            }}
                          >
                            <LogOut size={16} />
                            Выйти
                          </button>
                        </div>
                      ) : passwordAuth ? (
                        <form
                          className="auth-panel"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void passwordLogin();
                          }}
                        >
                          <h3>
                            {newAccount
                              ? "Создать личный аккаунт"
                              : "Войти в аккаунт"}
                          </h3>
                          <p>
                            После входа профиль, меню и покупки сохраняются в
                            Supabase. Локальные данные можно перенести через
                            экспорт и импорт копии.
                          </p>
                          <label>
                            Электронная почта
                            <input
                              type="email"
                              required
                              autoComplete="username"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                            />
                          </label>
                          <label>
                            Пароль
                            <input
                              type="password"
                              required
                              minLength={12}
                              autoComplete={
                                newAccount ? "new-password" : "current-password"
                              }
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                            />
                          </label>
                          <p className="muted">
                            Минимум 12 символов. Сохраните пароль:
                            восстановление по почте пока недоступно.
                          </p>
                          <div className="actions">
                            <button className="primary" disabled={authBusy}>
                              {authBusy
                                ? "Подключаем…"
                                : newAccount
                                  ? "Создать аккаунт"
                                  : "Войти"}
                            </button>
                            <button
                              className="text-btn"
                              type="button"
                              onClick={() => {
                                setNewAccount(!newAccount);
                                setPassword("");
                              }}
                            >
                              {newAccount
                                ? "Уже есть аккаунт"
                                : "Зарегистрироваться"}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <form
                          className="auth-panel"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void auth();
                          }}
                        >
                          <p>
                            Войдите по почте. Новый аккаунт начинает с чистого
                            профиля; для переноса локальных данных экспортируйте
                            их и импортируйте после входа.
                          </p>
                          <label>
                            Электронная почта
                            <input
                              type="email"
                              required
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                            />
                          </label>
                          {authSent && (
                            <label>
                              Код из письма
                              <input
                                value={otp}
                                onChange={(e) => setOtp(e.target.value)}
                                autoComplete="one-time-code"
                              />
                            </label>
                          )}
                          <div className="actions">
                            <button className="primary" disabled={authBusy}>
                              {authBusy
                                ? "Отправляем…"
                                : authSent
                                  ? "Подтвердить код"
                                  : "Получить письмо для входа"}
                            </button>
                            {authSent && (
                              <button
                                type="button"
                                className="text-btn"
                                onClick={() => setAuthSent(false)}
                              >
                                Другая почта / повторить
                              </button>
                            )}
                          </div>
                        </form>
                      )
                    ) : (
                      <p className="notice">
                        Облачное хранение не настроено. Укажите публичный URL и
                        anon/publishable ключ Supabase в .env.local и примените
                        supabase/schema.sql. Подробности — в README.
                      </p>
                    )}
                  </section>
                </>
              )}
            </>
          )}
          <footer>
            <span className="footer-brand">
              <Leaf size={14} />
              FoodLab
            </span>
            <span>Еда в гармонии с вами</span>
            <span>Сделано для вашей повседневности</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={19} />
          <span>{toast}</span>
          <button
            className="icon-btn"
            onClick={() => setToast("")}
            aria-label="Закрыть уведомление"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {recipe && ready && (
        <RecipeDialog
          key={recipe.id}
          recipe={recipe}
          state={state}
          readOnly={!!snapshotRecipe}
          close={() => {
            setSelected(null);
            setSnapshotRecipe(null);
          }}
          update={update}
          onShop={addToShopping}
          onPlan={(r, n) => {
            setSelected(null);
            setMealForm({
              date: today,
              slot: "Обед",
              recipeId: r.id,
              servings: n,
            });
          }}
          onDelete={deleteRecipe}
        />
      )}
      {partial && (
        <FormDialog
          title="Фактически съеденная порция"
          close={() => setPartial(null)}
          submit={() => {
            const r = partial.meal.recipeSnapshot!;
            const factor = partial.grams / (r.yield / r.servings);
            if (factor <= 0) throw Error();
            update((s) => ({
              ...s,
              consumed: [
                ...s.consumed,
                {
                  ...partial.meal,
                  id: crypto.randomUUID(),
                  date: partial.date,
                  servings: factor,
                  people: 1,
                },
              ],
            }));
            setPartial(null);
            notify("Съеденный вес записан отдельно от плана.");
          }}
        >
          <label>
            Дата
            <input
              type="date"
              required
              value={partial.date}
              onChange={(e) => setPartial({ ...partial, date: e.target.value })}
            />
          </label>
          <label>
            Готового блюда съедено, г
            <input
              type="number"
              min="1"
              max="3000"
              required
              value={partial.grams}
              onChange={(e) =>
                setPartial({ ...partial, grams: Number(e.target.value) })
              }
            />
          </label>
        </FormDialog>
      )}
      {mealForm && (
        <FormDialog
          title={mealForm.id ? "Изменить блюдо" : "Добавить в меню"}
          close={() => setMealForm(null)}
          submit={() => {
            const meal = {
              ...mealForm,
              id: mealForm.id ?? crypto.randomUUID(),
              recipeSnapshot: recipes.find((r) => r.id === mealForm.recipeId),
              menuId: undefined,
            };
            update((s) => ({
              ...s,
              plan: [...s.plan.filter((x) => x.id !== meal.id), meal],
            }));
            setMealForm(null);
            notify("Меню сохранено");
          }}
        >
          <label>
            Дата
            <input
              required
              type="date"
              value={mealForm.date}
              onChange={(e) =>
                setMealForm({ ...mealForm, date: e.target.value })
              }
            />
          </label>
          <label>
            Приём пищи
            <select
              value={mealForm.slot}
              onChange={(e) =>
                setMealForm({ ...mealForm, slot: e.target.value })
              }
            >
              <option>Завтрак</option>
              <option>Обед</option>
              <option>Ужин</option>
              <option>Перекус</option>
            </select>
          </label>
          <label>
            Рецепт
            <select
              required
              value={mealForm.recipeId}
              onChange={(e) =>
                setMealForm({ ...mealForm, recipeId: e.target.value })
              }
            >
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Количество порций
            <input
              required
              min="0.1"
              max="100"
              step="0.1"
              type="number"
              value={mealForm.servings}
              onChange={(e) =>
                setMealForm({ ...mealForm, servings: Number(e.target.value) })
              }
            />
          </label>
          <p className="muted">
            Для нескольких людей или заготовки увеличьте число порций; все они
            войдут в покупки и сумму КБЖУ плана.
          </p>
        </FormDialog>
      )}
      {pantryForm && (
        <FormDialog
          title="Продукт дома"
          close={() => setPantryForm(null)}
          submit={() => {
            const item = { ...pantryForm, name: pantryForm.name.trim() };
            update((s) => ({
              ...s,
              pantry: [...s.pantry.filter((x) => x.id !== item.id), item],
            }));
            setPantryForm(null);
          }}
        >
          <label>
            Название
            <input
              list="ingredient-names"
              required
              value={pantryForm.name}
              onChange={(e) =>
                setPantryForm({ ...pantryForm, name: e.target.value })
              }
            />
          </label>
          <Quantity
            amount={pantryForm.amount}
            unit={pantryForm.unit}
            change={(amount, unit) =>
              setPantryForm({ ...pantryForm, amount, unit })
            }
          />
          <label>
            Срок годности (необязательно)
            <input
              type="date"
              value={pantryForm.expires}
              onChange={(e) =>
                setPantryForm({ ...pantryForm, expires: e.target.value })
              }
            />
          </label>
        </FormDialog>
      )}
      {shopForm && (
        <FormDialog
          title="Товар в списке"
          close={() => setShopForm(null)}
          submit={() => {
            const item = { ...shopForm, name: shopForm.name.trim() };
            update((s) => ({
              ...s,
              shopping: [...s.shopping.filter((x) => x.id !== item.id), item],
            }));
            setShopForm(null);
          }}
        >
          <label>
            Название
            <input
              required
              value={shopForm.name}
              onChange={(e) =>
                setShopForm({ ...shopForm, name: e.target.value })
              }
            />
          </label>
          <Quantity
            amount={shopForm.amount}
            unit={shopForm.unit}
            change={(amount, unit) =>
              setShopForm({ ...shopForm, amount, unit })
            }
          />
          <label>
            Категория
            <input
              required
              value={shopForm.category}
              onChange={(e) =>
                setShopForm({ ...shopForm, category: e.target.value })
              }
            />
          </label>
        </FormDialog>
      )}
    </div>
  );
}
import { useEffect, useRef } from "react";
function FormDialog({
  title,
  close,
  submit,
  children,
}: {
  title: string;
  close: () => void;
  submit: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} onClose={close} onCancel={close} className="form-dialog">
      <button
        className="icon-btn dialog-close"
        onClick={close}
        aria-label="Закрыть"
      >
        <X />
      </button>
      <h2>{title}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            submit();
          } catch {
            alert(
              "Проверьте поля: нужны непустые названия и положительные количества.",
            );
          }
        }}
      >
        {children}
        <button className="primary" type="submit">
          <Check size={16} />
          Сохранить
        </button>
      </form>
    </dialog>
  );
}
function Quantity({
  amount,
  unit,
  change,
}: {
  amount: number;
  unit: Unit;
  change: (a: number, u: Unit) => void;
}) {
  return (
    <div className="form-grid">
      <label>
        Количество
        <input
          type="number"
          required
          min="0.1"
          max="1000000"
          step="any"
          value={amount}
          onChange={(e) => change(Number(e.target.value), unit)}
        />
      </label>
      <label>
        Единица
        <select
          value={unit}
          onChange={(e) => change(amount, e.target.value as Unit)}
        >
          <option>г</option>
          <option>мл</option>
          <option>шт</option>
        </select>
      </label>
    </div>
  );
}
function Empty({
  text,
  action,
  label,
}: {
  text: string;
  action?: () => void;
  label?: string;
}) {
  return (
    <div className="empty">
      <Leaf size={27} />
      <p>{text}</p>
      {action && (
        <button className="secondary" onClick={action}>
          {label}
          <ArrowRight size={15} />
        </button>
      )}
    </div>
  );
}
function MealRow({
  meal,
  recipe,
  onOpen,
  onEat,
}: {
  meal: Meal;
  recipe?: Recipe;
  onOpen: () => void;
  onEat: () => void;
}) {
  return (
    <div className="meal-row">
      {recipe && (
        <img
          src={recipe.image}
          alt=""
          onError={(e) => {
            if (!e.currentTarget.src.endsWith("/food-bowl.png"))
              e.currentTarget.src = "/food-bowl.png";
          }}
        />
      )}
      <div>
        <small>
          {meal.slot} · {meal.servings} порц.
        </small>
        <button className="meal-title" onClick={onOpen}>
          {recipe?.name ?? "Рецепт недоступен"}
        </button>
      </div>
      <button className="chip" onClick={onEat}>
        <Check size={13} />
        Съедено
      </button>
    </div>
  );
}
