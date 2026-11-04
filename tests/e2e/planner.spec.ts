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
async function state(page: Page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("foodlab:v1:local") || "{}"),
  );
}
test("пошаговое меню, партии, история и реальный вес съеденного", async ({
  page,
}) => {
  page.on("dialog", (d) => void d.accept());
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("Меньше думать о еде.")).toBeVisible();
  await nav(page, "Меню на неделю");
  await page
    .getByRole("button", { name: "Составить меню по шагам", exact: true })
    .click();
  await page.getByLabel("Количество дней", { exact: true }).fill("2");
  await page.getByLabel("Человек", { exact: true }).fill("2");
  await page.getByLabel("Калории на день", { exact: true }).fill("2200");
  await page.getByLabel("Белок на день, г", { exact: true }).fill("150");
  await expect(page.locator(".nutrition-strip")).toContainText("235");
  await page
    .getByRole("button", { name: "Выбрать завтрак", exact: true })
    .click();
  for (const slot of ["завтрак", "обед", "ужин"]) {
    await page
      .getByRole("button", { name: "Выбрать блюдо", exact: true })
      .first()
      .click();
    await expect(
      page.getByLabel("Приготовить тарелок в партии", { exact: true }),
    ).toHaveValue("4");
    await page
      .getByRole("button", { name: `Утвердить ${slot}`, exact: true })
      .click();
  }
  const acknowledge = page.getByLabel(
    "Я проверил(а) отклонения по КБЖУ, объёму и хранению",
  );
  if (await acknowledge.isVisible()) await acknowledge.check();
  await page
    .getByRole("button", { name: "Утвердить всё меню", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Меню утверждено и сохранено" }),
  ).toBeVisible();
  await expect
    .poll(async () => (await state(page)).menuHistory?.length)
    .toBe(1);
  let s = await state(page);
  expect(s.version).toBe(2);
  expect(s.plan).toHaveLength(6);
  expect(s.menuHistory[0].draft.people).toBe(2);
  const frozen = s.menuHistory[0].draft.choices["Завтрак"].recipe.name;
  await page
    .getByRole("button", { name: "Рецепт на всю партию", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByLabel("Количество порций", { exact: true }),
  ).toHaveValue("4");
  await expect(
    dialog.getByRole("button", { name: "Изменить", exact: true }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page
    .getByRole("button", { name: "Указать съеденный вес", exact: true })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Готового блюда съедено, г", { exact: true })
    .fill("150");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Сохранить", exact: true })
    .click();
  await expect.poll(async () => (await state(page)).consumed?.length).toBe(1);
  await page.reload();
  await nav(page, "Меню на неделю");
  await expect(
    page.getByRole("heading", { name: "Меню утверждено и сохранено" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Покупки для партий", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Стоимость корзины и упаковки" }),
  ).toBeVisible();
  await expect
    .poll(async () => (await state(page)).shopping?.length)
    .toBeGreaterThan(0);
  await nav(page, "История и версии");
  await expect(page.getByText(frozen, { exact: false })).toBeVisible();
  await page
    .getByRole("button", { name: "Вернуть копию", exact: true })
    .click(); // confirm below is accepted by handler
  expect(errors).toEqual([]);
});
test("цены упаковок, перенос покупки в запасы и бесплатная адаптация", async ({
  page,
}) => {
  page.on("dialog", (d) => void d.accept());
  await page.goto("/");
  await expect(page.getByText("Меньше думать о еде.")).toBeVisible();
  await nav(page, "Список покупок");
  await page.getByRole("button", { name: "Товар", exact: true }).click();
  let d = page.getByRole("dialog");
  await d.getByLabel("Название", { exact: true }).fill("Куриное филе");
  await d.getByLabel("Количество", { exact: true }).fill("700");
  await d
    .getByRole("combobox", { name: "Единица", exact: true })
    .selectOption({ label: "г" });
  await d.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page
    .getByRole("button", { name: "Добавить цену", exact: true })
    .click();
  const form = page.locator(".quote-form");
  await form.getByLabel("Размер упаковки", { exact: true }).fill("500");
  await form.getByLabel("Цена упаковки, ₽", { exact: true }).fill("200");
  await form
    .getByRole("button", { name: "Сохранить цену", exact: true })
    .click();
  await expect(page.locator(".basket-total")).toContainText("400");
  await expect(page.locator(".price-line")).toContainText("остаток 300");
  await page.getByLabel("Куриное филе", { exact: true }).check();
  await page
    .getByRole("button", {
      name: "Добавить купленное в продукты дома",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: "Добавить купленное в продукты дома",
      exact: true,
    })
    .click();
  await nav(page, "Продукты дома");
  await expect(page.getByText("1 000 г", { exact: true })).toBeVisible();
  await nav(page, "Подобрать рецепт");
  await page
    .getByRole("button", {
      name: "Создать новый рецепт или адаптацию",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Собрать адаптацию", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Сохранить и выбрать", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect.poll(async () => (await state(page)).recipes?.length).toBe(1);
  expect((await state(page)).recipes[0].source).toContain("не генерация ИИ");
});
