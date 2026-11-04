import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { catalog } from "../lib/catalog";
import { initialState } from "../lib/domain";
vi.mock("../lib/server/auth", () => ({
  authenticatedUser: vi.fn(),
  restUrl: () => "http://database.internal",
}));
vi.mock("../lib/server/http", () => ({ externalFetch: vi.fn() }));
import { authenticatedUser } from "../lib/server/auth";
import { externalFetch } from "../lib/server/http";
import { GET, POST } from "../app/api/ai/route";
function request(profile = initialState().profile) {
  return new NextRequest("http://localhost/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      prompt: "Сочное блюдо " + crypto.randomUUID(),
      slot: "Обед",
      profile,
      draft: null,
    }),
  });
}
describe("Серверный адаптер ИИ без реальных платных запросов", () => {
  beforeEach(() => {
    vi.stubEnv("FOODLAB_AI_KEY", "test-only-not-a-real-key");
    vi.mocked(authenticatedUser).mockResolvedValue({
      id: "test-user",
      token: "Bearer test-only",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(true)));
    vi.mocked(externalFetch).mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("показывает статус без раскрытия ключа", async () => {
    const text = await GET().text();
    expect(text).toContain("configured");
    expect(text).not.toContain("test-only-not-a-real-key");
  });
  it("не вызывает провайдера без аккаунта или ключа", async () => {
    vi.mocked(authenticatedUser).mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    vi.mocked(authenticatedUser).mockResolvedValue({ id: "x", token: "x" });
    vi.stubEnv("FOODLAB_AI_KEY", "");
    expect((await POST(request())).status).toBe(503);
    expect(externalFetch).not.toHaveBeenCalled();
  });
  it("останавливает запрос при исчерпанном серверном лимите", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(false)));
    expect((await POST(request())).status).toBe(429);
    expect(externalFetch).not.toHaveBeenCalled();
  });
  it("отклоняет некорректный ответ провайдера", async () => {
    vi.mocked(externalFetch).mockResolvedValue(
      Response.json({
        output: [
          { content: [{ type: "output_text", text: '{"name":"сломано"}' }] },
        ],
      }),
    );
    expect((await POST(request())).status).toBe(502);
  });
  it("возвращает новый валидный рецепт и помечает оценочные данные", async () => {
    const model = {
      ...catalog[0],
      id: "untrusted-model-id",
      yieldMeasured: true,
      source: "Точно испытано",
      ingredients: catalog[0].ingredients.map((i) => ({
        ...i,
        nutrition: { ...i.nutrition, protein: 999 },
      })),
    };
    vi.mocked(externalFetch).mockResolvedValue(
      Response.json({
        output: [
          { content: [{ type: "output_text", text: JSON.stringify(model) }] },
        ],
      }),
    );
    const response = await POST(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.recipe.id).not.toBe(model.id);
    expect(body.recipe.yieldMeasured).toBe(false);
    expect(body.recipe.source).toContain("Не испытано");
    expect(body.recipe.ingredients[0].nutrition.protein).toBe(
      catalog[0].ingredients[0].nutrition.protein,
    );
  });
  it("не принимает запрещённый состав и выдуманные инструкции Cook4me", async () => {
    const model = { ...catalog[0], equipment: "Tefal Cook4me Touch CY912832" };
    vi.mocked(externalFetch).mockResolvedValue(
      Response.json({
        output: [
          { content: [{ type: "output_text", text: JSON.stringify(model) }] },
        ],
      }),
    );
    expect((await POST(request())).status).toBe(422);
  });
});
