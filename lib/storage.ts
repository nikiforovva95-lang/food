"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { initialState, allRecipes } from "./domain";
import { stateSchema, readState } from "./validation";
import type { FoodState } from "./types";
export let supabase: SupabaseClient | null = null;
export let passwordAuth = false;
export let releaseChannel = "testing";
let initialization: Promise<void> | null = null;
function initializeSupabase() {
  if (!initialization)
    initialization = (async () => {
      let config;
      try {
        const response = await fetch("/api/config", { cache: "no-store" });
        if (!response.ok) throw Error();
        config = await response.json();
        try {
          localStorage.setItem("foodlab:public-config", JSON.stringify(config));
        } catch {}
      } catch {
        const cached = localStorage.getItem("foodlab:public-config");
        if (!cached) throw Error("Для первого запуска подключитесь к сети.");
        config = JSON.parse(cached);
      }
      passwordAuth = config.passwordAuth;
      releaseChannel = config.channel;
      if (config.configured) {
        const url = config.url.startsWith("/")
          ? window.location.origin + config.url
          : config.url;
        supabase = createClient(url, config.anonKey);
      }
    })().catch((error) => {
      initialization = null;
      throw error;
    });
  return initialization;
}
const localKey = "foodlab:v1:local";
function readLocal() {
  const raw = localStorage.getItem(localKey);
  return raw ? readState(JSON.parse(raw)) : initialState();
}
export function useFoodState() {
  const [state, setState] = useState<FoodState>(initialState),
    [ready, setReady] = useState(false),
    [user, setUser] = useState<string | null>(null),
    [status, setStatus] = useState("Загрузка…"),
    [error, setError] = useState("");
  const rowVersion = useRef<number | null>(null);
  const owner = useRef<string | null>(null),
    epoch = useRef(0),
    latest = useRef(state),
    dirty = useRef(false),
    queue = useRef<Promise<unknown>>(Promise.resolve());
  latest.current = state;
  useEffect(() => {
    let alive = true;
    async function load(id: string | null) {
      const e = ++epoch.current;
      setReady(false);
      owner.current = id;
      rowVersion.current = null;
      setUser(id);
      dirty.current = false;
      try {
        let next: FoodState;
        if (id && supabase) {
          const { data, error } = await supabase
            .from("foodlab_states")
            .select("payload, revision")
            .eq("user_id", id)
            .maybeSingle();
          if (error) throw error;
          next = data ? readState(data.payload) : initialState();
          rowVersion.current = data?.revision ?? null;
        } else next = readLocal();
        if (alive && e === epoch.current) {
          setState(next);
          setStatus(id ? "Облако подключено" : "Сохранено на устройстве");
          setReady(true);
        }
      } catch (err) {
        if (alive && e === epoch.current) {
          setError(
            `Не удалось загрузить данные: ${err instanceof Error ? err.message : "проверьте Supabase и схему"}. Запись приостановлена.`,
          );
          setStatus("Ошибка загрузки");
        }
      }
    }
    let unsubscribe = () => {};
    void (async () => {
      try {
        await initializeSupabase();
        if (!alive) return;
        await load(null);
        if (!alive) return;
        const subscription = supabase?.auth.onAuthStateChange(
          (event, session) => {
            if (
              event === "TOKEN_REFRESHED" ||
              (event === "SIGNED_IN" && session?.user.id === owner.current)
            )
              return;
            setTimeout(() => {
              if (alive) void load(session?.user.id ?? null);
            }, 0);
          },
        );
        unsubscribe = () => subscription?.data.subscription.unsubscribe();
      } catch (err) {
        if (alive) {
          setError(
            err instanceof Error
              ? err.message
              : "Не удалось открыть приложение",
          );
          setStatus("Ошибка конфигурации");
        }
      }
    })();
    return () => {
      alive = false;
      epoch.current++;
      unsubscribe();
    };
  }, []);
  const persist = useCallback(
    async (value: FoodState, id: string | null, e: number) => {
      try {
        stateSchema.parse(value);
        if (id && supabase) {
          const expected = rowVersion.current;
          const operation =
            expected === null
              ? supabase
                  .from("foodlab_states")
                  .insert({ user_id: id, payload: value })
              : supabase
                  .from("foodlab_states")
                  .update({ payload: value })
                  .eq("user_id", id)
                  .eq("revision", expected);
          const { data, error } = await operation
            .select("revision")
            .maybeSingle();
          if (error) throw error;
          if (!data)
            throw Error(
              "Данные изменились на другом устройстве. Экспортируйте свои правки и обновите страницу перед продолжением.",
            );
          rowVersion.current = data.revision;
        } else localStorage.setItem(localKey, JSON.stringify(value));
        if (e === epoch.current) {
          setStatus(id ? "Сохранено в облаке" : "Сохранено на устройстве");
          if (latest.current === value) dirty.current = false;
          setError("");
        }
        return true;
      } catch (err) {
        if (e === epoch.current) {
          setStatus("Не сохранено");
          setError(
            `Ошибка сохранения: ${err instanceof Error ? err.message : "хранилище недоступно"}. Скачайте резервную копию.`,
          );
        }
        return false;
      }
    },
    [],
  );
  useEffect(() => {
    if (!ready || !dirty.current) return;
    setStatus("Сохранение…");
    const id = owner.current,
      e = epoch.current;
    const t = setTimeout(() => {
      queue.current = queue.current.then(() => persist(state, id, e));
    }, 350);
    return () => clearTimeout(t);
  }, [state, ready, persist]);
  useEffect(() => {
    function flush() {
      if (dirty.current && ready && !owner.current) {
        try {
          localStorage.setItem(localKey, JSON.stringify(latest.current));
        } catch {
          /* UI already offers export */
        }
      }
    }
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [ready]);
  const update = useCallback((change: (s: FoodState) => FoodState) => {
    setState((old) => {
      const changed = change(old);
      const previous = allRecipes({ ...old, hidden: [] });
      const edits = changed.recipes.flatMap((r) => {
        const before = previous.find((x) => x.id === r.id);
        return before && JSON.stringify(before) !== JSON.stringify(r)
          ? [
              {
                id: crypto.randomUUID(),
                createdAt: new Date().toISOString(),
                recipe: structuredClone(before),
              },
            ]
          : [];
      });
      const next = stateSchema.parse({
        ...changed,
        recipeHistory: [...changed.recipeHistory, ...edits],
      });
      dirty.current = true;
      return next;
    });
  }, []);
  const saveNow = async () => {
    await queue.current;
    if (!dirty.current) return true;
    return await persist(latest.current, owner.current, epoch.current);
  };
  useEffect(() => {
    const handler = (event: Event) => {
      const done = (event as CustomEvent<{ done: (ok: boolean) => void }>)
        .detail?.done;
      if (!done) return;
      void (async () => {
        if (!ready) {
          done(false);
          return;
        }
        await queue.current;
        done(
          !dirty.current ||
            (await persist(latest.current, owner.current, epoch.current)),
        );
      })();
    };
    window.addEventListener("foodlab:flush", handler);
    return () => window.removeEventListener("foodlab:flush", handler);
  }, [ready, persist]);
  const recoverLocal = () => {
    if (owner.current) return;
    try {
      const raw = localStorage.getItem(localKey);
      if (raw) localStorage.setItem(`${localKey}:recovery:${Date.now()}`, raw);
      dirty.current = true;
      setState(initialState());
      setError("");
      setReady(true);
    } catch {
      setError(
        "Не удалось создать резервную копию повреждённых данных. Освободите место в браузере.",
      );
    }
  };
  return {
    state,
    update,
    ready,
    user,
    status,
    error,
    setError,
    saveNow,
    recoverLocal,
  };
}
