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
    page.getByText("Runtime réel indisponible sur les fixtures"),
  ).toBeVisible();
  await expect(page.getByRole("textbox")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Envoi indisponible" }),
  ).toBeDisabled();
  await page.getByRole("combobox").selectOption("demo:2");
  await expect(page.getByRole("combobox")).toHaveValue("demo:2");
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

const estateTenantId = '11111111-1111-4111-8111-111111111111'
const estatePath = `**/admin/control-plane/tenants/${estateTenantId}/estate`
function estateFixture() {
  return {
    tenant: { tenant_id: estateTenantId, slug: 'test', name: 'Tenant réel test', status: 'active' },
    read_at: '2026-10-01T10:00:00Z',
    identities: [], groups: [], identity_groups: [], memberships: [], licenses: [], automations: [], permissions: [], metrics: [], states: [],
  }
}
test('real tenant snapshot keeps missing observations unknown', async ({ page }) => {
  await connect(page)
  await page.route(estatePath, route => route.fulfill({ json: estateFixture() }))
  await page.getByRole('button', { name: /Tenant réel test/ }).click()
  await page.getByRole('button', { name: 'Parc IA', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Parc IA du tenant' })).toBeVisible()
  await expect(page.getByText('Non connecté / non évalué — aucune observation disponible.').first()).toBeVisible()
  await expect(page.getByText('synthetic/demo', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Chat opérateur accessible depuis le cockpit.', { exact: false })).toBeVisible()
})
test('real metrics and qualitative states display their provenance and freshness', async ({ page }) => {
  await connect(page)
  const payload = { ...estateFixture(),
    metrics: [{ signal_id: '22222222-2222-4222-8222-222222222222', tenant_id: estateTenantId, provider: 'openai', kind: 'costs', value: 120, unit: 'EUR', provenance: 'provider', observed_at: '2026-09-30T10:00:00Z' }],
    states: [{ signal_id: '33333333-3333-4333-8333-333333333333', tenant_id: estateTenantId, provider: 'openai', kind: 'service_health', state: 'degraded', provenance: 'syncoria', observed_at: '2026-09-30T10:00:00Z' }],
  }
  await page.route(estatePath, route => route.fulfill({ json: payload }))
  await page.getByRole('button', { name: /Tenant réel test/ }).click()
  await page.getByRole('button', { name: 'Parc IA', exact: true }).click()
  await page.getByText('Mesures agrégées', { exact: true }).click()
  await expect(page.getByText('openai · costs · 120 EUR', { exact: true })).toBeVisible()
  await page.getByText('États qualitatifs', { exact: true }).click()
  await expect(page.getByText('openai · service_health · degraded', { exact: true })).toBeVisible()
  await expect(page.getByText(/Provenance : provider/)).toBeVisible()
  await expect(page.getByText(/Provenance : syncoria/)).toBeVisible()
})
test('fixture provenance in a real snapshot fails closed; demo makes no estate call', async ({ page }) => {
  await connect(page)
  let calls = 0
  await page.route(estatePath, route => {
    calls++
    return route.fulfill({ json: { ...estateFixture(), states: [{ signal_id: '33333333-3333-4333-8333-333333333333', tenant_id: estateTenantId, provider: 'openai', kind: 'service_health', state: 'healthy', provenance: 'synthetic/demo', observed_at: '2026-09-30T10:00:00Z' }] } })
  })
  await page.getByRole('button', { name: /Tenant réel test/ }).click()
  await page.getByRole('button', { name: 'Parc IA', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Parc IA indisponible' })).toBeVisible()
  await page.getByRole('button', { name: 'Démo synthétique' }).click()
  await page.getByRole('button', { name: /Novalia Démo/ }).click()
  await expect(page.getByRole('heading', { name: 'Novalia Démo', exact: true })).toBeVisible()
  expect(calls).toBe(1)
})
