import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

async function connect(page: import("@playwright/test").Page, fail = false) {
  await page.route("https://api.bryanlab.ovh/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/client/me") return route.fulfill({ status: 401, json: {} });
    if (path === "/admin/session")
      return route.fulfill({ json: { authenticated: true } });
    if (path === "/admin/tenants")
      return route.fulfill({
        status: fail ? 503 : 200,
        json: fail
          ? {}
          : [
              {
                id: "11111111-1111-4111-8111-111111111111",
                name: "Tenant réel test",
                slug: "test",
                status: "active",
              },
            ],
      });
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto("/");
}
test("real registry, explicit demo, tenant context and disabled runtime", async ({
  page,
}) => {
  await connect(page);
  await expect(
    page.getByText("Données réelles · registre Syncoria"),
  ).toBeVisible();
  await expect(
    page.getByText("Tenant réel test", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Non évalué", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Démo synthétique" }).click();
  await expect(page.getByText("synthetic/demo", { exact: true })).toBeVisible();
  await expect(page.getByText("50", { exact: true })).toBeVisible();
  await mkdir("docs/screenshots/control-plane", { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: "docs/screenshots/control-plane/overview.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /Novalia Démo/ }).click();
  await expect(
    page.getByRole("heading", { name: "Novalia Démo", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Analyser les erreurs de l’agent" }),
  ).toHaveCount(1);
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: "docs/screenshots/control-plane/tenant.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Explorer avec le chat" }).click();
  await expect(page.getByRole("combobox")).toHaveValue("demo:1");
  await expect(
    page.getByText("1 actions dans ce contexte. Aucun autre tenant inclus."),
  ).toBeVisible();
  await expect(page.getByRole("textbox")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Envoi indisponible" }),
  ).toBeDisabled();
  await page.getByRole("combobox").selectOption("demo:2");
  await expect(page.getByText("Atelier Boréal · synthetic/demo")).toBeVisible();
  await page.getByRole("button", { name: "Registre réel" }).click();
  await expect(page.getByRole("combobox")).toHaveValue("");
});
test("registry error never silently substitutes fixtures", async ({ page }) => {
  await connect(page, true);
  await expect(page.getByRole("alert")).toContainText("Registre indisponible");
  await expect(page.getByText("Novalia Démo", { exact: true })).toHaveCount(0);
});
test("mobile fleet remains usable without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await connect(page);
  await page.getByRole("button", { name: "Démo synthétique" }).click();
  await expect(
    page.getByRole("heading", { name: "Vue globale", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: "docs/screenshots/control-plane/mobile.png",
    fullPage: true,
  });
});
