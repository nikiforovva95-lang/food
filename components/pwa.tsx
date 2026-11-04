"use client";
import { useEffect, useState, useRef } from "react";
export default function Pwa() {
  const requested = useRef(false);
  const [worker, setWorker] = useState<ServiceWorker | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV !== "production"
    )
      return;
    let alive = true,
      reloading = false;
    const changed = () => {
      if (requested.current && !reloading) {
        reloading = true;
        window.location.reload();
      }
    };
    navigator.serviceWorker.addEventListener("controllerchange", changed);
    void navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        if (registration.waiting && alive) setWorker(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const next = registration.installing;
          next?.addEventListener("statechange", () => {
            if (
              alive &&
              next.state === "installed" &&
              navigator.serviceWorker.controller
            )
              setWorker(next);
          });
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
      navigator.serviceWorker.removeEventListener("controllerchange", changed);
    };
  }, []);
  async function update() {
    if (
      !confirm(
        "Сохраните незавершённые формы. Обновить приложение после сохранения текущих данных?",
      )
    )
      return;
    const saved = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), 5000);
      window.dispatchEvent(
        new CustomEvent("foodlab:flush", {
          detail: {
            done: (ok: boolean) => {
              clearTimeout(timeout);
              resolve(ok);
            },
          },
        }),
      );
    });
    if (!saved) {
      setError(
        "Обновление отложено: данные ещё не сохранены. Проверьте соединение и статус сохранения.",
      );
      return;
    }
    requested.current = true;
    worker?.postMessage({ type: "SKIP_WAITING" });
  }
  return worker ? (
    <div className="pwa-update" role="status">
      <span>Доступна новая версия FoodLab</span>
      <button className="secondary" onClick={() => void update()}>
        Сохранить и обновить
      </button>
      {error && <small>{error}</small>}
    </div>
  ) : null;
}
