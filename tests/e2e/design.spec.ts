import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("быстрый путь к меню и доступная мобильная навигация", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await page
    .locator(".hero")
    .getByRole("button", { name: "Составить меню", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Неделя с хорошим вкусом" }),
  ).toBeVisible();
  if (isMobile) {
    const tabs = page.getByRole("group", { name: "Быстрые разделы" });
    await tabs.getByRole("button", { name: "Покупки", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Только нужные покупки" }),
    ).toBeVisible();
    await tabs.getByRole("button", { name: "Сегодня", exact: true }).click();
    const open = page.getByRole("button", {
      name: "Открыть меню",
      exact: true,
    });
    await open.click();
    const brand = page.locator(".sidebar .brand");
    await expect(brand).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator(".sidebar-user")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(brand).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(open).toBeFocused();
    await expect(open).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Tab");
    expect(
      await page
        .locator(".sidebar")
        .evaluate((el) => el.contains(document.activeElement)),
    ).toBe(false);
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
});

test("недоступное фото честно обозначено и заменяется после редактирования", async ({
  page,
}) => {
  await page.route("https://images.unsplash.com/**", (route) => route.abort());
  const photo = await readFile("public/food-bowl.png");
  await page.route("**/replacement-food.png", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: photo }),
  );
  await page.goto("/");
  const card = page.locator(".recipe-card").first();
  await expect(card.getByText("Фото пока нет", { exact: true })).toBeVisible();
  await card.locator(".card-title").click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.locator(".detail-photo").getByText("Фото пока нет"),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Изменить", exact: true }).click();
  await dialog
    .getByLabel("Адрес фотографии", { exact: true })
    .fill("/replacement-food.png");
  await dialog
    .getByRole("button", { name: "Сохранить рецепт", exact: true })
    .click();
  await expect(dialog.locator(".detail-photo img")).toBeVisible();
  await expect(dialog.locator(".detail-photo img")).toHaveJSProperty(
    "naturalWidth",
    1536,
  );
});
