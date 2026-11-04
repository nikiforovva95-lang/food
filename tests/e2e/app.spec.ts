import { test, expect, Page } from "@playwright/test";
async function nav(page: Page, label: string) {
  if (
    await page
      .getByRole("button", { name: "Открыть меню", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Открыть меню", exact: true })
      .click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: label, exact: true })
    .click();
}
test("каталог, обратная связь, порции, план, покупки и сохранение", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("Меньше думать о еде.")).toBeVisible();
  await nav(page, "Подобрать рецепт");
  await expect(page.locator(".recipe-card")).toHaveCount(20);
  await page
    .getByPlaceholder("Найти своё любимое блюдо…")
    .fill("Курица с булгуром");
  await page
    .getByRole("button", { name: "Курица с булгуром и овощами", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Количество порций", { exact: true }).fill("4");
  await expect(
    dialog.locator(".ingredient-list").getByText("680 г", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "В избранное", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Нравится", exact: true }).click();
  await dialog.getByRole("button", { name: "В меню", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Сохранить", exact: true })
    .click();
  await nav(page, "Меню на неделю");
  await expect(page.locator(".meal-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Собрать покупки", exact: true })
    .click();
  await nav(page, "Список покупок");
  await expect(page.getByText("Куриное филе", { exact: true })).toBeVisible();
  await page.getByLabel("Куриное филе", { exact: true }).check();
  await expect
    .poll(async () =>
      page.evaluate(() =>
        JSON.parse(
          localStorage.getItem("foodlab:v1:local") || "{}",
        ).shopping?.some((x: { checked: boolean }) => x.checked),
      ),
    )
    .toBe(true);
  await page.reload();
  await nav(page, "Список покупок");
  await expect(page.getByLabel("Куриное филе", { exact: true })).toBeChecked();
  await nav(page, "Мои рецепты");
  await expect(page.locator(".recipe-card")).toHaveCount(1);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("CRUD запасов и ручных товаров, профиль и рецепт", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Меньше думать о еде.")).toBeVisible();
  await nav(page, "Продукты дома");
  await page
    .getByRole("button", { name: "Добавить продукт", exact: true })
    .click();
  let d = page.getByRole("dialog");
  await d.getByLabel("Название", { exact: true }).fill("Куриное филе");
  await d.getByLabel("Количество", { exact: true }).fill("500");
  await d.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Куриное филе" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Изменить", exact: true }).click();
  d = page.getByRole("dialog");
  await d.getByLabel("Количество", { exact: true }).fill("300");
  await d.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByText("300 г", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Удалить Куриное филе", exact: true })
    .click();
  await expect(page.locator(".pantry-card")).toHaveCount(0);
  await nav(page, "Список покупок");
  await page.getByRole("button", { name: "Товар", exact: true }).click();
  d = page.getByRole("dialog");
  await d.getByLabel("Название", { exact: true }).fill("Яблоки");
  await d.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.getByRole("button", { name: "1 шт", exact: true }).click();
  d = page.getByRole("dialog");
  await d.getByLabel("Количество", { exact: true }).fill("3");
  await d.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "3 шт", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Удалить Яблоки", exact: true })
    .click();
  await nav(page, "Профиль и настройки");
  await page.getByLabel("Как вас зовут").fill("Анна");
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("foodlab:v1:local") || "{}").profile
            ?.name,
      ),
    )
    .toBe("Анна");
  await page.reload();
  await nav(page, "Профиль и настройки");
  await expect(page.getByLabel("Как вас зовут")).toHaveValue("Анна");
  await nav(page, "Подобрать рецепт");
  await page.getByRole("button", { name: "Мой рецепт", exact: true }).click();
  d = page.getByRole("dialog");
  await d.getByRole("button", { name: "Изменить", exact: true }).click();
  await d.getByLabel("Название рецепта", { exact: true }).fill("Мой омлет");
  await d
    .getByRole("button", { name: "Сохранить рецепт", exact: true })
    .click();
  await expect(
    d.getByRole("heading", { name: "Мой омлет", exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await d
    .getByRole("button", { name: "Удалить из каталога", exact: true })
    .click();
  await expect(d).not.toBeVisible();
});
test("автоплан, фактическое питание и PWA", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByText("Меньше думать о еде.")).toBeVisible();
  await nav(page, "Меню на неделю");
  await page
    .getByRole("button", { name: "Предложить меню", exact: true })
    .click();
  await expect(page.getByText("12 порций", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Съедено сегодня", exact: true })
    .first()
    .click();
  await nav(page, "Главная");
  await expect(page.locator(".stat-value").first()).not.toHaveText(/^0\//);
  await expect(page.getByText("Удалённый рецепт")).toHaveCount(0);
  const manifest = await page.request.get("/manifest.webmanifest");
  expect((await manifest.json()).display).toBe("standalone");
  await expect
    .poll(() =>
      page.evaluate(async () =>
        Boolean(await navigator.serviceWorker.getRegistration()),
      ),
    )
    .toBe(true);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Питаться хорошо — проще, чем кажется" }),
  ).toBeVisible();
  await context.setOffline(false);
});
